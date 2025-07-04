import logging
import os
import json
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
import tempfile
import shutil
import asyncio

from sagemaker.estimator import Estimator # General purpose Estimator
from sagemaker.inputs import TrainingInput
from sagemaker.image_uris import retrieve as retrieve_sagemaker_image_uri # For built-in framework images
# For Hugging Face specific estimators:
from sagemaker.huggingface import HuggingFace, HuggingFaceModel
# For PyTorch specific estimators:
from sagemaker.pytorch import PyTorch, PyTorchModel
# For TensorFlow specific estimators:
from sagemaker.tensorflow import TensorFlow, TensorFlowModel

import boto3 # For session management

# --- Application Specific Imports ---
import app.ai_training.models as ai_models # SQLAlchemy model
from app.core.enums.ai_training import StorageType, JobStatus
from app.core.constants import (
    SAGEMAKER_DEFAULT_OUTPUT_S3_BUCKET,
    SAGEMAKER_SCRIPT_STAGING_DIR,
    AWS_REGION_MLOPS,
    LOCAL_TRAINING_SCRIPTS_REPO_DIR,
    AWS_ACCESS_KEY_ID_MLOPS,
    AWS_SECRET_ACCESS_KEY_MLOPS,    
)
# from app.ai_training.utils.data_preparation import ... # May need helpers for S3 staging

logger = logging.getLogger(__name__)

# Base S3 bucket for SageMaker outputs (can be configured via settings)
# Example: settings.AWS_SAGEMAKER_DEFAULT_OUTPUT_BUCKET = "my-sagemaker-mlops-output-bucket"

# Directory for staging scripts to S3
SAGEMAKER_SCRIPT_STAGING_DIR = Path(tempfile.gettempdir()) / "sagemaker_script_staging"


def get_sagemaker_session(
    aws_access_key_id: Optional[str] = None,
    aws_secret_access_key: Optional[str] = None,
    aws_session_token: Optional[str] = None, # For temporary credentials
    region_name: Optional[str] = None
) -> boto3.Session:
    """Creates a boto3 session with optional explicit credentials."""
    if aws_access_key_id and aws_secret_access_key:
        return boto3.Session(
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            aws_session_token=aws_session_token,    
            region_name=region_name or AWS_REGION_MLOPS
        )
    else: # Use default credentials chain (env vars, shared creds file, IAM role)
        logger.info(f"Creating boto3 session using default credential chain for region {region_name or AWS_REGION_MLOPS}.")
        return boto3.Session(region_name=region_name or AWS_REGION_MLOPS)


