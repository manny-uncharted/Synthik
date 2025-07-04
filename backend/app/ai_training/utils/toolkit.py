import logging
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
from urllib.parse import urlparse
import uuid

from app.core.constants import FASTAPI_BASE_URL_CAMPAIGN_API, HUGGING_FACE_HUB_TOKEN_MLOPS, AWS_ACCESS_KEY_ID_MLOPS, AWS_SECRET_ACCESS_KEY_MLOPS, AWS_REGION_MLOPS
from app.storage import WalrusClient

try:
    from app.ai_agents.enterprise_workflow import (
        BaseTool as WFBaseTool,
    )
except ImportError as e:
    logging.critical(f"Failed to import from enterprise_workflow.py: {e}. API will have limited functionality.")
    class WFBaseTool: pass
    def wf_tool(func): return func
    WFWorkflowDefinition = Dict
    class EnterpriseWorkflowManager:
        def __init__(self, *args, **kwargs): raise NotImplementedError("Workflow system not loaded")
    class WFAppConfig: 
        FASTAPI_BASE_URL = FASTAPI_BASE_URL_CAMPAIGN_API
        HUGGING_FACE_HUB_TOKEN = HUGGING_FACE_HUB_TOKEN_MLOPS
        AWS_ACCESS_KEY_ID = AWS_ACCESS_KEY_ID_MLOPS
        AWS_SECRET_ACCESS_KEY = AWS_SECRET_ACCESS_KEY_MLOPS
        AWS_REGION = AWS_REGION_MLOPS


# --- Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger("MLOpsAPI_v2") # Updated logger name


# --- Conceptual Tools for AI Training Workflows (Enhanced) ---
# For boto3, ensure it's installed: pip install boto3
# For Hugging Face Hub: pip install huggingface_hub
# These tools would ideally live in a separate module and be registered with the EnterpriseWorkflowManager.

class WalrusStorageTool(WFBaseTool):
    name: str = "walrus_storage"
    description: str = "Interacts with Walrus storage to upload, download, and read blobs."

    def __init__(self, aggregator_url: str, publisher_url: str):
        super().__init__()
        self.walrus_client = WalrusClient(aggregator_url=aggregator_url, publisher_url=publisher_url)

    def _run(self, action: str, **kwargs: Any) -> Dict[str, Any]:
        raise NotImplementedError("Use _arun for Walrus operations as they are asynchronous.")

    async def _arun(self, action: str, **kwargs: Any) -> Dict[str, Any]:
        logger.info(f"WalrusStorageTool: Action='{action}', Args='{kwargs}'")
        try:
            if action == "upload":
                data = kwargs.get("data")
                file_path = kwargs.get("file_path")
                epochs = kwargs.get("epochs")
                send_object_to = kwargs.get("send_object_to")
                deletable = kwargs.get("deletable", False)

                if data is not None and file_path is not None:
                    return {"status": "error", "action": action, "message": "Provide only one of 'data' or 'file_path'."}

                if data is not None:
                    response = await self.walrus_client.store_blob(data=data, epochs=epochs, send_object_to=send_object_to, deletable=deletable)
                    return {"status": "success", "action": action, "response": response}
                elif file_path is not None:
                    response = await self.walrus_client.store_blob(data=Path(file_path), epochs=epochs, send_object_to=send_object_to, deletable=deletable)
                    return {"status": "success", "action": action, "response": response}
                else:
                    return {"status": "error", "action": action, "message": "Must provide 'data' or 'file_path' for upload."}

            elif action == "download":
                blob_id = kwargs.get("blob_id")
                output_path = kwargs.get("output_path")
                if not blob_id:
                    return {"status": "error", "action": action, "message": "Must provide 'blob_id' for download."}
                try:
                    data = await self.walrus_client.read_blob(blob_id=blob_id, output_path=Path(output_path) if output_path else None)
                    if output_path:
                        return {"status": "success", "action": action, "message": f"Blob downloaded to {output_path}"}
                    else:
                        return {"status": "success", "action": action, "data": data}
                except Exception as e:
                    return {"status": "error", "action": action, "message": f"Download failed: {e}"}

            elif action == "read":
                blob_id = kwargs.get("blob_id")
                if not blob_id:
                    return {"status": "error", "action": action, "message": "Must provide 'blob_id' to read."}
                try:
                    data = await self.walrus_client.read_blob(blob_id=blob_id)
                    return {"status": "success", "action": action, "data": data}
                except Exception as e:
                    return {"status": "error", "action": action, "message": f"Read failed: {e}"}

            elif action == "get_api_specification":
                try:
                    spec = await self.walrus_client.get_api_specification()
                    return {"status": "success", "action": action, "specification": spec}
                except Exception as e:
                    return {"status": "error", "action": action, "message": f"Failed to get API spec: {e}"}

            else:
                return {"status": "error", "action": action, "message": f"Invalid action: {action}"}
        except Exception as e:
            return {"status": "error", "action": action, "message": f"Tool execution failed: {e}"}
        finally:
            await self.walrus_client.close()


