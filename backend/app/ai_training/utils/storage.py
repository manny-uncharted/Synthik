# mlops_sdk/utils/storage.py

import os
import shutil
import tarfile
import zipfile
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import boto3
from google.cloud import storage as gcs_storage

from app.core.enums.ai_training import StorageType


# TODO: add the implementation for pulling data from other web3 storage

class StorageError(Exception):
    pass


class StorageHandler:
    """
    Unified interface for downloading and extracting dataset or artifact content
    from LOCAL, S3, or GCS.
    """

    @staticmethod
    def download(
        url: str,
        dest_path: str,
        storage_type: StorageType,
        aws_region: str = None,
        aws_access_key_id: str = None,
        aws_secret_access_key: str = None,
        gcp_project: str = None,
        gcp_credentials_path: str = None,
    ) -> None:
        """
        Download a file or directory from the given URL to dest_path.
        If it's a directory on LOCAL, it copies recursively.
        """
        parsed = urlparse(url)
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)

        if storage_type == StorageType.LOCAL:
            src = Path(parsed.path)
            if src.is_dir():
                shutil.copytree(src, dest_path, dirs_exist_ok=True)
            elif src.is_file():
                shutil.copy2(src, dest_path)
            else:
                raise StorageError(f"Local path not found: {src}")

        elif storage_type == StorageType.S3:
            s3 = boto3.client(
                "s3",
                region_name=aws_region,
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
            )
            bucket, key = parsed.netloc, parsed.path.lstrip("/")
            s3.download_file(bucket, key, dest_path)

        elif storage_type == StorageType.GCS:
            client = (
                gcs_storage.Client.from_service_account_json(gcp_credentials_path)
                if gcp_credentials_path
                else gcs_storage.Client(project=gcp_project)
            )
            bucket = client.bucket(parsed.netloc)
            blob = bucket.blob(parsed.path.lstrip("/"))
            blob.download_to_filename(dest_path)

        else:
            raise StorageError(f"Unsupported storage type: {storage_type}")

    @staticmethod
    def extract_archive(archive_path: str, extract_to: str) -> None:
        """
        If archive_path is a .tar.gz/.tgz or .zip, extract contents under extract_to.
        Otherwise, copy file to extract_to.
        """
        os.makedirs(extract_to, exist_ok=True)
        if tarfile.is_tarfile(archive_path):
            with tarfile.open(archive_path, "r:*") as tf:
                tf.extractall(extract_to)
        elif zipfile.is_zipfile(archive_path):
            with zipfile.ZipFile(archive_path, "r") as zf:
                zf.extractall(extract_to)
        else:
            # not an archive, just copy
            shutil.copy2(archive_path, os.path.join(extract_to, os.path.basename(archive_path)))

    @classmethod
    def prepare_dataset(
        cls,
        url: str,
        storage_type: StorageType,
        target_dir: str,
        **credentials,
    ) -> None:
        """
        High-level: download (to temp if archive), extract if needed, clean up.
        """
        os.makedirs(target_dir, exist_ok=True)
        filename = os.path.basename(urlparse(url).path) or "dataset"
        is_archive = filename.endswith((".zip", ".tar.gz", ".tgz"))

        if is_archive:
            tmp = tempfile.mkdtemp()
            local_archive = os.path.join(tmp, filename)
            cls.download(url, local_archive, storage_type, **credentials)
            cls.extract_archive(local_archive, target_dir)
            shutil.rmtree(tmp)
        else:
            # Non-archive file—download straight into target_dir
            dest = os.path.join(target_dir, filename)
            cls.download(url, dest, storage_type, **credentials)
