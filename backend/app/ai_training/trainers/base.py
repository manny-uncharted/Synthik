# mlops_sdk/trainers/base.py

import abc
from typing import Tuple, Optional, Dict

from app.core.enums.ai_training import TrainingPlatform, JobStatus, StorageType
from app.ai_training.utils.storage import StorageHandler


class TrainerError(Exception):
    pass


class BaseTrainer(abc.ABC):
    """
    Abstract trainer interface. All platform-specific trainers must implement
    `submit` and `status` methods.
    """

    def __init__(
        self,
        platform_job_id: str,
        dataset_url: str,
        dataset_storage: StorageType,
        credentials: Dict,
        work_dir: str,
        hyperparameters: Dict,
        script_config: Dict,
    ):
        self.platform_job_id = platform_job_id
        self.dataset_url = dataset_url
        self.dataset_storage = dataset_storage
        self.credentials = credentials
        self.work_dir = work_dir
        self.hyperparameters = hyperparameters
        self.script_config = script_config

    def prepare_data(self, channel_map: Dict[str,str]) -> None:
        """
        Download & extract dataset splits into local channels:
          e.g. {'training': 's3://…/train', 'validation': 's3://…/dev'} →
                work_dir/input/training, work_dir/input/validation, …
        """
        for channel, url in channel_map.items():
            target = f"{self.work_dir}/input/{channel}"
            StorageHandler.prepare_dataset(
                url=url,
                storage_type=self.dataset_storage,
                target_dir=target,
                **self.credentials
            )

    @abc.abstractmethod
    def submit(self) -> Tuple[str, JobStatus]:
        """
        Kick off the training job.
        Returns (external_job_id, initial_status).
        """
        ...

    @abc.abstractmethod
    def status(self, external_job_id: str) -> JobStatus:
        """
        Query the platform for the job’s current status.
        """
        ...
