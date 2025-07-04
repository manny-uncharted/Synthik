import logging
import subprocess
import json
import os
import aiofiles
import aios
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional
from sqlalchemy.orm import Session

import app.ai_training.models as ai_models
from app.core.enums.ai_training import JobStatus, StorageType
from app.core.database import SessionLocal
from app.core.constants import (
    LOCAL_TRAINING_RUNS_DIR,
    LOCAL_TRAINING_SCRIPTS_REPO_DIR,
    HUGGING_FACE_HUB_TOKEN_MLOPS
)

logger = logging.getLogger(__name__)

# Define the base directory for local training runs
# Ensure this directory exists and has appropriate permissions.
# It could be configurable via 
LOCAL_TRAINING_BASE_DIR = Path(LOCAL_TRAINING_RUNS_DIR if LOCAL_TRAINING_RUNS_DIR else "/tmp/ai_training_runs")
LOCAL_TRAINING_SCRIPTS_DIR = Path(LOCAL_TRAINING_SCRIPTS_REPO_DIR if LOCAL_TRAINING_SCRIPTS_REPO_DIR else "./training_scripts") # Where your train_*.py scripts are

async def execute_local_training_script(
    job: ai_models.AITrainingJob, # The ORM object
    job_run_dir: Path, # e.g., /tmp/ai_training_runs/<job_id>/
    input_data_dir: Path, # e.g., <job_run_dir>/input_data/
    model_output_dir: Path, # e.g., <job_run_dir>/output_model/
    stdout_log_path: Path,
    stderr_log_path: Path,
    db_session_factory: Callable[[], Session] = SessionLocal # For the monitoring task
):
    """
    Executes the specified local training script using subprocess.Popen
    and queues a monitoring task.
    """
    entry_point = (job.training_script_config or {}).get("entry_point")
    if not entry_point:
        logger.error(f"[LocalRunner job_id={job.id}]: 'entry_point' not specified in training_script_config.")
        # Update job status to FAILED directly (needs a DB session)
        async with db_session_factory() as db:
            job_to_fail = await db.get(ai_models.AITrainingJob, job.id)
            if job_to_fail:
                job_to_fail.status = JobStatus.FAILED
                job_to_fail.error_message = "Configuration Error: entry_point for training script not specified."
                job_to_fail.completed_at = datetime.now(timezone.utc)
                await db.commit()
        return

    # Resolve the script path relative to a configured base script directory
    # This is a security measure to prevent arbitrary script execution.
    # Ensure LOCAL_TRAINING_SCRIPTS_DIR is trusted.
    script_path = (LOCAL_TRAINING_SCRIPTS_DIR / entry_point).resolve()
    if not script_path.is_file() or not str(script_path).startswith(str(LOCAL_TRAINING_SCRIPTS_DIR.resolve())):
        logger.error(f"[LocalRunner job_id={job.id}]: Training script '{entry_point}' not found or outside allowed directory ({LOCAL_TRAINING_SCRIPTS_DIR}). Path resolved to: {script_path}")
        async with db_session_factory() as db:
            job_to_fail = await db.get(ai_models.AITrainingJob, job.id)
            if job_to_fail:
                job_to_fail.status = JobStatus.FAILED
                job_to_fail.error_message = f"Configuration Error: Training script '{entry_point}' not found or invalid."
                job_to_fail.completed_at = datetime.now(timezone.utc)
                await db.commit()
        return

    # Prepare command
    # Ensure all paths are absolute for the subprocess
    cmd = [
        "python", str(script_path),
        "--data-input-dir", str(input_data_dir.resolve()),
        "--model-output-dir", str(model_output_dir.resolve()),
        "--hyperparameters", json.dumps(job.hyperparameters or {}),
        "--training-script-config", json.dumps(job.training_script_config or {})
    ]

    logger.info(f"[LocalRunner job_id={job.id}]: Executing command: {' '.join(cmd)}")
    logger.info(f"[LocalRunner job_id={job.id}]: Stdout will be logged to: {stdout_log_path}")
    logger.info(f"[LocalRunner job_id={job.id}]: Stderr will be logged to: {stderr_log_path}")

    try:
        # Open log files
        # Ensure parent directories for logs exist
        await aios.makedirs(os.path.dirname(stdout_log_path), exist_ok=True)
        await aios.makedirs(os.path.dirname(stderr_log_path), exist_ok=True)

        stdout_file = await aiofiles.open(stdout_log_path, "w")
        stderr_file = await aiofiles.open(stderr_log_path, "w")

        # Launch the subprocess
        # `subprocess.Popen` is synchronous, so it needs to be handled carefully in an async context.
        # For long-running processes, `asyncio.create_subprocess_exec` is preferred.
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=stdout_file, # Can also use asyncio.subprocess.PIPE
            stderr=stderr_file, # Can also use asyncio.subprocess.PIPE
            cwd=str(job_run_dir.resolve()) # Set current working directory for the script
        )
        
        logger.info(f"[LocalRunner job_id={job.id}]: Training script subprocess started with PID: {process.pid}.")
        
        # Update job with external_job_id (PID for local jobs) and status to RUNNING
        async with db_session_factory() as db:
            job_to_update = await db.get(ai_models.AITrainingJob, job.id)
            if job_to_update:
                job_to_update.external_job_id = str(process.pid)
                job_to_update.status = JobStatus.RUNNING
                job_to_update.started_at = datetime.now(timezone.utc)
                job_to_update.logs_url = f"file://{stdout_log_path}" # Or stderr, or a combined view
                await db.commit()
            else: # Should not happen if called correctly
                logger.error(f"[LocalRunner job_id={job.id}]: Job disappeared from DB before PID update. Terminating process {process.pid}.")
                process.terminate() # or process.kill()
                await process.wait() # ensure it's terminated
                await stdout_file.close()
                await stderr_file.close()
                return

        # Schedule monitoring task (fire and forget with asyncio.create_task)
        asyncio.create_task(monitor_local_job_completion(
            job_id=job.id,
            process_pid=process.pid, # Pass PID for logging
            process_handle=process, # Pass the process handle
            model_output_dir=model_output_dir,
            stdout_log_path=stdout_log_path,
            stderr_log_path=stderr_log_path,
            stdout_file=stdout_file, # Pass file handles to close them in monitor
            stderr_file=stderr_file,
            db_session_factory=db_session_factory
        ))
        logger.info(f"[LocalRunner job_id={job.id}]: Monitoring task for PID {process.pid} scheduled.")

    except Exception as e:
        logger.error(f"[LocalRunner job_id={job.id}]: Failed to start or monitor training script: {e}", exc_info=True)
        async with db_session_factory() as db:
            job_to_fail = await db.get(ai_models.AITrainingJob, job.id)
            if job_to_fail:
                job_to_fail.status = JobStatus.FAILED
                job_to_fail.error_message = f"Script Execution Error: {str(e)[:500]}"
                job_to_fail.completed_at = datetime.now(timezone.utc)
                await db.commit()
        # Clean up log files if they were opened
        if 'stdout_file' in locals() and stdout_file and not stdout_file.closed: await stdout_file.close()
        if 'stderr_file' in locals() and stderr_file and not stderr_file.closed: await stderr_file.close()


