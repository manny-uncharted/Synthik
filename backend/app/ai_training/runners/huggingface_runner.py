import asyncio
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import aiofiles
from datasets import load_dataset
from huggingface_hub import HfApi, create_repo
from huggingface_hub.utils import RepositoryNotFoundError, GatedRepoError, HfHubHTTPError

# Assuming these are correctly importable from your application structure
import app.ai_training.models as ai_models  # SQLAlchemy model
from app.core.constants import LOCAL_TRAINING_SCRIPTS_REPO_DIR
from app.core.enums.ai_training import JobStatus, ModelStorageType

# --- Logging Setup ---
logger = logging.getLogger(__name__)

# --- Default Versions for Space Configuration ---
DEFAULT_PYTHON_VERSION = "3.10"
DEFAULT_TRANSFORMERS_VERSION = "4.36.0"
DEFAULT_PEFT_VERSION = "0.7.1"
DEFAULT_TORCH_VERSION = "2.1.0"
DEFAULT_DATASETS_VERSION = "2.15.0"
DEFAULT_ACCELERATE_VERSION = "0.25.0"
DEFAULT_BITSNBYTES_VERSION = "0.41.2"

# --- Helper Functions for Generating Space Files ---

def _generate_requirements_txt_content(script_config: Dict[str, Any]) -> str:
    """Generates the content for requirements.txt."""
    return f"""
        numpy<2.0
        transformers=={script_config.get("transformers_version", DEFAULT_TRANSFORMERS_VERSION)}
        peft=={script_config.get("peft_version", DEFAULT_PEFT_VERSION)}
        torch=={script_config.get("torch_version", DEFAULT_TORCH_VERSION)}
        datasets=={script_config.get("datasets_version", DEFAULT_DATASETS_VERSION)}
        accelerate=={script_config.get("accelerate_version", DEFAULT_ACCELERATE_VERSION)}
        bitsandbytes=={script_config.get("bitsandbytes_version", DEFAULT_BITSNBYTES_VERSION)}
        huggingface_hub>=0.19.0
        scipy
        hf_transfer
        hf_xet
        tensorboard
        python-dotenv
        # s3fs # Uncomment if train_text_lora directly reads from S3 (if data isn't staged to HF Hub)
        # gcsfs # Uncomment if train_text_lora directly reads from GCS
    """

def _generate_dockerfile_content(script_config: Dict[str, Any]) -> str:
    """Generates the content for the Dockerfile."""
    python_version = script_config.get("hf_space_python_version", DEFAULT_PYTHON_VERSION)
    return f"""
        FROM python:{python_version}-slim

        ENV PYTHONUNBUFFERED=1 \\
            HF_HUB_ENABLE_HF_TRANSFER=1 \\
            GRADIO_ANALYTICS_ENABLED=False \\
            HF_HOME="/app/.cache/huggingface"

        WORKDIR /app

        # Create directories and make them writable
        RUN mkdir -p /app/outputs && chmod -R 777 /app/outputs \\
            && mkdir -p /app/.cache/huggingface && chmod -R 777 /app/.cache/huggingface

        COPY requirements.txt .
        # Ensure pip is up-to-date and install requirements
        RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

        COPY train_text_lora.py .
        COPY train_script_wrapper.py .

        # The user running the CMD will now have write access to /app/outputs and HF_HOME
        CMD ["python", "train_script_wrapper.py"]
    """

