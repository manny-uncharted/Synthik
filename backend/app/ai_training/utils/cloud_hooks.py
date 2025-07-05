import os
import json
import logging
import urllib.request
from urllib.error import HTTPError, URLError
import hmac
import hashlib


from app.ai_training.utils.signature import verify_signature

logger = logging.getLogger(__name__)

# --- Shared webhook caller ---
def _call_webhook(job_id: str, payload: dict):
    secret   = os.environ["WEBHOOK_SECRET"]
    template = os.environ["PLATFORM_WEBHOOK_URL_TEMPLATE"]
    body     = json.dumps(payload).encode("utf-8")
    sig      = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    req = urllib.request.Request(
        template.format(job_id=job_id),
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": sig,
            "User-Agent": "mlops-sdk-CloudHook/1.0"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, resp.read().decode()


# --- SageMaker handler ---
def handle_sagemaker_event(event: dict, context) -> tuple[int, str]:
    detail = event.get("detail") or {}
    job_name   = detail.get("TrainingJobName")
    status_raw = detail.get("TrainingJobStatus")
    signature  = event.get("headers", {}).get("X-Hub-Signature-256")  # if coming via API Gateway

    # Optionally verify signature if routed through API Gateway
    if not verify_signature(os.environ["WEBHOOK_SHARED_SECRET"], context["body"], signature):
        logger.warning("Invalid webhook signature for SageMaker event")
        return 403, "Forbidden"

    # Map statuses
    mapping = {
        "Starting":   "initializing",
        "InProgress": "running",
        "Completed":  "completed",
        "Failed":     "failed",
        "Stopping":   "cancelling",
        "Stopped":    "cancelled",
    }
    platform_status = mapping.get(status_raw)
    if not platform_status:
        logger.info(f"Unmapped SageMaker status: {status_raw}")
        return 200, "Ignored"

    # Build payload
    payload = {
        "status": platform_status,
        "external_job_id": job_name,
        "logs_url": f"https://{os.environ['AWS_REGION']}.console.aws.amazon.com/sagemaker/home?region={os.environ['AWS_REGION']}#/jobs/{job_name}",
        "metrics": None,
        "output_model_url": detail.get("ModelArtifacts", {}).get("S3ModelArtifacts"),
        "error_message": detail.get("FailureReason"),
    }

    return _call_webhook(detail.get("_platform_job_id"), payload)


# --- Vertex AI handler ---
def handle_vertex_event(event: dict, context) -> tuple[int, str]:
    body = json.loads(urllib.parse.unquote_plus(event["data"]))
    platform_job_id = body.get("labels", {}).get("platform_job_id")
    state_raw       = body.get("state")
    if not platform_job_id or not state_raw:
        logger.error("Missing labels.platform_job_id or state in Vertex event")
        return 200, "Skipped"

    mapping = {
        "JOB_STATE_QUEUED":     "queued",
        "JOB_STATE_PENDING":    "initializing",
        "JOB_STATE_RUNNING":    "running",
        "JOB_STATE_SUCCEEDED":  "completed",
        "JOB_STATE_FAILED":     "failed",
        "JOB_STATE_CANCELLED":  "cancelled",
    }
    platform_status = mapping.get(state_raw)
    if not platform_status:
        logger.info(f"Unmapped Vertex state: {state_raw}")
        return 200, "Ignored"

    payload = {
        "status": platform_status,
        "external_job_id": body.get("customJob"),
        "logs_url": f"https://console.cloud.google.com/vertex-ai/training/custom-jobs/locations/{body.get('location')}/jobs/{body.get('jobId')}?project={os.environ['GCP_PROJECT_ID']}",
        "output_model_url": body.get("gcsOutputDirectory"),
        "error_message": body.get("error", {}).get("message")
    }

    return _call_webhook(platform_job_id, payload)
