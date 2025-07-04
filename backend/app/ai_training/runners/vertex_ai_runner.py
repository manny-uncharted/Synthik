import logging
import os
import json
from typing import Dict, Any, Optional, Tuple, List
from pathlib import Path
import asyncio

from google.cloud import aiplatform
from google.oauth2 import service_account # For explicit key file usage
from google.protobuf import json_format
from google.protobuf.struct_pb2 import Value

# --- Application Specific Imports ---
import app.ai_training.models as ai_models # SQLAlchemy model
from app.core.enums.ai_training import StorageType, JobStatus
# from app.core.config import settings
from app.core.constants import (
    GCP_VERTEX_AI_DEFAULT_STAGING_BUCKET,
    GCP_SERVICE_ACCOUNT_KEY_PATH_MLOPS,
    GCP_PROJECT_ID_MLOPS,
)
from app.ai_training.runners.local_script_runner import LOCAL_TRAINING_SCRIPTS_REPO_DIR

logger = logging.getLogger(__name__)

# Default GCS bucket for Vertex AI staging and outputs (can be configured via settings)
VERTEX_AI_DEFAULT_STAGING_GCS_BUCKET = GCP_VERTEX_AI_DEFAULT_STAGING_BUCKET
# Example: settings.GCP_VERTEX_AI_DEFAULT_STAGING_BUCKET = "my-vertex-ai-mlops-staging-bucket"


def get_vertex_ai_credentials() -> Optional[service_account.Credentials]:
    """
    Retrieves GCP credentials.
    Uses explicit key file path from settings if provided, otherwise relies on ADC.
    """
    key_path = GCP_SERVICE_ACCOUNT_KEY_PATH_MLOPS
    if key_path:
        if not os.path.exists(key_path):
            logger.error(f"GCP Service Account Key file not found at: {key_path}")
            return None
        try:
            logger.info(f"Using GCP Service Account Key from: {key_path}")
            return service_account.Credentials.from_service_account_file(key_path)
        except Exception as e:
            logger.error(f"Failed to load GCP credentials from {key_path}: {e}", exc_info=True)
            return None
    else:
        logger.info("Using Application Default Credentials (ADC) for GCP.")
        # For ADC, no explicit credentials object is returned here; SDK handles it.
        return None # SDK will use ADC