async def monitor_local_job_completion(
    job_id: str,
    process_pid: int,
    process_handle: asyncio.subprocess.Process,
    model_output_dir: Path,
    stdout_log_path: Path, # For final log URL update
    stderr_log_path: Path, # For error messages
    stdout_file: asyncio.StreamWriter, # Or the file object if not using PIPE
    stderr_file: asyncio.StreamWriter, # Or the file object
    db_session_factory: Callable[[], Session]
):
    """Monitors a local training Popen process and updates the job status upon completion."""
    logger.info(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Now monitoring process for completion.")
    
    try:
        return_code = await process_handle.wait() # Wait for the process to terminate
        logger.info(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Process terminated with return code {return_code}.")
    finally:
        # Ensure log files are closed
        if stdout_file and hasattr(stdout_file, 'close') and not stdout_file.closed: # type: ignore
            await stdout_file.close() # type: ignore
        if stderr_file and hasattr(stderr_file, 'close') and not stderr_file.closed: # type: ignore
            await stderr_file.close() # type: ignore

    async with db_session_factory() as db:
        job = await db.get(ai_models.AITrainingJob, job_id)
        if not job:
            logger.error(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Job not found in DB after process completion. Cannot update status.")
            return

        job.completed_at = datetime.now(timezone.utc)
        metrics = {}
        error_msg_from_script = ""

        # Try to read metrics from the script's output directory
        metrics_file_path = model_output_dir / "training_metrics.json"
        if await aios.path.exists(metrics_file_path):
            try:
                async with aiofiles.open(metrics_file_path, "r") as f:
                    metrics = json.loads(await f.read())
                job.metrics = metrics
                logger.info(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Loaded metrics from {metrics_file_path}: {metrics}")
            except Exception as e:
                logger.warning(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Failed to read or parse metrics file {metrics_file_path}: {e}")
                error_msg_from_script += f"Failed to parse metrics.json: {str(e)[:100]}; "
        else:
            logger.info(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Metrics file {metrics_file_path} not found.")


        if return_code == 0:
            job.status = JobStatus.COMPLETED
            # For local jobs, the output_model_url is the path to the model_output_dir
            job.output_model_storage_type = StorageType.LOCAL_FS
            job.output_model_url = str(model_output_dir.resolve())
            logger.info(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Job marked as COMPLETED. Output at {job.output_model_url}")
        else:
            job.status = JobStatus.FAILED
            error_lines = []
            if await aios.path.exists(stderr_log_path):
                try:
                    async with aiofiles.open(stderr_log_path, "r") as f_err:
                        # Read last N lines or first N lines for brevity
                        async for line in f_err: # Read all for now, can be limited
                            error_lines.append(line.strip())
                    if error_lines:
                        error_msg_from_script += "Stderr: " + " | ".join(error_lines[-5:]) # Last 5 lines
                except Exception as e_read_err:
                    logger.warning(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Could not read stderr log {stderr_log_path}: {e_read_err}")
            
            job.error_message = (job.error_message or "") + f"Script exited with code {return_code}. " + error_msg_from_script
            job.error_message = job.error_message[:1020] # Truncate for DB
            logger.error(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Job marked as FAILED. Error: {job.error_message}")

        try:
            await db.commit()
            logger.info(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: Final job status ({job.status.value}) committed to DB.")
            
            # --- Trigger Hugging Face Upload if COMPLETED ---
            # This mimics the webhook logic but for local jobs
            if job.status == JobStatus.COMPLETED and \
               job.training_script_config and \
               job.training_script_config.get("target_hf_repo_id") and \
               (HUGGING_FACE_HUB_TOKEN_MLOPS and HUGGING_FACE_HUB_TOKEN_MLOPS.get_secret_value()):
                
                from app.ai_training.services import process_and_upload_to_hf_background # Avoid circular import at top level
                logger.info(f"[LocalMonitor job_id={job.id}]: Job COMPLETED, queueing HF upload task.")
                asyncio.create_task(process_and_upload_to_hf_background(
                    job_id=job.id,
                    db_session_factory=db_session_factory
                ))
            elif job.status == JobStatus.COMPLETED and \
                 job.training_script_config and \
                 job.training_script_config.get("target_hf_repo_id") and \
                 not (HUGGING_FACE_HUB_TOKEN_MLOPS and HUGGING_FACE_HUB_TOKEN_MLOPS.get_secret_value()):
                 logger.warning(f"[LocalMonitor job_id={job.id}]: Job COMPLETED, but MLOps HF token not set. Skipping HF upload task.")
                 job.error_message = (job.error_message or "") + "; HF Upload Skipped: MLOps HF token missing."
                 await db.commit()


        except Exception as e_commit:
            logger.error(f"[LocalMonitor job_id={job_id}, PID={process_pid}]: DB Error committing final status: {e_commit}", exc_info=True)
            # Job status might not be updated in DB if this fails.