def _prepare_sagemaker_hyperparameters(job_hyperparams: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """
    SageMaker expects all hyperparameters to be strings.
    Converts numeric and boolean values.
    """
    sagemaker_hp = {}
    if job_hyperparams:
        for k, v in job_hyperparams.items():
            if isinstance(v, (dict, list)) or type(v) == bool: # Explicitly dump complex types or bools as JSON strings
                sagemaker_hp[k] = json.dumps(v)
            else: # Convert others to simple strings
                sagemaker_hp[k] = str(v)
    
    # Crucial for Lambda to correlate back to platform job
    sagemaker_hp['_platform_job_id'] = platform_job_id 
    return sagemaker_hp


async def _stage_script_to_s3(
    job_id: str,
    entry_point_name: str, # e.g., "train_text_classifier.py"
    sagemaker_boto_session: boto3.Session,
    s3_bucket: str,
    source_dir_content: Optional[Dict[str, str]] = None, # filename: content for requirements.txt etc.
    s3_prefix: str = "sagemaker_scripts"
) -> str:
    """
    Packages the entry_point script and any additional files in source_dir_content
    into a tar.gz, uploads it to S3, and returns the S3 URI.
    If source_dir_content contains the entry_point_name, it uses that content.
    Otherwise, it looks for entry_point_name in LOCAL_TRAINING_SCRIPTS_REPO_DIR.
    """
    staging_area = SAGEMAKER_SCRIPT_STAGING_DIR / job_id
    script_source_final_dir = staging_area / "source" # SageMaker expects a 'source.tar.gz' often containing a 'source/' dir
    
    if script_source_final_dir.exists():
        await asyncio.to_thread(shutil.rmtree, str(script_source_final_dir))
    await asyncio.to_thread(os.makedirs, str(script_source_final_dir))

    # 1. Place/Create the main entry_point script
    entry_point_content = None
    if source_dir_content and entry_point_name in source_dir_content:
        entry_point_content = source_dir_content.pop(entry_point_name) # Remove so it's not written twice

    if entry_point_content:
        async with aiofiles.open(script_source_final_dir / entry_point_name, "w") as f:
            await f.write(entry_point_content)
    else:
        # Assume script is in LOCAL_TRAINING_SCRIPTS_REPO_DIR
        from app.ai_training.runners.local_script_runner import LOCAL_TRAINING_SCRIPTS_REPO_DIR # Re-use config
        local_script_path = (LOCAL_TRAINING_SCRIPTS_REPO_DIR / entry_point_name).resolve()
        if not local_script_path.is_file():
            raise FileNotFoundError(f"SageMaker entry_point script '{entry_point_name}' not found at {local_script_path} and not provided in source_dir_content.")
        await asyncio.to_thread(shutil.copy2, str(local_script_path), str(script_source_final_dir / entry_point_name))

    # 2. Place/Create other files (e.g., requirements.txt)
    if source_dir_content:
        for filename, content in source_dir_content.items():
            async with aiofiles.open(script_source_final_dir / filename, "w") as f:
                await f.write(content)
    
    # 3. Create tar.gz
    tarball_name = "source.tar.gz"
    tarball_path = staging_area / tarball_name
    
    def _create_tarball():
        import tarfile
        with tarfile.open(tarball_path, "w:gz") as tar:
            # Add files from script_source_final_dir into the tarball, under a 'source/' prefix in the tar
            # Or directly add the directory. SageMaker usually expects /opt/ml/code/entry_point.py
            # If script_source_final_dir is '.../job_id/source', then tarring 'source' from parent dir '.../job_id'
            # will create 'source/entry_point.py' in the tar.
            tar.add(str(script_source_final_dir), arcname=os.path.basename(script_source_final_dir)) # e.g. 'source/script.py'
            # Or if SageMaker framework expects files directly at /opt/ml/code:
            # for item in os.listdir(script_source_final_dir):
            #    tar.add(os.path.join(script_source_final_dir, item), arcname=item)
    await asyncio.to_thread(_create_tarball)

    # 4. Upload to S3
    s3_client = sagemaker_boto_session.client("s3")
    s3_key = f"{s3_prefix.rstrip('/')}/{job_id}/{tarball_name}"
    
    def _upload_to_s3():
        s3_client.upload_file(str(tarball_path), s3_bucket, s3_key)
    await asyncio.to_thread(_upload_to_s3)
    
    s3_uri = f"s3://{s3_bucket}/{s3_key}"
    logger.info(f"[SageMakerRunner job_id={job_id}]: Script bundle uploaded to {s3_uri}")
    
    # Clean up local staging area
    await asyncio.to_thread(shutil.rmtree, str(staging_area))
    return s3_uri


async def submit_sagemaker_training_job(
    job: ai_models.AITrainingJob, # The ORM object
    # db_session_factory: Callable[[], AsyncSession] # If needed for direct DB updates here
) -> Tuple[Optional[str], Optional[str]]: # Returns (sagemaker_job_name, error_message)
    """
    Prepares and submits a training job to AWS SageMaker.
    This function will be called by the main service task.
    """
    logger.info(f"[SageMakerRunner job_id={job.id}]: Preparing SageMaker training job submission.")

    script_config = job.training_script_config or {}
    user_creds = job.user_credential # Assumed to be loaded

    # --- Determine SageMaker Execution Role ---
    sagemaker_role_arn = (user_creds.additional_config.get("sagemaker_role_arn") 
                          if user_creds and user_creds.additional_config 
                          else script_config.get("sagemaker_role_arn"))
    if not sagemaker_role_arn:
        return None, "SageMaker Role ARN not found in user credentials or job script_config."

    # --- Determine AWS Region ---
    aws_region = (user_creds.additional_config.get("region")
                  if user_creds and user_creds.additional_config
                  else AWS_REGION_MLOPS)

    # --- Get Boto3 Session (for SageMaker Python SDK) ---
    # If user provides AWS keys, use them. Otherwise, rely on MLOps system credentials.
    aws_access_key = user_creds.api_key if user_creds and user_creds.api_key else AWS_ACCESS_KEY_ID_MLOPS
    aws_secret_key = user_creds.secret_key if user_creds and user_creds.secret_key else AWS_SECRET_ACCESS_KEY_MLOPS
    
    # Note: If user_creds.api_key/secret_key are temporary STS creds, they might also include a session token.
    # This simplified logic assumes API Key/Secret or MLOps system IAM role.
    # Proper STS token handling might need `aws_session_token` in UserExternalServiceCredential.additional_config.

    try:
        sagemaker_boto_session = await asyncio.to_thread(
            get_sagemaker_session, 
            aws_access_key_id=aws_access_key, 
            aws_secret_access_key=aws_secret_key, 
            region_name=aws_region
        )
        # Verify session (optional)
        sts_client = sagemaker_boto_session.client('sts')
        identity = await asyncio.to_thread(sts_client.get_caller_identity)
        logger.info(f"[SageMakerRunner job_id={job.id}]: Using AWS Identity ARN: {identity['Arn']} in region {aws_region}")

    except Exception as e:
        logger.error(f"[SageMakerRunner job_id={job.id}]: Failed to create AWS session or verify identity: {e}", exc_info=True)
        return None, f"AWS session/identity error: {str(e)}"

    # --- Prepare Training Inputs (S3 Data Location) ---
    if not job.processed_dataset or not job.processed_dataset.storage_url:
        return None, "ProcessedDataset or its storage_url is missing."
    if job.processed_dataset.storage_type != StorageType.S3:
        # If not S3, data needs to be staged to S3 first. This is a complex step.
        # For now, require S3 input for SageMaker.
        # TODO: Implement staging for non-S3 datasets to a temporary S3 location.
        return None, f"Dataset storage type '{job.processed_dataset.storage_type.value}' not S3. Automatic S3 staging not yet implemented."
    
    s3_input_data_uri = job.processed_dataset.storage_url

    # Determine input mode and content type from training_script_config or defaults
    input_mode = script_config.get("sagemaker_input_mode", "File") # Default to File mode
    content_type = script_config.get("sagemaker_input_content_type", None) # e.g., "text/csv"
    distribution = script_config.get("sagemaker_input_distribution", "FullyReplicated") # Or "ShardedByS3Key" for large datasets

    training_input_args = {
        "s3_data": s3_input_data_uri,
        "distribution": distribution,
        "input_mode": input_mode
    }
    if content_type:
        training_input_args["content_type"] = content_type
    # If you have multiple input channels (e.g., train, validation, test)
    # The `inputs` dict would look like:
    # inputs = {
    #    'train': TrainingInput(**training_input_args_for_train_channel),
    #    'validation': TrainingInput(**training_input_args_for_validation_channel)
    # }
    # For now, assuming a single channel named 'training' as per SageMaker default
    inputs = {'training': TrainingInput(**training_input_args)}
    
    # If the script expects data at /opt/ml/input/data (without the channel name 'training'),
    # you might need to adjust how the S3 URI is passed or how the script accesses it.
    # Typically, channel name becomes a sub-directory.
    logger.info(f"[SageMakerRunner job_id={job.id}]: Training data input configuration: {inputs}")
    # If dataset is an HF dataset on S3 (e.g. from save_to_disk), content_type might not be needed, or specific.
    # Example for File mode: inputs = s3_input_data_uri
    # Example for specific channels: inputs = {'train': s3_uri_train, 'validation': s3_uri_validation}

    # --- Prepare Output S3 Location ---
    output_s3_bucket = script_config.get("platform_output_s3_bucket") or SAGEMAKER_DEFAULT_OUTPUT_S3_BUCKET
    if not output_s3_bucket:
        return None, "SageMaker output S3 bucket not configured (platform_output_s3_bucket or system default)."
    output_s3_prefix = script_config.get("platform_output_s3_prefix", f"sagemaker_training_output/{job.id}")
    sagemaker_output_path = f"s3://{output_s3_bucket}/{output_s3_prefix.lstrip('/')}"

    # --- Entry Point and Source Directory ---
    entry_point_script = script_config.get("entry_point") # e.g., "train_text_classifier.py"
    if not entry_point_script:
        return None, "SageMaker 'entry_point' script not specified in training_script_config."
    
    # Handle 'source_dir_content' from script_config if provided (e.g. for dynamic requirements.txt)
    # source_dir_additional_files = script_config.get("source_dir_content", {})
    # For now, we assume entry_point is from LOCAL_TRAINING_SCRIPTS_REPO_DIR and no extra files.
    # A more advanced version would use _stage_script_to_s3
    # For simplicity in this first pass, we can point SageMaker SDK to a local source_dir
    # and it will handle tarring and uploading. This is easier if LOCAL_TRAINING_SCRIPTS_REPO_DIR is accessible.
    
    from app.ai_training.runners.local_script_runner import LOCAL_TRAINING_SCRIPTS_REPO_DIR # Re-use config
    source_dir_path = str(LOCAL_TRAINING_SCRIPTS_REPO_DIR.resolve())
    # Ensure the entry_point exists within this source_dir
    if not (LOCAL_TRAINING_SCRIPTS_REPO_DIR / entry_point_script).is_file():
         return None, f"Entry point script '{entry_point_script}' not found in configured script repo: {source_dir_path}"


    # --- Framework, Version, Instance Type ---
    framework = script_config.get("framework", "pytorch").lower() # e.g., "pytorch", "tensorflow", "huggingface"
    framework_version = script_config.get("framework_version") # e.g., "1.13" for PyTorch
    py_version = script_config.get("python_version", "py39") # e.g., "py38", "py39"
    
    instance_type = script_config.get("instance_type", "ml.m5.large")
    instance_count = script_config.get("instance_count", 1)
    # volume_size_gb = script_config.get("volume_size_gb", 30) # For EBS volume
    # max_run_duration_seconds = script_config.get("max_run_seconds", 3600 * 3) # e.g. 3 hours

    # --- Hyperparameters (must all be strings for SageMaker SDK) ---
    sagemaker_hyperparameters = _prepare_sagemaker_hyperparameters(job.hyperparameters)
    sagemaker_hyperparameters['_platform_job_id'] = job.id 
    # Add training_script_config to hyperparameters so the script can access its own config
    # SageMaker will pass these to the script as command line arguments.
    # Our scripts are designed to take --hyperparameters and --training-script-config separately.
    # So, we will rely on the script config being available via environment variables or a config file if needed.
    # The SageMaker Python SDK Estimators take `hyperparameters` dict directly.
    # The provided training scripts will get these as CLI args.
    # Let's ensure our scripts correctly parse these, or adjust how they are passed.
    # The script expects --hyperparameters and --training-script-config as separate JSON strings.
    # SageMaker's `hyperparameters` argument on Estimator directly becomes CLI args for the script.
    # So, we need to pass them as the SageMaker estimator expects.
    # The most straightforward way is to pass them as SageMaker expects, and have the script adapt.
    # Alternative: customize the `command` in the estimator if using a generic one.
    # For framework estimators, it's simpler to conform to their hyperparameter passing.
    
    # Let's prepare hyperparameters as SageMaker expects them (all strings)
    # And our script needs to be able to handle these stringified JSONs for dicts/lists.
    # The `_prepare_sagemaker_hyperparameters` function already does this.
    
    # Add `training_script_config_json` and `hyperparameters_json` to the sagemaker_hyperparameters
    # So the script can receive them. This is if the script expects these exact names.
    # However, the script from Phase 3 expects --hyperparameters and --training-script-config.
    # SageMaker generic estimator will turn hyperparameters dict keys into --key value.
    # This means we need to ensure the framework estimators for HF/PyTorch behave as expected.

    # For HF/PyTorch estimators, they often handle a `hyperparameters` dict well.
    # The script's argparser needs to match what the SageMaker container environment sets up.
    # Typically, for HF/PyTorch estimators, hyperparameters are passed and available to the script.
    # Let's assume the script args.hyperparameters will get the full dict.
    # The issue is with --training-script-config. This is not a standard SM hyperparameter.
    # We can pass it as another hyperparameter:
    if job.training_script_config:
        sagemaker_hyperparameters['training_script_config_json'] = json.dumps(job.training_script_config)
    # The script would then need to look for `training_script_config_json` in its args if run on SM.
    # This means the script needs to be SageMaker-aware or more flexible in arg parsing.

    # --- Environment Variables (Optional) ---
    environment_vars = script_config.get("environment_variables", {})
    environment_vars['SAGEMAKER_PROGRAM'] = entry_point_script # Often needed if not using 'entry_point' param of Estimator directly
    # environment_vars['HF_MODEL_ID'] = script_config.get("base_model_id") # Example for HF Estimator

    # --- Create SageMaker Estimator ---
    estimator = None
    sagemaker_job_name = f"{job.job_name.replace('_', '-')[:40]}-{job.id[:8]}" # Max 63 chars, unique

    try:
        if framework == "huggingface":
            # Versions for Transformers, PyTorch, Python are important here
            transformers_version = script_config.get("transformers_version", "4.28") # Check latest supported
            pytorch_version = framework_version or "1.13" # HF needs PyTorch or TF
            # py_version already defined

            estimator = HuggingFace(
                entry_point=entry_point_script,
                source_dir=source_dir_path, # Path to local directory with script and requirements.txt
                role=sagemaker_role_arn,
                instance_type=instance_type,
                instance_count=instance_count,
                output_path=sagemaker_output_path, # Where model_data.tar.gz will be stored
                sagemaker_session=None, # Creates one from sagemaker_boto_session by default if not passed
                # boto_session=sagemaker_boto_session, # Pass boto session
                hyperparameters=sagemaker_hyperparameters,
                transformers_version=transformers_version,
                pytorch_version=pytorch_version,
                py_version=py_version,
                environment=environment_vars,
                # image_uri=custom_image_uri, # If using a custom ECR image
                # metric_definitions=[{'Name': 'eval_loss', 'Regex': 'eval_loss: ([0-9\\.]+)'}], # For custom metrics
                # disable_profiler=True,
                # debugger_hook_config=False,
                base_job_name=sagemaker_job_name.rsplit('-',1)[0] # Base for unique job name
            )
        elif framework == "pytorch":
            estimator = PyTorch(
                entry_point=entry_point_script,
                source_dir=source_dir_path,
                role=sagemaker_role_arn,
                instance_type=instance_type,
                instance_count=instance_count,
                output_path=sagemaker_output_path,
                sagemaker_session=None,
                # boto_session=sagemaker_boto_session,
                hyperparameters=sagemaker_hyperparameters,
                framework_version=framework_version or "1.13", # Specify PyTorch version
                py_version=py_version or "py39",
                environment=environment_vars,
                base_job_name=sagemaker_job_name.rsplit('-',1)[0]
            )
        # Add TensorFlow or generic Estimator if needed
        else:
            return None, f"Unsupported SageMaker framework '{framework}' specified."

        logger.info(f"[SageMakerRunner job_id={job.id}]: SageMaker Estimator created for framework '{framework}'.")
        logger.info(f"[SageMakerRunner job_id={job.id}]: Training data input: {inputs}")
        logger.info(f"[SageMakerRunner job_id={job.id}]: Output path: {sagemaker_output_path}")
        logger.info(f"[SageMakerRunner job_id={job.id}]: Hyperparameters for SageMaker: {sagemaker_hyperparameters}")


        # --- Submit Training Job (Non-blocking) ---
        # The fit() method is blocking if wait=True. We want non-blocking.
        # The SDK's fit method directly returns the job name if wait=False.
        # We use asyncio.to_thread to run the blocking SDK call in a separate thread.
        def _run_fit():
            estimator.fit(inputs, wait=False, job_name=sagemaker_job_name) # Returns None if wait=False
            # The actual job name is estimator.latest_training_job.job_name
            # but we passed it explicitly, so it should be sagemaker_job_name
            # However, to be safe, one might call describe_training_job after a short delay.
            # For now, rely on the passed job_name.

        await asyncio.to_thread(_run_fit)
        
        # The job is now submitted. SageMaker will assign its own unique name if we didn't provide one,
        # or use the one we provided if it's unique.
        # The actual sagemaker job name can be retrieved from estimator.latest_training_job.job_name
        # but this might not be populated immediately if fit() is truly async in its call.
        # The `job_name` argument to `fit()` should ensure it's used.

        logger.info(f"[SageMakerRunner job_id={job.id}]: SageMaker training job '{sagemaker_job_name}' submitted.")
        return sagemaker_job_name, None # Return the name we told SageMaker to use

    except Exception as e:
        logger.error(f"[SageMakerRunner job_id={job.id}]: Failed to submit SageMaker training job: {e}", exc_info=True)
        return None, f"SageMaker job submission error: {str(e)}"