def _build_vertex_ai_worker_pool_spec(
    job: ai_models.AITrainingJob,
    script_config: Dict[str, Any],
    training_package_gcs_uri: Optional[str], # GCS URI to custom Python package
    python_module_name: Optional[str] # e.g., "trainer.task"
) -> List[Dict[str, Any]]:
    """Builds the worker_pool_specs for a Vertex AI CustomJob."""
    
    # Container spec: Use a pre-built Vertex AI training container or a custom container
    container_image_uri = script_config.get("vertex_ai_container_image_uri")
    if not container_image_uri:
        # Fallback to a standard Vertex AI pre-built container based on framework
        framework = script_config.get("framework", "pytorch").lower()
        framework_version = script_config.get("framework_version", "1.13") # Adjust for TF/other
        python_version_short = script_config.get("python_version", "3.9").replace('.', '') # e.g. 39 -> 3.9 for some images
        # Example: us-docker.pkg.dev/vertex-ai/training/pytorch-gpu.1-13.py39:latest (check for current URIs)
        # This needs to be robustly determined.
        # For now, require vertex_ai_container_image_uri to be specified.
        raise ValueError("vertex_ai_container_image_uri must be specified in training_script_config for Vertex AI.")

    # Machine spec
    machine_type = script_config.get("instance_type", "n1-standard-4") # Vertex AI machine type
    accelerator_type = script_config.get("accelerator_type", None) # e.g., "NVIDIA_TESLA_T4"
    accelerator_count = int(script_config.get("accelerator_count", 0))

    # Prepare command-line arguments for the training script
    # Vertex AI passes 'args' to the container.
    # Our scripts expect: --data-input-dir, --model-output-dir, --hyperparameters, --training-script-config
    # Vertex AI sets env vars like AIP_DATA_FORMAT, AIP_TRAINING_DATA_URI, AIP_VALIDATION_DATA_URI, AIP_TEST_DATA_URI, AIP_MODEL_DIR.
    
    args_for_script = []
    # AIP_MODEL_DIR is where Vertex expects output, maps to --model-output-dir
    # AIP_TRAINING_DATA_URI maps to --data-input-dir (if single GCS URI)
    # The script needs to be adapted to read from these environment variables if they are set by the container,
    # or we pass them explicitly. Let's stick to explicit passing to re-use the script.
    
    # Data input dir: Vertex AI will make data available. If GCS URI, it's often passed via AIP_TRAINING_DATA_URI.
    # The container might download it or mount it. For custom containers, you control this.
    # For pre-built, it depends on the framework.
    # Let's assume data path on container will be /gcs/<bucket>/<path> or similar if mounted,
    # or a local path if downloaded by framework.
    # For now, we'll pass the GCS URI and let the script handle it (e.g. via gcsfs or HF datasets).
    # This requires the training script to be GCS-aware if input is GCS.
    args_for_script.extend(["--data-input-dir", job.processed_dataset.storage_url if job.processed_dataset else "gs://dummy/data"])
    
    # Model output dir: Vertex AI provides AIP_MODEL_DIR. Our script should use this.
    # We don't pass it as arg if script reads AIP_MODEL_DIR.
    # If we want to force the script, pass it:
    # args_for_script.extend(["--model-output-dir", "/opt/ml/model"]) # or some conventional path if not using AIP_MODEL_DIR

    args_for_script.extend(["--hyperparameters", json.dumps(job.hyperparameters or {})])
    args_for_script.extend(["--training-script-config", json.dumps(script_config or {})])


    worker_pool_spec = {
        "machine_spec": {
            "machine_type": machine_type,
        },
        "replica_count": 1, # For single-node training. For distributed, this changes.
        "disk_spec": { # Optional, for boot disk or local SSD
            "boot_disk_type": "pd-ssd",
            "boot_disk_size_gb": int(script_config.get("volume_size_gb", 100)),
        }
    }
    if accelerator_type and accelerator_count > 0:
        worker_pool_spec["machine_spec"]["accelerator_type"] = f"ACCELERATOR_TYPE_UNSPECIFIED/{accelerator_type}" if '/' not in accelerator_type else accelerator_type # Newer versions might require full path
        worker_pool_spec["machine_spec"]["accelerator_count"] = accelerator_count

    if training_package_gcs_uri and python_module_name: # Using a Python package
        worker_pool_spec["python_package_spec"] = {
            "executor_image_uri": container_image_uri, # Base container
            "package_uris": [training_package_gcs_uri],
            "python_module": python_module_name, # e.g., "trainer.task"
            "args": args_for_script,
        }
    else: # Assuming script is part of a custom container_image_uri
         worker_pool_spec["container_spec"] = {
            "image_uri": container_image_uri,
            "command": script_config.get("vertex_ai_container_command", []), # e.g., ["python", "my_script.py"]
            "args": args_for_script if not script_config.get("vertex_ai_container_command") else [], # Args go here if no command override
        }
         # If command is specified, args are passed to that command.
         # If script is baked into container and uses ENTRYPOINT, args are passed to entrypoint.

    return [worker_pool_spec]


