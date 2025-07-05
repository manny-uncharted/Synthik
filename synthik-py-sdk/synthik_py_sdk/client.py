# mlops_sdk/client.py

import os
import httpx
from typing import Optional, List

from .exceptions import MlopsError
from .models import (
    TrainingJobCreate,
    TrainingJobResponse,
    TrainingJobStatus,
    UserCredCreate,
    UserCredResponse
)
from .utils import get_api_url, get_wallet_address


class MlopsClient:
    def __init__(self, api_url: Optional[str] = None):
        self.api_url = api_url or get_api_url()
        self._session = httpx.Client(base_url=self.api_url, timeout=30.0)

    # ----- Training Jobs -----

    def submit_job(
        self,
        name: str,
        dataset_id: str,
        platform: str,
        credential_id: Optional[str] = None,
        model_type: Optional[str] = None,
        hyperparameters: dict = {},
        config: dict = {}
    ) -> TrainingJobResponse:
        payload = TrainingJobCreate(
            job_name=name,
            user_wallet_address=get_wallet_address(),
            processed_dataset_id=dataset_id,
            platform=platform,
            user_credential_id=credential_id,
            model_type=model_type,
            hyperparameters=hyperparameters,
            training_script_config=config
        ).dict(exclude_none=True)

        resp = self._session.post("/training-jobs", json=payload)
        if resp.status_code != 202:
            raise MlopsError.from_response(resp)
        return TrainingJobResponse.parse_obj(resp.json())

    def get_job(self, job_id: str) -> TrainingJobResponse:
        resp = self._session.get(f"/training-jobs/{job_id}")
        if resp.status_code != 200:
            raise MlopsError.from_response(resp)
        return TrainingJobResponse.parse_obj(resp.json())

    def list_jobs(self, wallet: Optional[str] = None) -> List[TrainingJobStatus]:
        wallet = wallet or get_wallet_address()
        resp = self._session.get(f"/training-jobs/by-user/{wallet}")
        if resp.status_code != 200:
            raise MlopsError.from_response(resp)
        return [TrainingJobStatus.parse_obj(item) for item in resp.json()]

    # ----- User Credentials -----

    def create_credential(
        self,
        platform: str,
        credential_name: str,
        api_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        additional_config: dict = {}
    ) -> UserCredResponse:
        payload = UserCredCreate(
            user_wallet_address=get_wallet_address(),
            platform=platform,
            credential_name=credential_name,
            api_key=api_key,
            secret_key=secret_key,
            additional_config=additional_config
        ).dict(exclude_none=True)

        resp = self._session.post("/user-credentials", json=payload)
        if resp.status_code != 201:
            raise MlopsError.from_response(resp)
        return UserCredResponse.parse_obj(resp.json())

    def get_credential(self, credential_id: str) -> UserCredResponse:
        resp = self._session.get(f"/user-credentials/{credential_id}")
        if resp.status_code != 200:
            raise MlopsError.from_response(resp)
        return UserCredResponse.parse_obj(resp.json())

    def list_credentials(self, wallet: Optional[str] = None) -> List[UserCredResponse]:
        wallet = wallet or get_wallet_address()
        resp = self._session.get(f"/user-credentials/by-user/{wallet}")
        if resp.status_code != 200:
            raise MlopsError.from_response(resp)
        return [UserCredResponse.parse_obj(item) for item in resp.json()]

    def delete_credential(self, credential_id: str) -> None:
        resp = self._session.delete(f"/user-credentials/{credential_id}")
        if resp.status_code not in (204, 200):
            raise MlopsError.from_response(resp)
        # No content on success

    # ----- Cleanup -----

    def close(self):
        self._session.close()
