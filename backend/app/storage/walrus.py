import httpx
from typing import Optional, Dict, Union
from pathlib import Path

from app.storage.schemas import (
    WalrusStoreResponse,
)
from app.core.constants import AGGREGATOR_URL, PUBLISHER_URL

class WalrusClient:
    """
    A Python client for interacting with the Walrus HTTP API using httpx.
    """

    def __init__(
        self,
        aggregator_url: str = AGGREGATOR_URL, 
        publisher_url: str = PUBLISHER_URL
    ):
        """
        Initializes the WalrusClient with the URLs for the aggregator and publisher.

        Args:
            aggregator_url: The URL of the Walrus aggregator (e.g., "http://localhost:8080").
            publisher_url: The URL of the Walrus publisher (e.g., "http://localhost:8081").
        """
        self.aggregator_url = aggregator_url.rstrip('/')
        self.publisher_url = publisher_url.rstrip('/')
        self.client = httpx.AsyncClient()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def close(self):
        """
        Closes the httpx AsyncClient session.
        """
        await self.client.aclose()

    async def store_blob(
        self,
        data: Union[str, bytes, Path],
        epochs: Optional[int] = None,
        send_object_to: Optional[str] = None,
        deletable: bool = False,
    ) -> WalrusStoreResponse: # Assuming WalrusStoreResponse is your Pydantic model
        """
        Stores a blob in Walrus using an HTTP PUT request to the publisher.
        ... (rest of the docstring) ...
        """
        url = f"{self.publisher_url}/v1/blobs"
        params = {}
        files = {} # To store file objects if data is a Path

        if epochs is not None:
            params["epochs"] = epochs
        if send_object_to is not None:
            params["send_object_to"] = send_object_to
        if deletable:
            params["deletable"] = "true" # Send as string "true" if API expects that

        # Prepare data or files
        actual_data_to_send = None
        if isinstance(data, str):
            actual_data_to_send = data.encode() # Typically, content is bytes
        elif isinstance(data, bytes):
            actual_data_to_send = data
        elif isinstance(data, Path):
            if not data.is_file():
                raise FileNotFoundError(f"File not found: {data}")
            # httpx handles opening/closing when 'files' dict is passed
            # Keep 'data' as None if 'files' is used
            files = {"file": open(data, "rb")}
            actual_data_to_send = None # Explicitly set to None when using 'files'
        else:
            raise TypeError(
                "Data must be a string, bytes, or a Path object pointing to a file."
            )

        try:
            # Increased default timeout for potentially large uploads
            # You can make this configurable if needed
            timeout_config = httpx.Timeout(10.0, read=60.0) # 10s connect, 60s read

            response = await self.client.put(
                url,
                params=params,
                content=actual_data_to_send, # Use 'content' for bytes/str
                files=files,                 # Use 'files' for file uploads
                timeout=timeout_config
            )
            response.raise_for_status() # Raises HTTPStatusError for 4xx/5xx
            return response.json()

        except httpx.HTTPStatusError as e: # Handles errors where a response WAS received (4xx, 5xx)
            # This is a specific type of HTTPError that HAS a .response attribute
            print(f"HTTP Status Error storing blob: {e}")
            print(f"Request URL: {e.request.url}")
            print(f"Response status code: {e.response.status_code}")
            print(f"Response content: {e.response.text}")
            raise # Re-raise the original HTTPStatusError
        except httpx.RequestError as e: # Handles other errors like ReadTimeout, ConnectError
            # This is a broader category. ReadTimeout, ConnectError, etc., do NOT have .response
            print(f"Request Error storing blob: {e}")
            print(f"Request URL: {e.request.url}")
            # Do NOT try to access e.response here if it might not exist
            raise # Re-raise the original RequestError (e.g., ReadTimeout)
        finally:
            # Ensure the file is closed if it was opened for the 'files' parameter
            if "file" in files and files["file"]:
                files["file"].close()

    async def read_blob(
        self,
        blob_id: str,
        output_path: Optional[Path] = None,
    ) -> Union[bytes, str, None]:
        """
        Reads a blob from Walrus using an HTTP GET request to the aggregator.

        Args:
            blob_id: The ID of the blob to read.
            output_path: Optional file path to save the blob data.
                If None, the blob data is returned as bytes.

        Returns:
            The blob data as bytes if output_path is None, or None if the data is saved to a file.
            Returns the blob data as string if it can be decoded

        Raises:
            httpx.HTTPError: If the request fails.
        """
        url = f"{self.aggregator_url}/v1/blobs/{blob_id}"
        try:
            response = await self.client.get(url)
            response.raise_for_status()
            content = response.content
            if output_path:
                with open(output_path, "wb") as f: f.write(content)
                return None
            try: # Attempt to decode only if not writing to file
                return content.decode("utf-8")
            except UnicodeDecodeError:
                return content # Return raw bytes if not decodable
        except httpx.HTTPError as e:
            # print(f"Error reading blob: {e}")
            # print(f"Response content: {e.response.text}")
            raise

    async def get_api_specification(self) -> Dict:
        """
        Retrieves the Walrus API specification from the aggregator.

        Returns:
            A dictionary representing the API specification.

        Raises:
            httpx.HTTPError: If the request fails.
        """
        url = f"{self.aggregator_url}/v1/api"
        try:
            response = await self.client.get(url)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            print(f"Error retrieving API specification: {e}")
            print(f"Response content: {e.response.text}")
            raise