def _generate_readme_md_content(
    job: ai_models.AITrainingJob,
    space_repo_id: str, # Although not directly used in YAML, useful for the body
    hf_dataset_id_for_script: Optional[str],
    base_model_id_for_script: Optional[str],
    python_version_for_readme: str,
    suggested_hardware_for_readme: str
) -> str:
    """Generates a README.md for the Hugging Face Space with a YAML configuration block."""

    title = f"Training Space for Job {job.id}"
    # Fallback for short_description if job_name is too short or for consistency
    default_short_desc = f"Automated LoRA fine-tuning job ({job.id}). Executes train_text_lora.py."
    short_desc = job.job_name if len(job.job_name) >= 10 else default_short_desc # Example condition
    if len(short_desc) > 120 : # Max length for short_description might be around this
        short_desc = short_desc[:117] + "..."


    sdk_type = "docker"
    app_file_in_readme = "train_script_wrapper.py"  # Main script run by Docker CMD
    emoji = "🚀"
    color_from = "blue"
    color_to = "green"
    
    # Get pinned status from training_script_config if available, else default to False
    pinned_status = job.training_script_config.get("hf_space_pinned", False) if job.training_script_config else False


    # Tags - start with defaults and add model_type if available
    tags = ["text-generation", "lora", "automated-training", "fine-tuning", "mlops"]
    if job.model_type:
        tags.append(job.model_type.lower().replace("_", "-")) # Add model_type as a tag

    # Construct the YAML block lines
    yaml_config_lines = [
        "---",
        f"title: \"{title}\"",
        f"emoji: \"{emoji}\"",
        f"colorFrom: \"{color_from}\"",
        f"colorTo: \"{color_to}\"",
        f"sdk: \"{sdk_type}\"",
        f"python_version: \"{python_version_for_readme}\"",
        f"suggested_hardware: \"{suggested_hardware_for_readme}\"",
        f"app_file: \"{app_file_in_readme}\"",
        f"pinned: {str(pinned_status).lower()}",
        f"short_description: \"{short_desc}\"",
    ]

    if base_model_id_for_script:
        yaml_config_lines.append("models:")
        yaml_config_lines.append(f"  - \"{base_model_id_for_script}\"")
    else:
        yaml_config_lines.append("# models: [] # (Base model ID not specified for training script)")

    if hf_dataset_id_for_script:
        yaml_config_lines.append("datasets:")
        yaml_config_lines.append(f"  - \"{hf_dataset_id_for_script}\"")
    else:
        yaml_config_lines.append("# datasets: [] # (HF Dataset ID not used or generated during setup)")

    yaml_config_lines.append("tags:")
    for tag in sorted(list(set(tags))):
        yaml_config_lines.append(f"  - \"{tag}\"")

    if base_model_id_for_script:
        yaml_config_lines.append("preload_from_hub:")
        yaml_config_lines.append(f"  - \"{base_model_id_for_script}\"") # Preload the entire base model repo
    else:
        yaml_config_lines.append("# preload_from_hub: [] # (No base model specified for preloading)")
    
    # Optional: startup_duration_timeout if jobs are known to take longer to start
    # startup_timeout = job.training_script_config.get("hf_startup_duration_timeout", "30m") # e.g. "1h"
    # yaml_config_lines.append(f"startup_duration_timeout: \"{startup_timeout}\"")

    yaml_config_lines.append("---")
    yaml_config = "\n".join(yaml_config_lines)

    # Construct the rest of the README body
    readme_body = f"""

        # Training Space for MLOps Job `{job.id}`

        This Space is automatically generated to run a LoRA (Low-Rank Adaptation) fine-tuning job.
        It utilizes a Docker environment to execute the `train_text_lora.py` script using parameters defined by the MLOps job configuration.

        ## Job Overview
        - **Job ID:** `{job.id}`
        - **Job Name:** `{job.job_name}`
        - **Model Type:** `{job.model_type or "N/A"}`
        - **Base Model (for fine-tuning):** `{base_model_id_for_script or "N/A"}`
        - **Dataset (on Hugging Face Hub):** `{hf_dataset_id_for_script or "N/A (e.g., staged during setup)"}`

        ## Execution Details
        The core training logic is encapsulated in `train_text_lora.py`, which is orchestrated by `train_script_wrapper.py` within this Space.
        Hyperparameters and script configurations are passed dynamically to the training script.

        ## Outputs
        Outputs from the training process, such as the LoRA adapter and training metrics, will be pushed to the following Hugging Face Hub model repository upon successful completion:
        [{job.output_model_url or "Target repository to be configured"}](https://huggingface.co/{job.output_model_url if job.output_model_url and not job.output_model_url.startswith('http') else job.output_model_url or '#'})

        ## Monitoring
        Check the **Logs** tab of this Space for real-time training progress, standard output, and any error messages from the execution script.
    """
    return yaml_config + readme_body

# def _generate_train_script_wrapper_py_content() -> str:
#     """
#     Generates the content for train_script_wrapper.py.
#     This script runs inside the HF Space and executes the actual training script.
#     """
#     return """
# import os
# import subprocess
# import json
# import logging
# from huggingface_hub import HfApi, create_repo, upload_folder

# logging.basicConfig(
#     level=logging.INFO,
#     format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
# )
# logger = logging.getLogger("TrainingWrapper")

