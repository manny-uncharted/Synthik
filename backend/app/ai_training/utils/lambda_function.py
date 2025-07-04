import json
import os
import hmac
import hashlib
import urllib.request
import logging
from urllib.error import HTTPError, URLError
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger()
# Configure logger that will output to CloudWatch
log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
logger.setLevel(log_level)

# Environment variables (must be configured in Lambda settings)
PLATFORM_WEBHOOK_URL_TEMPLATE = os.environ.get('PLATFORM_WEBHOOK_URL_TEMPLATE')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SHARED_SECRET')

if not PLATFORM_WEBHOOK_URL_TEMPLATE:
    logger.error("FATAL: PLATFORM_WEBHOOK_URL_TEMPLATE environment variable not set.")
    # Depending on AWS Lambda's behavior for unhandled exceptions at init,
    # this might prevent the Lambda from being invoked.
    raise ValueError("PLATFORM_WEBHOOK_URL_TEMPLATE not set.")

if not WEBHOOK_SECRET:
    logger.error("FATAL: WEBHOOK_SHARED_SECRET environment variable not set.")
    raise ValueError("WEBHOOK_SHARED_SECRET not set.")


def _extract_platform_job_id(sagemaker_event_detail: Dict[str, Any]) -> Optional[str]:
    """
    Extracts the platform's original job ID from SageMaker event details.
    Prioritizes the '_platform_job_id' hyperparameter.
    """
    hyperparameters = sagemaker_event_detail.get('HyperParameters', {})
    platform_job_id = hyperparameters.get('_platform_job_id') # Case sensitive match

    if platform_job_id:
        logger.info(f"Extracted platform_job_id '{platform_job_id}' from HyperParameters._platform_job_id.")
        return platform_job_id
    
    # Fallback or alternative: If you also tagged the SageMaker job
    # (Requires sagemaker:DescribeTrainingJob permission and an SDK call)
    # training_job_arn = sagemaker_event_detail.get('TrainingJobArn')
    # if training_job_arn:
    #     try:
    #         # boto3_sagemaker_client = boto3.client('sagemaker')
    #         # response = boto3_sagemaker_client.list_tags(ResourceArn=training_job_arn)
    #         # for tag in response.get('Tags', []):
    #         #     if tag['Key'] == 'PlatformJobId':
    #         #         logger.info(f"Extracted platform_job_id '{tag['Value']}' from SageMaker Tags.")
    #         #         return tag['Value']
    #         pass # Placeholder for tag logic
    #     except Exception as e:
    #         logger.warning(f"Could not describe SageMaker job tags for ARN {training_job_arn}: {e}")

    logger.warning("Could not find '_platform_job_id' in HyperParameters. Correlation may fail.")
    return None


def _map_sagemaker_status_to_platform_status(sagemaker_status: str) -> Optional[str]:
    """Maps SageMaker training job statuses to the platform's JobStatus enum values."""
    status_mapping = {
        # Non-terminal statuses
        "Starting": "initializing", # Custom status if needed, or map to queued/running
        "Downloading": "downloading_data", # Custom status
        "Preparing": "initializing", # Or PREPARING_DATA if that's what it means on your platform
        "InProgress": "running",
        "Stopping": "cancelling",
        # Terminal statuses
        "Completed": "completed",
        "Failed": "failed",
        "Stopped": "cancelled", # User-initiated stop usually
        # Interrupted might map to FAILED or a specific status
        "Interrupted": "failed", # Or a new 'interrupted' status
    }
    platform_status = status_mapping.get(sagemaker_status)
    if not platform_status:
        logger.warning(f"Unmapped SageMaker status '{sagemaker_status}'. Will not send update for this status.")
    return platform_status


def _prepare_webhook_payload(
    sagemaker_event_detail: Dict[str, Any],
    platform_job_id: str, # Not used in payload, but for context
    platform_status: str
) -> Dict[str, Any]:
    """Constructs the JSON payload for the platform's webhook."""
    sagemaker_job_name = sagemaker_event_detail['TrainingJobName']
    aws_region = os.environ.get('AWS_REGION', 'unknown-region') # Lambda runtime region

    payload = {
        "status": platform_status,
        "external_job_id": sagemaker_job_name,
        "metrics": None,
        "output_model_url": None,
        "logs_url": f"https://{aws_region}.console.aws.amazon.com/sagemaker/home?region={aws_region}#/jobs/{sagemaker_job_name}",
        "error_message": None
    }

    if platform_status == "completed":
        payload["output_model_url"] = sagemaker_event_detail.get('ModelArtifacts', {}).get('S3ModelArtifacts')
        payload["output_model_storage_type"] = "s3" # SageMaker always outputs to S3
        
        final_metrics_data = sagemaker_event_detail.get('FinalMetricDataList', [])
        if final_metrics_data:
            try:
                payload["metrics"] = {m['MetricName']: float(m['Value']) for m in final_metrics_data}
            except (ValueError, TypeError) as e:
                logger.warning(f"Could not parse FinalMetricDataList values as float for job {sagemaker_job_name}: {e}. Metrics: {final_metrics_data}")
                payload["metrics"] = {"parsing_error": "Could not parse one or more metric values."}


    elif platform_status == "failed":
        payload["error_message"] = sagemaker_event_detail.get('FailureReason', 'SageMaker job failed without a specific FailureReason provided in the event.')
        # Secondary status details might also be useful if available
        secondary_status_transitions = sagemaker_event_detail.get('SecondaryStatusTransitions', [])
        if secondary_status_transitions:
            # Get the most recent secondary status message
            latest_transition = max(secondary_status_transitions, key=lambda t: t.get('StatusMessage',''))
            status_message = latest_transition.get('StatusMessage')
            if status_message and status_message not in (payload["error_message"] or "") :
                 payload["error_message"] = (payload["error_message"] or "") + f"; Last Status Message: {status_message}"


    logger.debug(f"Prepared webhook payload for job {platform_job_id} (SageMaker: {sagemaker_job_name}): {json.dumps(payload)}")
    return payload


