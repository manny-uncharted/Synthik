import os
import requests

class AkaveLinkAPIError(Exception):
    """Custom exception for Akave Link API errors."""
    pass

class AkaveLinkAPI:
    def __init__(self, base_url="https://akave.poeai.app/"):
        """
        Initialize the API client.
        
        :param base_url: Base URL where the Akave Link API is running.
                         (Default is http://localhost:8000)
        """
        self.base_url = base_url.rstrip('/')

    def _handle_response(self, response):
        """
        Process the API response.
        
        Raises an AkaveLinkAPIError if the response indicates a failure.
        
        :param response: requests.Response object returned from the API call.
        :return: Parsed JSON data from the response.
        """
        try:
            data = response.json()
        except ValueError:
            raise AkaveLinkAPIError("Invalid JSON response received.")
        
        # Handle cases where the HTTP status code indicates an error
        if not response.ok:
            error_message = data.get("error", "Unknown error occurred")
            raise AkaveLinkAPIError(error_message)
        
        # Check if the response data indicates an error (even if HTTP status is OK)
        if isinstance(data, dict):
            success = data.get("success", True)  # Default to True if 'success' is missing
            error_message = data.get("error")
            
            if not success or error_message:
                # Prioritize the error message from 'error' field, if available
                raise AkaveLinkAPIError(error_message or "Operation failed without specific error message")
        
        return data

    def _request(self, method, endpoint, json_data=None, files=None):
        """
        Internal helper method to perform an HTTP request.
        
        :param method: HTTP method as a string, e.g., "GET", "POST".
        :param endpoint: API endpoint (e.g., "/buckets").
        :param json_data: Python dictionary to be sent as JSON payload.
        :param files: Dictionary for file uploads.
        :return: Parsed API response.
        """
        url = f"{self.base_url}{endpoint}"
        try:
            response = requests.request(method, url, json=json_data, files=files)
            return self._handle_response(response)
        except requests.RequestException as e:
            raise AkaveLinkAPIError(str(e)) from e

    # -------------------------
    # Bucket Operations
    # -------------------------
    def create_bucket(self, bucket_name):
        """
        Create a new storage bucket.

        Returns just the bucket details (the dictionary of bucket details).
        
        :param bucket_name: Name of the bucket to create.
        :return: Bucket details as a dict.
        """
        endpoint = "/buckets"
        payload = {"bucketName": bucket_name}
        resp = self._request("POST", endpoint, json_data=payload)
        
        # Use the entire response if "data" key is not present
        bucket_data = resp.get("data", resp)
        if not isinstance(bucket_data, dict):
            raise AkaveLinkAPIError("Unexpected output format for bucket creation")
        return bucket_data

    def list_buckets(self):
        """
        Retrieve the list of all buckets.
        
        :return: API response (as dict) including a list of buckets under "data".
        """
        endpoint = "/buckets"
        return self._request("GET", endpoint)

    def get_bucket_details(self, bucket_name):
        """
        Retrieve details of a specific bucket.
        
        :param bucket_name: Name of the bucket.
        :return: API response (as dict).
        """
        endpoint = f"/buckets/{bucket_name}"
        return self._request("GET", endpoint)

    # -------------------------
    # File Operations
    # -------------------------
    def list_files(self, bucket_name):
        """
        Retrieve a list of files within a bucket.
        
        :param bucket_name: Name of the bucket.
        :return: API response (as dict).
        """
        endpoint = f"/buckets/{bucket_name}/files"
        return self._request("GET", endpoint)

    def get_file_info(self, bucket_name, file_name):
        """
        Fetch metadata about a specific file in a bucket.
        
        :param bucket_name: Name of the bucket.
        :param file_name: Name of the file.
        :return: API response (as dict).
        """
        endpoint = f"/buckets/{bucket_name}/files/{file_name}"
        return self._request("GET", endpoint)

    def upload_file(self, bucket_name, file_path):
        """
        Upload a file to a bucket.
        
        Note: The file should be at least 127 bytes and for testing, it is advised to keep the size under 100MB.
        
        :param bucket_name: Name of the bucket.
        :param file_path: Path to the file you want to upload.
        :return: API response (as dict).
        """
        endpoint = f"/buckets/{bucket_name}/files"
        if not os.path.exists(file_path):
            raise AkaveLinkAPIError(f"File not found: {file_path}")

        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f)}
            return self._request("POST", endpoint, files=files)

    def download_file(self, bucket_name, file_name, output_dir="."):
        """
        Download a file from a bucket.
        
        The file is saved to the specified output directory with the same file name.
        
        :param bucket_name: Name of the bucket.
        :param file_name: Name of the file to download.
        :param output_dir: Directory where the file should be saved.
        :return: The full path to the downloaded file.
        """
        endpoint = f"/buckets/{bucket_name}/files/{file_name}/download"
        url = f"{self.base_url}{endpoint}"
        output_path = os.path.join(output_dir, file_name)
        try:
            with requests.get(url, stream=True) as r:
                r.raise_for_status()
                with open(output_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
            return output_path
        except requests.RequestException as e:
            raise AkaveLinkAPIError(str(e)) from e

# ----------------------------------
# Example Usage (for testing)
# ----------------------------------
if __name__ == "__main__":
    # Instantiate the API client (make sure the Docker container is running)
    api = AkaveLinkAPI()
    bucket_name = "data_test_01"
    
    try:
        # Create a new bucket named "databucket"
        print(f"Creating bucket '{bucket_name}'...")
        bucket_details = api.create_bucket(bucket_name)
        print("Create Bucket Response:", bucket_details)
    except AkaveLinkAPIError as err:
        print("Error creating bucket:", err)

    try:
        # List all buckets
        print("\nListing all buckets...")
        buckets_resp = api.list_buckets()
        print("Buckets:", buckets_resp)
    except AkaveLinkAPIError as err:
        print("Error listing buckets:", err)


    # try:
    #     # Store to bucket
    #     print("\nStoring file to bucket...")
    #     file_path = "/Users/naija/Documents/gigs/DataHive/backend/books/_OceanofPDF.com_I_Knocked_Up_Satans_Daughter_-_Carlton_Mellick.pdf"
    #     upload_resp = api.upload_file(bucket_name, file_path)
    #     print("Upload Response:", upload_resp)
    # except AkaveLinkAPIError as err:
    #     print("Error uploading file:", err)