# def main():
#     logger.info("Starting training script wrapper in Hugging Face Space.")

#     hf_token_for_push = os.environ.get('HF_TOKEN_FOR_PUSH')
#     if not hf_token_for_push:
#         logger.error("HF_TOKEN_FOR_PUSH secret not found. Cannot upload results.")
#         exit(1)

#     target_model_repo_id = os.environ.get('TARGET_MODEL_REPO_ID')
#     if not target_model_repo_id:
#         logger.error("TARGET_MODEL_REPO_ID environment variable not found.")
#         exit(1)

#     data_path = os.environ.get('DATA_PATH_FOR_SCRIPT')
#     base_model_id = os.environ.get('BASE_MODEL_ID_FOR_SCRIPT')

#     if not data_path or not base_model_id:
#         logger.error("DATA_PATH_FOR_SCRIPT or BASE_MODEL_ID_FOR_SCRIPT env vars missing.")
#         exit(1)

#     hyperparameters_json_str = os.getenv('HYPERPARAMETERS_JSON_FOR_SCRIPT', '{}')
#     training_script_config_json_str = os.getenv('TRAINING_SCRIPT_CONFIG_JSON_FOR_SCRIPT', '{}')

#     model_output_dir = "/app/outputs"
#     os.makedirs(model_output_dir, exist_ok=True)

#     cmd = [
#         "python", "train_text_lora.py",
#         "--data_path", data_path,
#         "--model_output_dir", model_output_dir,
#         "--base_model_id", base_model_id,
#         "--hyperparameters_json", hyperparameters_json_str,
#         "--training_script_config_json", training_script_config_json_str,
#         # Add --runner_environment huggingface if train_text_lora.py uses it
#         "--runner_environment", "huggingface"
#     ]

#     logger.info(f"Constructed training command: {' '.join(cmd)}")
#     logger.info(f"Hyperparameters JSON for script: {hyperparameters_json_str}")
#     logger.info(f"Training Script Config JSON for script: {training_script_config_json_str}")

#     logger.info("Executing train_text_lora.py...")
#     # Stream stdout/stderr directly for Space logs
#     process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

#     if process.stdout:
#         for line in iter(process.stdout.readline, ''):
#             logger.info(line.strip()) # Log each line as it comes
#         process.stdout.close()
    
#     return_code = process.wait()

#     if return_code == 0:
#         logger.info("Training script completed successfully.")
#         logger.info(f"Uploading model outputs from {model_output_dir} to HF Hub repository: {target_model_repo_id}")
        
#         try:
#             api = HfApi(token=hf_token_for_push)
#             # Create target repo if it doesn't exist. Privacy should be handled by the runner ideally.
#             create_repo(target_model_repo_id, token=hf_token_for_push, repo_type="model", exist_ok=True)
            
#             upload_folder(
#                 folder_path=model_output_dir,
#                 repo_id=target_model_repo_id,
#                 repo_type="model",
#                 commit_message=f"Job completed: Upload fine-tuned LoRA adapter and artifacts from Space.",
#                 token=hf_token_for_push
#             )
#             logger.info(f"Successfully uploaded artifacts to Hugging Face Hub model repo: {target_model_repo_id}")
#         except Exception as e:
#             logger.error(f"Failed to upload results to {target_model_repo_id}: {e}", exc_info=True)
#             exit(1) # Consider upload failure as a job failure
#     else:
#         logger.error(f"Training script failed with return code {return_code}.")
#         exit(return_code)

# if __name__ == "__main__":
#     main()
# """


