# mlops_sdk/trainers/vertex.py

from typing import Tuple
from google.cloud import aiplatform

from app.ai_training.trainers.base import BaseTrainer, TrainerError
from app.core.enums.ai_training import JobStatus, StorageType

class VertexAITrainer(BaseTrainer):
    def submit(self) -> Tuple[str, JobStatus]:
        """
        Submits a Vertex AI custom training job from a local Python script.
        Expects in `script_config`:
          - entry_point: path to .py script
          - container_uri: training container image
          - requirements: optional list of pip requirements
          - region: GCP region
          - staging_bucket: GCS bucket for staging
        """
        try:
            # Initialize Vertex AI SDK
            aiplatform.init(
                project=self.credentials["gcp_project_id"],
                staging_bucket=self.script_config["staging_bucket"],
                location=self.script_config["region"],
            )

            # Prepare input channels locally
            self.prepare_data(self.script_config["channels"])

            job = aiplatform.CustomJob.from_local_script(
                display_name=self.platform_job_id,
                script_path=self.script_config["entry_point"],
                container_uri=self.script_config["container_uri"],
                requirements=self.script_config.get("requirements", []),
                replica_count= self.script_config.get("replica_count", 1),
                machine_type= self.script_config.get("machine_type", "n1-standard-4"),
                base_output_dir=f"gs://{self.script_config['staging_bucket']}/{self.platform_job_id}/output",
            )

            custom_job = job.run(sync=False)
            return custom_job.resource_name, JobStatus.QUEUED

        except Exception as e:
            raise TrainerError(f"Vertex AI submission failed: {e}")

    def status(self, external_job_id: str) -> JobStatus:
        try:
            job = aiplatform.CustomJob(external_job_id)
            state = job.state
            mapping = {
                aiplatform.gapic.JobState.JOB_STATE_QUEUED:    JobStatus.QUEUED,
                aiplatform.gapic.JobState.JOB_STATE_PENDING:   JobStatus.INITIALIZING,
                aiplatform.gapic.JobState.JOB_STATE_RUNNING:   JobStatus.RUNNING,
                aiplatform.gapic.JobState.JOB_STATE_SUCCEEDED: JobStatus.COMPLETED,
                aiplatform.gapic.JobState.JOB_STATE_FAILED:    JobStatus.FAILED,
                aiplatform.gapic.JobState.JOB_STATE_CANCELLING:JobStatus.CANCELLING,
                aiplatform.gapic.JobState.JOB_STATE_CANCELLED: JobStatus.CANCELLED,
            }
            return mapping.get(state, JobStatus.UNKNOWN)
        except Exception as e:
            raise TrainerError(f"Vertex AI status check failed: {e}")
