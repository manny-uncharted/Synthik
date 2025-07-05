# mlops_sdk/trainers/hf_space.py

from typing import Tuple
from huggingface_hub import HfApi, Repository

from app.ai_training.trainers.base import BaseTrainer, TrainerError
from app.core.enums.ai_training import JobStatus, StorageType

class HFSpaceTrainer(BaseTrainer):
    def submit(self) -> Tuple[str, JobStatus]:
        """
        Creates (or reuses) a Hugging Face Space for training.
        Expects in `credentials`: hf_token, hf_username
        In `script_config`:
          - repo_private: bool
          - space_sdk: e.g. 'gradio' or 'streamlit'
        """
        try:
            hf_api = HfApi(token=self.credentials["hf_token"])
            repo_id = f"{self.credentials['hf_username']}/{self.platform_job_id}"

            # Create or get Space
            hf_api.create_repo(
                repo_id=repo_id,
                repo_type="space",
                private=self.script_config.get("repo_private", False),
                exist_ok=True,
            )

            # Prepare local code folder: copy entry_point & scripts
            local_space_dir = f"{self.work_dir}/space_repo"
            # → assume user supplied `source_dir` in script_config
            Repository(local_space_dir, clone_from=repo_id, token=self.credentials["hf_token"])\
                .add_and_commit(\
                    folder_path=self.script_config["source_dir"], \
                    commit_message="Initial training Space setup"\
                 )\
                .push_to_hub()

            # Dataset can be pulled at runtime in the Space via StorageHandler
            return repo_id, JobStatus.SUBMITTED

        except Exception as e:
            raise TrainerError(f"Hugging Face Space submission failed: {e}")

    def status(self, external_job_id: str) -> JobStatus:
        """
        For Spaces, we treat creation as complete immediately.
        One could poll HF Inference API or check Space builds, but here:
        """
        # TODO: implement polling of Space build status via Hugging Face REST API
        return JobStatus.COMPLETED