def _generate_train_script_wrapper_py_content(
    training_script_name: str = "train_text_lora.py",
) -> str:
    """
    Generates the content for train_script_wrapper.py.
    This script runs inside the HF Space and executes the actual training script.
    """
    return """
import os
import subprocess
import json
import logging
from huggingface_hub import HfApi, create_repo, upload_folder

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
)
logger = logging.getLogger("TrainingWrapper")

def main():
    logger.info("Starting training script wrapper in Hugging Face Space.")

    # Required environment variables
    hf_token_for_push = os.environ.get('HF_TOKEN_FOR_PUSH')
    target_model_repo_id = os.environ.get('TARGET_MODEL_REPO_ID')
    data_path = os.environ.get('DATA_PATH_FOR_SCRIPT')
    base_model_id = os.environ.get('BASE_MODEL_ID_FOR_SCRIPT')

    # Validate environment
    if not hf_token_for_push:
        logger.error("HF_TOKEN_FOR_PUSH secret not found. Cannot upload results.")
        exit(1)
    if not target_model_repo_id:
        logger.error("TARGET_MODEL_REPO_ID environment variable not found.")
        exit(1)
    if not data_path or not base_model_id:
        logger.error("DATA_PATH_FOR_SCRIPT or BASE_MODEL_ID_FOR_SCRIPT env vars missing.")
        exit(1)

    # Optional JSON configs
    hyperparameters_json_str = os.getenv('HYPERPARAMETERS_JSON_FOR_SCRIPT', '{}')
    training_script_config_json_str = os.getenv('TRAINING_SCRIPT_CONFIG_JSON_FOR_SCRIPT', '{}')

    model_output_dir = "/app/outputs"
    os.makedirs(model_output_dir, exist_ok=True)

    # Dynamically build command
    cmd = [
        "python", f"{training_script_name}",
        "--data_path", data_path,
        "--model_output_dir", model_output_dir,
        "--base_model_id", base_model_id,
        "--hyperparameters_json", hyperparameters_json_str,
        "--training_script_config_json", training_script_config_json_str,
        "--runner_environment", "huggingface"
    ]

    logger.info(f"Using training script: {training_script_name}")
    logger.info(f"Constructed training command: {' '.join(cmd)}")

    # Execute subprocess and stream logs
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    if process.stdout:
        for line in iter(process.stdout.readline, ''):
            logger.info(line.strip())
        process.stdout.close()
    return_code = process.wait()

    if return_code != 0:
        logger.error(f"Training script {training_script_name} failed with code {return_code}.")
        exit(return_code)

    logger.info("Training script completed successfully.")
    logger.info(f"Uploading outputs from {model_output_dir} to HF Hub: {target_model_repo_id}")
    try:
        api = HfApi(token=hf_token_for_push)
        create_repo(target_model_repo_id, token=hf_token_for_push, repo_type="model", exist_ok=True)
        upload_folder(
            folder_path=model_output_dir,
            repo_id=target_model_repo_id,
            repo_type="model",
            commit_message=f"Upload artifacts after running {training_script_name}.",
            token=hf_token_for_push
        )
        logger.info(f"Successfully uploaded artifacts to: {target_model_repo_id}")
    except Exception as e:
        logger.error(f"Failed to upload results: {e}", exc_info=True)
        exit(1)

if __name__ == "__main__":
    main()
"""

# --- Main Submission Function ---