async def _stage_python_package_to_gcs(
    job_id: str,
    entry_point_name: str, # e.g., "train_text_classifier.py" -> becomes part of module path like trainer.task
    script_module_name: str, # e.g., "task.py" if entry_point is "trainer/task.py"
    gcs_bucket_name: str,
    requirements_content: Optional[str] = None,
    setup_py_content: Optional[str] = None, # Content for setup.py
    gcs_prefix: str = "vertex_ai_custom_packages",
    gcp_project_id: Optional[str] = None,
    gcp_credentials: Optional[service_account.Credentials] = None
) -> str:
    """
    Packages the entry_point script (and optionally requirements.txt, setup.py)
    into a Python source distribution (.tar.gz), uploads it to GCS, and returns the GCS URI.
    The package structure should be:
    my_package_job_id/
        setup.py
        trainer/  (or your chosen top-level module name)
            __init__.py (can be empty)
            task.py     (your entry_point_script, renamed to task.py or similar)
        requirements.txt (optional)
    Python module name for Vertex AI would be "trainer.task".
    """
    base_staging_dir = Path(tempfile.mkdtemp(prefix=f"vertex_pkg_staging_{job_id}_"))
    package_name = f"training_package_{job_id.replace('-', '_')}" # Pythonic package name
    package_root_dir = base_staging_dir / package_name

    # Determine the module path from entry_point_name
    # e.g., if entry_point_name is "train_text_classifier.py", module is "train_text_classifier"
    # if "trainer/task.py", module is "trainer.task"
    # For simplicity, assume entry_point_name is like "script.py" and it becomes "trainer/script_module_name.py"
    top_module_name = script_config.get("vertex_ai_python_module_top_dir", "trainer") # e.g. "trainer"
    module_dir = package_root_dir / top_module_name
    await asyncio.to_thread(os.makedirs, str(module_dir))

    # Create __init__.py in trainer
    async with aiofiles.open(module_dir / "__init__.py", "w") as f:
        await f.write("# Generated __init__.py")

    # Copy entry point script to module_dir/script_module_name
    from app.ai_training.runners.local_script_runner import LOCAL_TRAINING_SCRIPTS_REPO_DIR
    local_script_path = (LOCAL_TRAINING_SCRIPTS_REPO_DIR / entry_point_name).resolve()
    if not local_script_path.is_file():
        raise FileNotFoundError(f"Vertex AI entry_point script '{entry_point_name}' not found at {local_script_path}.")
    
    # script_module_name is like 'task.py'
    await asyncio.to_thread(shutil.copy2, str(local_script_path), str(module_dir / script_module_name))
    
    python_module_for_vertex = f"{top_module_name}.{Path(script_module_name).stem}" # e.g., trainer.task

    # Create requirements.txt if content provided
    if requirements_content:
        async with aiofiles.open(package_root_dir / "requirements.txt", "w") as f:
            await f.write(requirements_content)

    # Create setup.py
    if not setup_py_content:
        install_requires = []
        if requirements_content: # If we have a requirements.txt, parse it for setup.py
            install_requires = [line.strip() for line in requirements_content.split('\n') if line.strip() and not line.startswith('#')]

        setup_py_content = f"""
from setuptools import find_packages, setup
setup(
    name='{package_name}',
    version='0.1.0',
    packages=find_packages(),
    include_package_data=True,
    install_requires={json.dumps(install_requires)},
    description='Dynamically generated training package for Vertex AI job {job_id}.'
)
"""
    async with aiofiles.open(package_root_dir / "setup.py", "w") as f:
        await f.write(setup_py_content)

    # Create source distribution (.tar.gz)
    # This uses synchronous subprocess; run in thread.
    dist_dir = base_staging_dir / "dist"
    await asyncio.to_thread(os.makedirs, str(dist_dir))

    def _create_sdist():
        current_dir = os.getcwd()
        try:
            os.chdir(str(package_root_dir)) # sdist needs to run from package root
            # Using python -m build is more modern, but setup.py sdist is simpler for this context
            # Ensure setuptools and build are available in platform environment or use a specific python.
            process = subprocess.run(
                [sys.executable, "setup.py", "sdist", "--dist-dir", str(dist_dir)],
                capture_output=True, text=True, check=True
            )
            logger.info(f"sdist creation stdout: {process.stdout}")
            if process.stderr: logger.warning(f"sdist creation stderr: {process.stderr}")
        finally:
            os.chdir(current_dir)

    import subprocess, sys # Make sure these are imported
    await asyncio.to_thread(_create_sdist)

    # Find the generated tar.gz file (should be only one)
    sdist_files = list(Path(dist_dir).glob("*.tar.gz"))
    if not sdist_files:
        raise RuntimeError(f"Python source distribution (.tar.gz) not found in {dist_dir} after sdist build.")
    tarball_path = sdist_files[0]

    # Upload to GCS
    storage_client = storage.Client(project=gcp_project_id, credentials=gcp_credentials)
    bucket = storage_client.bucket(gcs_bucket_name)
    gcs_blob_name = f"{gcs_prefix.strip('/')}/{job_id}/{tarball_path.name}"
    blob = bucket.blob(gcs_blob_name)
    
    await asyncio.to_thread(blob.upload_from_filename, str(tarball_path))
    
    gcs_uri = f"gs://{gcs_bucket_name}/{gcs_blob_name}"
    logger.info(f"[VertexAIRunner job_id={job_id}]: Python package uploaded to {gcs_uri}")
    
    # Clean up local staging
    await asyncio.to_thread(shutil.rmtree, str(base_staging_dir))
    return gcs_uri, python_module_for_vertex


