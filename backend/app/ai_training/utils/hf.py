# mlops_sdk/utils/hf.py

import os
from typing import Optional

from huggingface_hub import HfApi, HfFolder, ModelCardData
from huggingface_hub.utils import RepositoryNotFoundError

from app.ai_training.utils.signature import verify_signature
from app.core.enums.ai_training import HFRepoType  # e.g. "model" or "space"


class HFError(Exception):
    pass


class HFHandler:
    """
    Simplified interface for creating/updating HF repos and uploading model artifacts.
    """

    def __init__(self, token: Optional[str] = None):
        self.token = token or os.getenv("HUGGINGFACE_TOKEN")
        if not self.token:
            raise HFError("Hugging Face token must be provided")
        self.api = HfApi(token=self.token)

    def ensure_repo(
        self,
        repo_id: str,
        repo_type: HFRepoType = HFRepoType.MODEL,
        private: bool = False,
    ) -> None:
        """
        Create the repo if it doesn't exist, else ignore.
        """
        try:
            self.api.create_repo(
                repo_id=repo_id,
                token=self.token,
                repo_type=repo_type.value,
                private=private,
                exist_ok=True,
            )
        except RepositoryNotFoundError as e:
            raise HFError(f"Failed to create HF repo {repo_id}: {e}")

    def generate_model_card(self, metadata: dict) -> str:
        """
        Build a minimal Model Card in Markdown from metadata dict.
        """
        card = ModelCardData(
            language="en",
            license=metadata.get("license", "mit"),
            library_name=metadata.get("library_name", "transformers"),
            tags=metadata.get("tags", []),
            model_name=metadata.get("model_name"),
            pipeline_tag=metadata.get("pipeline_tag"),
        )
        return f"---\n{card.to_yaml()}\n---\n\n" + metadata.get("long_description", "")

    def upload_folder(
        self,
        local_dir: str,
        repo_id: str,
        commit_message: Optional[str] = None,
        repo_type: HFRepoType = HFRepoType.MODEL,
        generate_card: bool = True,
        card_metadata: Optional[dict] = None,
        private: bool = False,
    ) -> str:
        """
        Upload entire folder to HF. Returns the repo URL.
        """
        # ensure repo exists
        self.ensure_repo(repo_id, repo_type=repo_type, private=private)

        # write model card if missing
        readme = Path(local_dir) / "README.md"
        if generate_card and not readme.exists():
            content = self.generate_model_card(card_metadata or {})
            readme.write_text(content, encoding="utf-8")

        # push all files
        url = self.api.upload_folder(
            folder_path=local_dir,
            repo_id=repo_id,
            repo_type=repo_type.value,
            commit_message=commit_message or f"Upload model artifacts to {repo_id}",
            token=self.token,
        )
        return url
