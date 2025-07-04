# main.py (for Google Cloud Function)
import base64
import json
import os
import hmac
import hashlib
import urllib.request
import logging
from urllib.error import HTTPError, URLError

logger = logging.getLogger()
log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
logger.setLevel(log_level)

PLATFORM_WEBHOOK_URL_TEMPLATE = os.environ.get('PLATFORM_WEBHOOK_URL_TEMPLATE')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET')
GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID') # For constructing console URLs

if not PLATFORM_WEBHOOK_URL_TEMPLATE or not WEBHOOK_SECRET or not GCP_PROJECT_ID:
    logger.critical("Missing required environment variables: PLATFORM_WEBHOOK_URL_TEMPLATE, WEBHOOK_SECRET, or GCP_PROJECT_ID.")
    # This will cause function to fail on cold start if not set.
    raise EnvironmentError("Missing critical environment variables for Cloud Function.")

def gcf_vertex_event_handler(event, context):
    """
    Google Cloud Function triggered by Pub/Sub messages from Vertex AI Job Notifications.
    `event` dict contains 'data' (base64-encoded message) and 'attributes'.
    """
    logger.info(f"Received Pub/Sub event. Event ID: {context.event_id}, Timestamp: {context.timestamp}")
    logger.debug(f"Full event data: {event}")

    try:
        if 'data' not in event:
            logger.error("No 'data' field in Pub/Sub event.")
            return ('No data in event', 400)

        # Decode the Pub/Sub message data (which is base64 encoded).
        # Vertex AI notification message format needs to be checked.
        # Assuming it's JSON as configured in notification_spec.
        try:
            message_data_str = base64.b64decode(event['data']).decode('utf-8')
            vertex_job_notification = json.loads(message_data_str)
            logger.info(f"Decoded Vertex AI Job Notification: {json.dumps(vertex_job_notification, indent=2)}")
        except Exception as e_decode:
            logger.error(f"Failed to decode Pub/Sub message data: {e_decode}", exc_info=True)
            return ('Error decoding message data', 400)

        # --- Extract relevant info from Vertex AI notification ---
        # The structure of `vertex_job_notification` depends on Vertex AI's Pub/Sub schema.
        # Example expected fields (these are assumptions, verify with actual schema):
        # vertex_job_resource_name = vertex_job_notification.get('job') # e.g., projects/.../customJobs/123
        # vertex_job_state = vertex_job_notification.get('state') # e.g., JOB_STATE_SUCCEEDED
        # labels = vertex_job_notification.get('labels', {})
        # error = vertex_job_notification.get('error', {}) # For failures
        # gcs_output_directory = vertex_job_notification.get('gcsOutputDirectory') # If provided

        # Let's assume the notification structure gives us:
        # {
        #   "customJob": "projects/PROJECT_ID/locations/REGION/customJobs/JOB_ID_NUMERIC",
        #   "state": "JOB_STATE_SUCCEEDED", // Or JOB_STATE_FAILED etc.
        #   "labels": {"platform_job_id": "YOUR_PLATFORM_JOB_ID"},
        #   "error": {"code": ..., "message": ...} // if failed
        #   "gcsOutputDirectory": "gs://bucket/path/to/job_id/output/" // If job succeeded
        # }
        # This is a HYPOTHETICAL structure for the Pub/Sub message. You MUST verify the actual one.

        vertex_job_full_resource_name = vertex_job_notification.get("customJob")
        vertex_job_state_str = vertex_job_notification.get("state")
        labels = vertex_job_notification.get("labels", {})
        
        if not vertex_job_full_resource_name or not vertex_job_state_str:
            logger.error("Vertex AI notification missing 'customJob' resource name or 'state'.")
            return ('Invalid Vertex AI notification format', 400)

        platform_job_id = labels.get("platform_job_id")
        if not platform_job_id:
            logger.error(f"platform_job_id label not found in Vertex AI notification for job '{vertex_job_full_resource_name}'. Cannot call webhook.")
            return ('platform_job_id label missing', 200) # Acknowledge, but can't process

        # --- Map Vertex AI state to platform status ---
        status_mapping = {
            "JOB_STATE_QUEUED": "queued",
            "JOB_STATE_PENDING": "initializing", # Worker assignment
            "JOB_STATE_RUNNING": "running",
            "JOB_STATE_SUCCEEDED": "completed",
            "JOB_STATE_FAILED": "failed",
            "JOB_STATE_CANCELLING": "cancelling",
            "JOB_STATE_CANCELLED": "cancelled",
            "JOB_STATE_EXPIRED": "failed", # Or a custom "expired" status
            "JOB_STATE_UPDATING": "running", # Or a specific "updating"
            "JOB_STATE_PAUSED": "running", # Or a specific "paused"
        }
        platform_status = status_mapping.get(vertex_job_state_str)
        if not platform_status:
            logger.info(f"Unmapped Vertex AI job state '{vertex_job_state_str}' for job '{vertex_job_full_resource_name}'. No update sent.")
            return ('Unmapped Vertex job state', 200)


        # --- Construct Webhook Payload ---
        payload = {
            "status": platform_status,
            "external_job_id": vertex_job_full_resource_name,
            "metrics": None, # Vertex AI Pub/Sub notifications might not include detailed metrics directly.
                             # Might need another call to Vertex AI API to get job details if needed.
            "output_model_url": None,
            "logs_url": None, # Construct from job name and project
            "error_message": None
        }
        
        # Extract GCS region for console URL (last part of projects/../locations/REGION/..)
        try:
            gcs_region_from_job_name = vertex_job_full_resource_name.split("/")[3]
            vertex_job_id_short = vertex_job_full_resource_name.split("/")[-1]
            payload["logs_url"] = f"https://console.cloud.google.com/vertex-ai/training/custom-jobs/locations/{gcs_region_from_job_name}/jobs/{vertex_job_id_short}?project={GCP_PROJECT_ID}"
        except IndexError:
            logger.warning(f"Could not parse region/short_id from Vertex AI job name: {vertex_job_full_resource_name}")


        if platform_status == "completed":
            # The Pub/Sub message *might* include the base output GCS path.
            # Or you might need to infer it from how you constructed it.
            # The 'gcsOutputDirectory' in the hypothetical message structure.
            gcs_output = vertex_job_notification.get("gcsOutputDirectory")
            if gcs_output:
                 # Vertex standard is to put model artifacts in a 'model' subfolder.
                payload["output_model_url"] = os.path.join(gcs_output, "model") 
            else: # Infer from how it was created in vertex_ai_runner
                # base_output_uri = f"gs://{staging_gcs_bucket_name}/{base_output_gcs_prefix}/{platform_job_id}/"
                # This requires staging_bucket and prefix to be known or part of labels/job name.
                logger.warning(f"GCS output directory not found in Pub/Sub notification for completed job {vertex_job_full_resource_name}. Output URL may be missing.")
            payload["output_model_storage_type"] = "gcs"
            # Metrics might need to be read from GCS if written to a file by the script.

        elif platform_status == "failed":
            error_obj = vertex_job_notification.get("error")
            if error_obj and isinstance(error_obj, dict):
                payload["error_message"] = error_obj.get("message", "Vertex AI job failed without a specific error message in notification.")
            else:
                payload["error_message"] = "Vertex AI job failed (details not in notification)."


        # --- Sign and Send Webhook ---
        # (Identical to _call_platform_webhook from SageMaker Lambda)
        webhook_url = PLATFORM_WEBHOOK_URL_TEMPLATE.format(job_id=platform_job_id)
        request_body_bytes = json.dumps(payload).encode('utf-8')
        signature_hash = hmac.new(WEBHOOK_SECRET.encode('utf-8'), request_body_bytes, hashlib.sha256)
        signature = "sha256=" + signature_hash.hexdigest()
        headers = {'Content-Type': 'application/json; charset=utf-8', 'X-Hub-Signature-256': signature, 'User-Agent': 'GCP-CloudFunction-VertexAI-Event-Handler/1.0'}
        
        logger.info(f"Calling platform webhook for job_id {platform_job_id} at URL: {webhook_url} with payload: {json.dumps(payload)}")
        req = urllib.request.Request(webhook_url, data=request_body_bytes, headers=headers, method='POST')
        
        try:
            with urllib.request.urlopen(req, timeout=15) as response: # Increased timeout slightly
                response_body = response.read().decode('utf-8')
                logger.info(f"Platform webhook response for job_id {platform_job_id}. Status: {response.status}, Body: {response_body}")
                return ('Webhook called successfully.', 200)
        except HTTPError as e:
            error_body = e.read().decode('utf-8') if e.fp else "No response body"
            logger.error(f"Platform webhook call HTTPError for job_id {platform_job_id}. Status: {e.code}, Body: {error_body}")
            if e.code >= 500: raise Exception(f"Webhook target API returned server error: {e.code}") # Retry for 5xx
            return (f'Webhook call failed: {error_body}', e.code) # Don't retry for 4xx
        except URLError as e:
            logger.error(f"Platform webhook call URLError for job_id {platform_job_id}. Reason: {e.reason}")
            raise Exception(f"Network error calling webhook: {e.reason}") # Retry for network errors
        except Exception as e:
            logger.error(f"Unexpected error sending webhook for job_id {platform_job_id}: {e}", exc_info=True)
            raise # Let it retry for unexpected errors

    except Exception as e:
        logger.error(f"Generic error in Cloud Function handler: {e}", exc_info=True)
        # Re-raise to indicate failure to Cloud Functions, which might trigger retries based on trigger config
        raise