async def submit_vertex_ai_training_job(
    job: ai_models.AITrainingJob,
) -> Tuple[Optional[str], Optional[str]]: # Returns (vertex_ai_job_resource_name, error_message)
    """
    Prepares and submits a CustomJob to Google Vertex AI.
    """
    logger.info(f"[VertexAIRunner job_id={job.id}]: Preparing Vertex AI CustomJob submission.")

    script_config = job.training_script_config or {}
    user_creds_model = job.user_credential # Assumed loaded

    # --- GCP Project, Region, Credentials ---
    gcp_project_id = (user_creds_model.additional_config.get("project_id")
                      if user_creds_model and user_creds_model.additional_config
                      else script_config.get("gcp_project_id") or GCP_PROJECT_ID_MLOPS)
    if not gcp_project_id:
        return None, "GCP Project ID not configured (user_creds, script_config, or system settings)."

    gcp_region = (user_creds_model.additional_config.get("region")
                  if user_creds_model and user_creds_model.additional_config
                  else script_config.get("gcp_region") or "us-central1") # Default Vertex AI region

    gcp_credentials = await asyncio.to_thread(get_vertex_ai_credentials) # Handles key file path or ADC

    try:
        aiplatform.init(project=gcp_project_id, location=gcp_region, credentials=gcp_credentials)
        logger.info(f"[VertexAIRunner job_id={job.id}]: Initialized Vertex AI client for project '{gcp_project_id}', region '{gcp_region}'.")
    except Exception as e:
        logger.error(f"[VertexAIRunner job_id={job.id}]: Failed to initialize Vertex AI client: {e}", exc_info=True)
        return None, f"Vertex AI client initialization error: {str(e)}"

    # --- Data Input (GCS URI) ---
    if not job.processed_dataset or not job.processed_dataset.storage_url:
        return None, "ProcessedDataset or its storage_url is missing for Vertex AI job."
    if job.processed_dataset.storage_type != StorageType.GCS:
        # TODO: Implement staging non-GCS data to GCS for Vertex AI.
        logger.error(f"[VertexAIRunner job_id={job.id}]: Dataset storage type is {job.processed_dataset.storage_type.value}, not GCS. Staging required but not yet implemented.")
        return None, f"Dataset storage type '{job.processed_dataset.storage_type.value}' requires staging to GCS for Vertex AI (not implemented)."
    # GCS input URI is passed as an arg to the script within worker_pool_specs.

    # --- Staging GCS Bucket (for custom code packages, job outputs if not specified) ---
    staging_gcs_bucket_name = script_config.get("vertex_ai_staging_gcs_bucket") or VERTEX_AI_DEFAULT_STAGING_GCS_BUCKET
    if not staging_gcs_bucket_name:
        return None, "Vertex AI staging GCS bucket not configured (vertex_ai_staging_gcs_bucket or system default)."

    # --- Training Script Packaging (if not using a fully custom container with script baked in) ---
    entry_point_script_name = script_config.get("entry_point") # e.g., "train_text_classifier.py"
    python_module_name = None # e.g., "trainer.task"
    training_package_gcs_uri = None

    # If 'vertex_ai_python_package_mode' is true, package script and upload.
    # Otherwise, assume script is part of 'vertex_ai_container_image_uri'.
    if script_config.get("vertex_ai_python_package_mode", False): # Default to custom container mode
        if not entry_point_script_name:
            return None, "entry_point must be specified for Vertex AI Python package mode."
        
        script_module_filename = script_config.get("vertex_ai_python_module_filename", "task.py") # e.g. task.py
        requirements_text = script_config.get("vertex_ai_requirements_txt_content", None)
        setup_py_text = script_config.get("vertex_ai_setup_py_content", None)
        
        try:
            training_package_gcs_uri, python_module_name = await _stage_python_package_to_gcs(
                job_id=job.id,
                entry_point_name=entry_point_script_name,
                script_module_name=script_module_filename,
                requirements_content=requirements_text,
                setup_py_content=setup_py_text,
                gcs_bucket_name=staging_gcs_bucket_name,
                gcp_project_id=gcp_project_id,
                gcp_credentials=gcp_credentials
            )
        except Exception as e_pkg:
            logger.error(f"[VertexAIRunner job_id={job.id}]: Failed to stage Python package for Vertex AI: {e_pkg}", exc_info=True)
            return None, f"Vertex AI Python package staging error: {str(e_pkg)}"
    
    # --- Worker Pool Specs ---
    try:
        worker_pool_specs = _build_vertex_ai_worker_pool_spec(job, script_config, training_package_gcs_uri, python_module_name)
    except ValueError as ve: # e.g. missing container URI
        return None, str(ve)

    # --- Base Output Directory on GCS (for model artifacts, checkpoints, etc.) ---
    # Vertex AI CustomJob will create subdirectories here like 'model', 'checkpoints'.
    # This is passed via AIP_MODEL_DIR, AIP_CHECKPOINT_DIR env vars to the container.
    base_output_gcs_prefix = script_config.get("vertex_ai_base_output_gcs_prefix", "vertex_jobs_output")
    base_output_uri = f"gs://{staging_gcs_bucket_name}/{base_output_gcs_prefix.strip('/')}/{job.id}/"
    
    # Vertex AI Job Display Name (max 128 chars)
    job_display_name = f"{job.job_name.replace('_', '-')[:80]}-{job.id[:8]}"[:128]

    # Service account for the Vertex AI job execution
    vertex_job_service_account = script_config.get("vertex_ai_job_service_account_email", None) # Optional

    # Labels for the job
    job_labels = {"platform_job_id": job.id, "app": "ai-training-platform"} # Add more as needed

    custom_job_payload = {
        "display_name": job_display_name,
        "job_spec": {
            "worker_pool_specs": worker_pool_specs,
            "base_output_directory": {"output_uri_prefix": base_output_uri},
            # "scheduling": { "timeout": "3600s", "restart_job_on_worker_restart": False }, # Optional
            "labels": job_labels,
        }
    }
    if vertex_job_service_account:
        custom_job_payload["job_spec"]["service_account"] = vertex_job_service_account
    
    # Enable web access for TensorBoard if configured (complex setup, placeholder)
    # if script_config.get("vertex_ai_enable_tensorboard_web_access", False) and settings.GCP_VERTEX_AI_TENSORBOARD_INSTANCE_NAME:
    #     custom_job_payload["job_spec"]["tensorboard"] = settings.GCP_VERTEX_AI_TENSORBOARD_INSTANCE_NAME
    #     custom_job_payload["job_spec"]["enable_web_access"] = True


    logger.info(f"[VertexAIRunner job_id={job.id}]: Submitting CustomJob to Vertex AI with display name '{job_display_name}'.")
    logger.debug(f"[VertexAIRunner job_id={job.id}]: CustomJob Payload: {json.dumps(custom_job_payload, indent=2)}")

    try:
        # aiplatform.CustomJob is a class constructor, then call .run()
        # Or use aiplatform.gapic.JobServiceClient directly for more control
        
        # Using the JobServiceClient for direct API call
        job_client = aiplatform.gapic.JobServiceClient(
            client_options={"api_endpoint": f"{gcp_region}-aiplatform.googleapis.com"},
            credentials=gcp_credentials # Pass creds to client if not using ADC for this specific call
        )
        parent_path = f"projects/{gcp_project_id}/locations/{gcp_region}"
        
        # Convert dict to protobuf (google.cloud.aiplatform_v1.types.CustomJob)
        # This requires some care. For complex fields like worker_pool_specs, direct dict assignment might work
        # or might need explicit protobuf message construction.
        # Simpler approach: aiplatform.CustomJob.submit (High-level SDK)
        
        # Using high-level SDK:
        # Need to run this blocking call in a thread.
        def _run_vertex_ai_job_submit():
            # Initialize client again within the thread if needed, or ensure it's thread-safe
            # aiplatform.init(project=gcp_project_id, location=gcp_region, credentials=gcp_credentials, staging_bucket=f"gs://{staging_gcs_bucket_name}")

            vertex_job = aiplatform.CustomJob(
                display_name=job_display_name,
                worker_pool_specs=worker_pool_specs,
                base_output_dir=base_output_uri, # This is where AIP_MODEL_DIR etc. will be relative to
                staging_bucket=f"gs://{staging_gcs_bucket_name}" # For staging custom packages
            )
            # submit() is non-blocking. It doesn't wait for the job to complete.
            # No need for wait=False, it's inherently async submission.
            vertex_job.run(
                service_account=vertex_job_service_account,
                labels=job_labels,
                # tensorboard=..., sync=False
            ) 
            # After .run(), vertex_job.resource_name should be populated
            return vertex_job.resource_name # e.g. projects/.../locations/.../customJobs/...

        vertex_job_resource_name = await asyncio.to_thread(_run_vertex_ai_job_submit)

        if not vertex_job_resource_name:
            return None, "Vertex AI job submission did not return a resource name (submission might have failed silently or SDK behavior changed)."

        logger.info(f"[VertexAIRunner job_id={job.id}]: Vertex AI CustomJob '{vertex_job_resource_name}' submitted successfully.")
        return vertex_job_resource_name, None

    except Exception as e:
        error_message = f"Vertex AI CustomJob submission error: {str(e)}"
        logger.error(f"[VertexAIRunner job_id={job.id}]: {error_message}", exc_info=True)
        if hasattr(e, 'details'): # gRPC errors
             error_message += f" (gRPC Details: {e.details()})" # type: ignore
        return None, error_message