async def submit_huggingface_training_job(
    job: ai_models.AITrainingJob,
    local_dataset_path: str,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Submits a training job to Hugging Face by creating and configuring a Space.
    The Space will run the train_text_lora.py script via a wrapper.
    """
    logger.info(f"[HuggingFaceRunner job_id={job.id}]: Preparing Hugging Face Space training job.")
    script_config = job.training_script_config or {}
    user_creds = job.user_credential

    # --- Validate HF Token ---
    if not (user_creds and user_creds.secret_key):
        return None, "Hugging Face API token (write access) not found in user credentials."
    hf_write_token = user_creds.secret_key

    hf_api = HfApi(token=hf_write_token)
    print(f"[HuggingFaceRunner job_id={job.id}]: Authenticated to Hugging Face as: {hf_write_token}")
    try:
        hf_user_info = await asyncio.to_thread(hf_api.whoami)
        hf_username = hf_user_info.get("name") if hf_user_info else None
        if not hf_username:
            return None, "Could not determine Hugging Face username from token."
        logger.info(f"[HuggingFaceRunner job_id={job.id}]: Authenticated to Hugging Face as: {hf_username}")
    except Exception as e:
        logger.error(f"[HuggingFaceRunner job_id={job.id}]: Hugging Face token validation failed: {e}", exc_info=True)
        return None, f"Hugging Face token validation error: {str(e)}"

    repo_owner = script_config.get("hf_username", hf_username)
    print(f"[HuggingFaceRunner job_id={job.id}]: Repo owner: {repo_owner}")

    # --- Target Model Repository (for results) ---
    target_model_repo_id = script_config.get("hf_target_model_repo_id")
    print(f"[HuggingFaceRunner job_id={job.id}]: Target model repo ID: {target_model_repo_id}")
    if not target_model_repo_id:
        sanitized_job_name = "".join(c if c.isalnum() or c in ['-', '_'] else '_' for c in job.job_name)
        target_model_repo_id = f"{repo_owner}/{sanitized_job_name}_{job.id[:8]}_lora_output"
        logger.info(f"[HuggingFaceRunner job_id={job.id}]: Defaulted target model repo ID: {target_model_repo_id}")

    is_private_repo = script_config.get("hf_private_repos", True)
    print(f"[HuggingFaceRunner job_id={job.id}]: Target model repo privacy: {is_private_repo}")
    try:
        await asyncio.to_thread(
            create_repo,
            target_model_repo_id,
            token=hf_write_token,
            repo_type="model",
            private=is_private_repo,
            exist_ok=True
        )
        logger.info(f"[HuggingFaceRunner job_id={job.id}]: Ensured target model repository '{target_model_repo_id}' (private={is_private_repo}).")
    except Exception as e:
        logger.warning(f"[HuggingFaceRunner job_id={job.id}]: Could not pre-create target model repo '{target_model_repo_id}': {e}. Wrapper will attempt creation.")

    # --- Dataset Handling ---
    hf_dataset_id_for_script: Optional[str] = None
    if not job.dataset_url:
        return None, "Dataset URL not available for the job."

    if job.dataset_url.startswith("hf://"):
        hf_dataset_id_for_script = job.dataset_url # Assuming storage_url IS the HF dataset ID
        logger.info(f"[HuggingFaceRunner job_id={job.id}]: Using existing Hugging Face dataset ID: {hf_dataset_id_for_script}")
    
    # Case 2: A local_dataset_path is provided (meaning it was downloaded from Walrus/other)
    elif local_dataset_path:
        print(f"[HuggingFaceRunner job_id={job.id}]: Using local dataset path: {local_dataset_path}")
        dataset_path_obj = Path(local_dataset_path)
        if not dataset_path_obj.exists() or not dataset_path_obj.is_file(): # Check if it's a valid file
            return None, f"Provided local_dataset_path ('{local_dataset_path}') does not exist or is not a file."

        # Define a target repository ID on Hugging Face Hub for this dataset
        target_hf_dataset_repo_id = script_config.get(
            "hf_dataset_repo_id", # Allow override from config
            f"{repo_owner}/dataset_for_job_{job.id.replace('-', '_')}" # Default name
        )
        print(f"[HuggingFaceRunner job_id={job.id}]: Uploading local dataset from '{local_dataset_path}' to HF Hub as '{target_hf_dataset_repo_id}'.")

        def _push_local_file_to_hf_dataset_sync_wrapper():
            # This synchronous wrapper will be run in a separate thread
            file_extension = dataset_path_obj.suffix.lstrip('.').lower()
            load_type = file_extension
            if file_extension == "jsonl":
                load_type = "json"
            elif file_extension == "txt": # datasets library often uses 'text' for plain text files
                load_type = "text"
            
            # Ensure the type is one that load_dataset can handle with data_files
            supported_single_file_types = ["json", "csv", "text", "parquet"]
            if load_type not in supported_single_file_types:
                # If not directly supported, you might need to upload as a generic file using hf_api.upload_file
                # and then the script would download it. For simplicity, focusing on direct load_dataset compatibility.
                raise ValueError(f"Dataset file type '.{file_extension}' (parsed as '{load_type}') from '{local_dataset_path}' might not be directly loadable by `datasets.load_dataset(data_files=...)`. Consider uploading as a generic file or ensuring it's one of {supported_single_file_types}.")

            # Load the single file as a Hugging Face Dataset, assuming it's for the 'train' split
            # Your lora_finetuning_script.py expects to load data_path with split='train'
            loaded_ds = load_dataset(load_type, data_files=str(dataset_path_obj), split="train")
            
            print(f"[HuggingFaceRunner job_id={job.id}]: Local dataset file loaded into Dataset object. Pushing to Hub: {target_hf_dataset_repo_id}")
            loaded_ds.push_to_hub(
                repo_id=target_hf_dataset_repo_id,
                private=is_private_repo, 
                token=hf_write_token,
                commit_message=f"Upload dataset for training job {job.id}"
            )
            return target_hf_dataset_repo_id # This becomes the HF Dataset ID for the script

        try:
            hf_dataset_id_for_script = await asyncio.to_thread(_push_local_file_to_hf_dataset_sync_wrapper)
            print(f"[HuggingFaceRunner job_id={job.id}]: Dataset successfully pushed to HF Hub: {hf_dataset_id_for_script}")
        except Exception as e:
            print(f"[HuggingFaceRunner job_id={job.id}]: Failed to load local dataset file or push to HF Hub: {e}")
            return None, f"Dataset upload to HF Hub failed: {str(e)}"
            
    # Case 3: Dataset is not on HF, and no local_dataset_path was provided (error)
    else:
        return None, "Dataset is not an existing Hugging Face dataset, and no local_dataset_path was provided for upload."

    if not hf_dataset_id_for_script: # Safeguard
        return None, "Critical error: Failed to determine or prepare a Hugging Face dataset ID for the training script."

    # --- Prepare Space Contents in a Temporary Directory ---
    # (Ensure tempfile, shutil, Path, asyncio, json, aiofiles are imported)
    temp_space_dir_path_obj = Path(tempfile.mkdtemp(prefix=f"hf_space_{job.id}_"))
    scripts_dir_path = Path(LOCAL_TRAINING_SCRIPTS_REPO_DIR)
    print(f"[HuggingFaceRunner job_id={job.id}]: Preparing Space contents in temporary directory: {temp_space_dir_path_obj}")
    try:
        # 1. Copy train_text_lora.py (ensure LOCAL_TRAINING_SCRIPTS_REPO_DIR is defined)
        source_script_path = scripts_dir_path / "train_text_lora.py"
        if not source_script_path.is_file():
            return None, f"Main training script 'train_text_lora.py' not found at {source_script_path}"
        await asyncio.to_thread(shutil.copy2, str(source_script_path), str(temp_space_dir_path_obj / "train_text_lora.py"))

        # 2. Generate and write train_script_wrapper.py
        wrapper_content = _generate_train_script_wrapper_py_content() # You need to define this helper
        print(f"[HuggingFaceRunner job_id={job.id}]: Generated train_script_wrapper.py content: {wrapper_content}")
        async with aiofiles.open(temp_space_dir_path_obj / "train_script_wrapper.py", "w", encoding='utf-8') as f:
            await f.write(wrapper_content)

        # 3. Generate and write requirements.txt
        req_content = _generate_requirements_txt_content(script_config) # You need to define this helper
        print(f"[HuggingFaceRunner job_id={job.id}]: Generated requirements.txt content: {req_content}")
        async with aiofiles.open(temp_space_dir_path_obj / "requirements.txt", "w", encoding='utf-8') as f:
            await f.write(req_content)

        # 4. Generate and write Dockerfile
        dockerfile_content = _generate_dockerfile_content(script_config) # You need to define this helper
        print(f"[HuggingFaceRunner job_id={job.id}]: Generated Dockerfile content: {dockerfile_content}")
        async with aiofiles.open(temp_space_dir_path_obj / "Dockerfile", "w", encoding='utf-8') as f:
            await f.write(dockerfile_content)
        
        # 5. Generate and write README.md for the Space
        space_repo_name_suffix = f"training_space_{job.id.replace('-', '_')}"
        space_repo_id = script_config.get("hf_space_repo_id", f"{repo_owner}/{space_repo_name_suffix}")
        python_version_for_readme = script_config.get("hf_space_python_version", DEFAULT_PYTHON_VERSION)
        
        # Suggested hardware for README (this is also used for create_repo's space_hardware)
        space_hardware = script_config.get("hf_space_hardware", "t4-small") # Default if not specified
        
        # Base model ID for the script and README
        base_model_for_script = job.hyperparameters.get("base_model_id", script_config.get("base_model_id"))
        if not base_model_for_script:
            logger.error(f"[HuggingFaceRunner job_id={job.id}]: 'base_model_id' is missing and required.")
            return None, "'base_model_id' is missing in job.hyperparameters or script_config."
        readme_content = _generate_readme_md_content(
            job=job,
            space_repo_id=space_repo_id,
            hf_dataset_id_for_script=hf_dataset_id_for_script,
            base_model_id_for_script=base_model_for_script,
            python_version_for_readme=python_version_for_readme,
            suggested_hardware_for_readme=space_hardware
        ) # You need to define this helper
        print(f"[HuggingFaceRunner job_id={job.id}]: Generated README.md content: {readme_content}")
        async with aiofiles.open(temp_space_dir_path_obj / "README.md", "w", encoding='utf-8') as f:
            await f.write(readme_content)

        # --- Space Configuration ---
        space_hardware = script_config.get("hf_space_hardware", "t4-small") # Example default
        base_model_for_script = job.hyperparameters.get("base_model_id", script_config.get("base_model_id"))
        print(f"[HuggingFaceRunner job_id={job.id}]: Base model for script: {base_model_for_script}")
        if not base_model_for_script:
            return None, "'base_model_id' is missing in job.hyperparameters or script_config and is required for the training script."

        space_secrets = {
            "HF_TOKEN_FOR_PUSH": hf_write_token,
            "TARGET_MODEL_REPO_ID": target_model_repo_id,
            "DATA_PATH_FOR_SCRIPT": hf_dataset_id_for_script, # USE THE DETERMINED HF DATASET ID
            "BASE_MODEL_ID_FOR_SCRIPT": base_model_for_script,
            # Pass hyperparameters and script_config as JSON strings
            "HYPERPARAMETERS_JSON_FOR_SCRIPT": json.dumps(job.hyperparameters or {}),
            "TRAINING_SCRIPT_CONFIG_JSON_FOR_SCRIPT": json.dumps(script_config or {}), # Contains other script settings
        }

        # --- Create/Update Space Repository and Upload Files ---
        print(f"[HuggingFaceRunner job_id={job.id}]: Creating/updating Space: {space_repo_id} (Hardware: {space_hardware})")
        
        space_url_info = await asyncio.to_thread(
            create_repo, repo_id=space_repo_id, token=hf_write_token, repo_type="space",
            space_sdk="docker", space_hardware=space_hardware, private=is_private_repo, exist_ok=True
        )
        print(f"[HuggingFaceRunner job_id={job.id}]: Space repository ensured: {space_url_info.url if hasattr(space_url_info, 'url') else space_repo_id}")

        for key, value in space_secrets.items():
            await asyncio.to_thread(hf_api.add_space_secret, repo_id=space_repo_id, key=key, value=value)
        print(f"[HuggingFaceRunner job_id={job.id}]: Space secrets configured for {space_repo_id}.")

        print(f"[HuggingFaceRunner job_id={job.id}]: Uploading Space contents from {temp_space_dir_path_obj} to {space_repo_id}")
        await asyncio.to_thread(
            hf_api.upload_folder, folder_path=str(temp_space_dir_path_obj), repo_id=space_repo_id,
            repo_type="space", commit_message=f"Job {job.id}: Setup/update training Space."
        )
        print(f"[HuggingFaceRunner job_id={job.id}]: Space contents uploaded. Space should build/run.")

        # Update job model with Space URL as external_job_id and target model repo URL
        job.external_job_id = space_repo_id 
        job.output_model_storage_type = ModelStorageType.HUGGING_FACE
        job.output_model_url = f"https://huggingface.co/{target_model_repo_id}"
        # The logs_url can be the Space URL
        job.logs_url = f"https://huggingface.co/spaces/{space_repo_id}/logs"


        return space_repo_id, None # Success: return Space ID and no error

    except HfHubHTTPError as e_hf_http: # Make sure HfHubHTTPError is imported correctly
        error_detail = str(e_hf_http)
        if hasattr(e_hf_http, 'response') and e_hf_http.response is not None:
            error_detail += f" | Status: {e_hf_http.response.status_code} | Response Text: {e_hf_http.response.text}"
        # print(f"[HuggingFaceRunner job_id={job.id}]: Hugging Face API HTTP error: {error_detail}", exc_info=True)
        return None, f"HF API HTTP Error: {error_detail[:500]}"
    except Exception as e:
        print(f"[HuggingFaceRunner job_id={job.id}]: Failed to create or upload to Hugging Face Space: {e}")
        return None, f"Hugging Face Space setup failed: {str(e)[:500]}"
    finally:
        if temp_space_dir_path_obj.exists(): # Check if Path object exists
            try:
                await asyncio.to_thread(shutil.rmtree, str(temp_space_dir_path_obj))
                print(f"[HuggingFaceRunner job_id={job.id}]: Cleaned up temporary directory {temp_space_dir_path_obj}")
            except Exception as e_clean:
                print(f"[HuggingFaceRunner job_id={job.id}]: Error cleaning temp dir {temp_space_dir_path_obj}: {e_clean}")
