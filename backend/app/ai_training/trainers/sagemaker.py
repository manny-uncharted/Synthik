# mlops_sdk/trainers/sagemaker.py

import os
from typing import Tuple

import boto3
from sagemaker.pytorch import PyTorch
from sagemaker.debugger import TensorBoardOutputConfig

from app.ai_training.trainers.base import BaseTrainer, TrainerError
from app.core.enums.ai_training import JobStatus, StorageType


class SageMakerTrainer(BaseTrainer):
    def submit(self) -> Tuple[str, JobStatus]:
        role = self.credentials["role_arn"]
        tb_cfg = TensorBoardOutputConfig(
            s3_output_path=self.script_config["tensorboard_s3"],
            container_local_output_path="/opt/ml/output/tensorboard"
        )
        estimator = PyTorch(
            entry_point=self.script_config["entry_point"],
            source_dir=self.script_config["source_dir"],
            role=role,
            framework_version=self.script_config["framework_version"],
            py_version=self.script_config["py_version"],
            instance_count=self.script_config["instance_count"],
            instance_type=self.script_config["instance_type"],
            hyperparameters=self.hyperparameters,
            tensorboard_config=tb_cfg,
            base_job_name=self.platform_job_id
        )

        # Prepare channels and data
        self.prepare_data(self.script_config["channels"])

        inputs = {
            channel: f"{self.work_dir}/input/{channel}"
            for channel in self.script_config["channels"]
        }
        # Launch
        job_name = estimator.fit(inputs, wait=False)
        return job_name, JobStatus.QUEUED

    def status(self, external_job_id: str) -> JobStatus:
        client = boto3.client(
            "sagemaker",
            region_name=self.credentials.get("aws_region")
        )
        resp = client.describe_training_job(TrainingJobName=external_job_id)
        sm_state = resp["TrainingJobStatus"]
        mapping = {
            "InProgress": JobStatus.RUNNING,
            "Completed":  JobStatus.COMPLETED,
            "Failed":     JobStatus.FAILED,
            "Stopping":   JobStatus.CANCELLING,
            "Stopped":    JobStatus.CANCELLED,
        }
        return mapping.get(sm_state, JobStatus.UNKNOWN)