def _call_platform_webhook(platform_job_id: str, payload: Dict[str, Any]) -> Tuple[int, str]:
    """Sends the payload to the platform's webhook endpoint."""
    
    webhook_url = PLATFORM_WEBHOOK_URL_TEMPLATE.format(job_id=platform_job_id)
    request_body_bytes = json.dumps(payload).encode('utf-8')
    
    # Create HMAC SHA256 signature
    signature_hash = hmac.new(WEBHOOK_SECRET.encode('utf-8'), request_body_bytes, hashlib.sha256)
    signature = "sha256=" + signature_hash.hexdigest()
    
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Hub-Signature-256': signature,
        'User-Agent': 'AWS-Lambda-SageMaker-Event-Handler/1.0'
    }
    
    logger.info(f"Calling platform webhook for job_id {platform_job_id} at URL: {webhook_url}")
    req = urllib.request.Request(webhook_url, data=request_body_bytes, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response: # Added timeout
            response_body = response.read().decode('utf-8')
            logger.info(f"Platform webhook response for job_id {platform_job_id}. Status: {response.status}, Body: {response_body}")
            return response.status, response_body
    except HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else "No response body"
        logger.error(f"Platform webhook call HTTPError for job_id {platform_job_id}. Status: {e.code}, Body: {error_body}")
        return e.code, error_body
    except URLError as e: # Catches network errors like timeouts, DNS failures
        logger.error(f"Platform webhook call URLError for job_id {platform_job_id}. Reason: {e.reason}")
        return 503, f"Network error calling webhook: {e.reason}" # 503 Service Unavailable
    except Exception as e:
        logger.error(f"Unexpected error sending webhook for job_id {platform_job_id}: {e}", exc_info=True)
        return 500, f"Unexpected error: {str(e)}"


def lambda_handler(event: Dict[str, Any], context: Any):
    """
    AWS Lambda handler function for SageMaker Training Job State Change events.
    """
    logger.info(f"Received SageMaker event: {json.dumps(event, indent=2)}")

    try:
        sagemaker_event_detail = event.get('detail')
        if not sagemaker_event_detail:
            logger.error("Event is missing 'detail' section.")
            return {'statusCode': 400, 'body': "Event missing 'detail' section."}

        sagemaker_job_name = sagemaker_event_detail.get('TrainingJobName')
        sagemaker_status = sagemaker_event_detail.get('TrainingJobStatus')

        if not sagemaker_job_name or not sagemaker_status:
            logger.error("Event detail is missing 'TrainingJobName' or 'TrainingJobStatus'.")
            return {'statusCode': 400, 'body': "Missing TrainingJobName or TrainingJobStatus."}

        platform_job_id = _extract_platform_job_id(sagemaker_event_detail)
        if not platform_job_id:
            logger.error(f"Failed to correlate SageMaker job '{sagemaker_job_name}' to a platform job ID. No webhook will be called.")
            # You might still return 200 to EventBridge to prevent retries for this specific issue.
            return {'statusCode': 200, 'body': 'Correlation to platform_job_id failed.'}

        platform_status = _map_sagemaker_status_to_platform_status(sagemaker_status)
        if not platform_status:
            # Status is not one we care about or is unknown, acknowledge event and exit.
            return {'statusCode': 200, 'body': f'SageMaker status {sagemaker_status} not mapped for platform update.'}
            
        webhook_payload = _prepare_webhook_payload(sagemaker_event_detail, platform_job_id, platform_status)
        
        http_status_code, response_body = _call_platform_webhook(platform_job_id, webhook_payload)

        if 200 <= http_status_code < 300:
            return {'statusCode': 200, 'body': f'Webhook for job {platform_job_id} processed successfully. Response: {response_body}'}
        else:
            # Non-2xx response from our platform means an issue on our end or bad data.
            # EventBridge might retry based on Lambda's error handling if we raise an exception here.
            # For now, just log it as an error from Lambda's perspective.
            logger.error(f"Webhook call for job {platform_job_id} returned HTTP {http_status_code}. Response: {response_body}")
            # Depending on the error, we might want to signal EventBridge to retry by raising an exception.
            # If it's a 4xx from our API (e.g. bad request), retrying won't help.
            # If 5xx from our API, retry might help.
            if http_status_code >= 500: # Our API had a server error
                 raise Exception(f"Webhook target API returned server error: {http_status_code}")
            return {'statusCode': http_status_code, 'body': f'Webhook call returned error. Response: {response_body}'}


    except ValueError as ve: # For missing ENV VARS during init
        logger.critical(f"Configuration error in Lambda: {ve}", exc_info=True)
        # This error happens at Lambda init time if env vars are missing
        raise # Let Lambda fail hard on init config errors
    except Exception as e:
        logger.error(f"Generic error in Lambda handler: {e}", exc_info=True)
        # This will result in Lambda invocation error, EventBridge might retry.
        raise Exception(f"Lambda handler failed: {str(e)}") from e