class DataPreprocessorTool(WFBaseTool):
    name: str = "data_preprocessor"
    description: str = "Executes data preprocessing steps for AI training.  Handles downloading data from Walrus, preprocessing, and uploading results to Walrus."

    def __init__(self, walrus_storage_tool: "WalrusStorageTool"):
        super().__init__()
        self.walrus_storage_tool = walrus_storage_tool


    def _run(self, *args, **kwargs) -> Dict[str, Any]:
        raise NotImplementedError("Use _arun for the DataPreprocessorTool as it involves asynchronous operations.")


    async def _arun(self, input_data_urls: Union[str, List[str]], output_bucket: str, output_key_prefix: str, processing_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes data for AI training, including downloading from Walrus, preprocessing, and uploading back to Walrus.

        Args:
            input_data_urls:  A URL (str) or a list of Walrus URLs (list of str) pointing to the input data.
            output_bucket: The Walrus bucket to upload the processed data to.
            output_key_prefix: The Walrus key prefix to use for the processed data.
            processing_config:  A dictionary containing configuration parameters for the preprocessing step.
        """
        logger.info(f"DataPreprocessorTool: Processing data from '{input_data_urls}', Output: walrus://{output_bucket}/{output_key_prefix}, Config: {processing_config}")

        local_input_paths = []
        local_output_path = f"/tmp/processed_data_{str(uuid.uuid4())[:8]}"  # Local temp directory
        processed_data_key = f"{output_key_prefix.rstrip('/')}/processed_data_{str(uuid.uuid4())[:8]}"

        # 1. take the onchain campaign id and then extract the campaign id and the campaign type
        # 2. Using the campaign id check the contribution submisssions and extract all the data urls.
        # 3 using the data urls which are also the blob id download the data from Walrus.
        # 4. Preprocess the data based on the campaign type.
        # 5. Upload the processed data to Walrus and return the new blob id and store it as preprocessed dataset

        try:
            # 1. Download data from Walrus (handling single URL or list of URLs)
            if isinstance(input_data_urls, str):
                input_data_urls = [input_data_urls]  # Ensure it's always a list for consistent processing

            for i, input_data_url in enumerate(input_data_urls):
                parsed_url = urlparse(input_data_url)
                if parsed_url.scheme != "walrus":
                    return {"status": "error", "message": f"Unsupported input URL scheme: {parsed_url.scheme}. Expected 'walrus://bucket/key'."}

                input_bucket = parsed_url.netloc
                input_key = parsed_url.path.lstrip('/')
                local_input_path = f"/tmp/input_data_{str(uuid.uuid4())[:8]}_{i}"  # Unique local path
                local_input_paths.append(local_input_path)  # Store path for later processing

                download_result = await self.walrus_storage_tool._arun(
                    action="download",
                    blob_id=input_key,  # Assuming the key is the blob_id in Walrus
                    output_path=local_input_path
                )

                if download_result.get("status") == "error":
                    return {"status": "error", "message": f"Failed to download input data from {input_data_url}: {download_result.get('message')}"}
                logger.info(f"DataPreprocessorTool: Successfully downloaded data from '{input_data_url}' to '{local_input_path}'.")

            # 2. Perform preprocessing based on campaign type
            logger.info(f"DataPreprocessorTool: Starting preprocessing with config: {processing_config}")
            campaign_type = processing_config.get("campaign_type")  # Get campaign type

            if campaign_type == "CSV":
                await self.process_csv_data(local_input_paths, local_output_path)
            elif campaign_type == "TEXT":
                await self.process_text_data(local_input_paths, local_output_path)
            elif campaign_type == "IMAGE":
                await self.process_image_data(local_input_paths, local_output_path)
            else:
                return {"status": "error", "message": f"Unsupported campaign type: {campaign_type}"}
            logger.info(f"DataPreprocessorTool: Preprocessing complete. Output saved to '{local_output_path}'.")

            # 3. Upload processed data to Walrus
            upload_result = await self.walrus_storage_tool._arun(
                action="upload",
                bucket=output_bucket,
                key=processed_data_key,
                file_path=local_output_path
            )

            if upload_result.get("status") == "error":
                return {"status": "error", "message": f"Failed to upload processed data: {upload_result.get('message')}"}

            processed_data_url = f"walrus://{output_bucket}/{processed_data_key}"
            logger.info(f"DataPreprocessorTool: Successfully uploaded processed data to '{processed_data_url}'.")

            return {
                "status": "success",
                "processed_data_url": processed_data_url,
                "message": "Data preprocessing and upload to Walrus complete."
            }

        except Exception as e:
            logger.error(f"DataPreprocessorTool: Error during processing: {e}", exc_info=True)
            return {"status": "error", "message": f"Data preprocessing failed: {e}"}
        finally:
            # Clean up local files
            for path in local_input_paths:
                try:
                    Path(path).unlink(missing_ok=True)
                except Exception as e:
                    logger.warning(f"DataPreprocessorTool: Error cleaning up local input file {path}: {e}")
            try:
                Path(local_output_path).unlink(missing_ok=True)
            except Exception as e:
                logger.warning(f"DataPreprocessorTool: Error cleaning up local output file: {e}")


    async def process_csv_data(self, local_input_paths: List[str], local_output_path: str):
        """
        Merges multiple CSV files into a single CSV file.

        Args:
            local_input_paths: List of paths to the local CSV files.
            local_output_path: Path to save the merged CSV file.
        """
        import pandas as pd
        all_data = []
        for path in local_input_paths:
            try:
                df = pd.read_csv(path)
                all_data.append(df)
            except Exception as e:
                raise Exception(f"Error reading CSV file {path}: {e}")
        if all_data:
            merged_df = pd.concat(all_data, ignore_index=True)
            merged_df.to_csv(local_output_path, index=False)
        else:
            Path(local_output_path).touch()  # Create empty file


    async def process_text_data(self, local_input_paths: List[str], local_output_path: str):
        """
        Merges multiple text files into a single text file.

        Args:
            local_input_paths: List of paths to the local text files.
            local_output_path: Path to save the merged text file.
        """
        with open(local_output_path, "w") as outfile:
            for path in local_input_paths:
                try:
                    with open(path, "r") as infile:
                        for line in infile:
                            outfile.write(line)
                except Exception as e:
                    raise Exception(f"Error reading text file {path}: {e}")


    async def process_image_data(self, local_input_paths: List[str], local_output_path: str):
        """
        Groups multiple image files into a ZIP archive.

        Args:
            local_input_paths: List of paths to the local image files.
            local_output_path: Path to save the ZIP archive.
        """
        import zipfile
        with zipfile.ZipFile(local_output_path, "w") as zipf:
            for path in local_input_paths:
                try:
                    zipf.write(path, Path(path).name)  # Store with original filename
                except Exception as e:
                    raise Exception(f"Error adding image file {path} to ZIP: {e}")