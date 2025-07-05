import os
import sys
import json
import typer
import httpx
from typing import Optional

app = typer.Typer()
# Base URL for the MLOps API (override with env var if needed)
API_URL = os.getenv("MLOPS_API_URL", "http://localhost:8000")


def _get_wallet_address() -> str:
    """
    Retrieve the user's wallet address from environment or prompt.
    """
    addr = os.getenv("USER_WALLET_ADDRESS")
    if addr:
        return addr
    return typer.prompt("Enter your wallet address")


@app.command()
def train(
    name: str = typer.Option(..., help="User-defined job name"),
    dataset_id: str = typer.Option(..., help="ID of processed dataset to train on"),
    platform: str = typer.Option(..., help="Training platform (e.g. LOCAL_SERVER, AWS_SAGEMAKER, GOOGLE_VERTEX_AI, HUGGING_FACE)"),
    credential_id: Optional[str] = typer.Option(None, help="ID of credential to use for external platforms"),
    model_type: Optional[str] = typer.Option(None, help="Model type or task"),
    hyperparameters: str = typer.Option("{}", help="JSON string of hyperparameters"),
    config: str = typer.Option("{}", help="JSON string of training script config")
):
    """
    Submit a new training job to the MLOps platform.
    """
    wallet = _get_wallet_address()
    try:
        hyper = json.loads(hyperparameters)
        cfg = json.loads(config)
    except json.JSONDecodeError as e:
        typer.secho(f"Failed to parse JSON: {e}", err=True, fg=typer.colors.RED)
        sys.exit(1)

    payload = {
        "job_name": name,
        "user_wallet_address": wallet,
        "processed_dataset_id": dataset_id,
        "platform": platform,
        "user_credential_id": credential_id,
        "model_type": model_type,
        "hyperparameters": hyper,
        "training_script_config": cfg,
    }
    
    try:
        response = httpx.post(f"{API_URL}/training-jobs", json=payload)
        response.raise_for_status()
        data = response.json()
        typer.secho(
            f"Job submitted successfully! ID={data['id']}, status={data['status']}",
            fg=typer.colors.GREEN
        )
    except httpx.HTTPError as e:
        typer.secho(f"API error: {e}", err=True, fg=typer.colors.RED)
        sys.exit(1)


@app.command()
def status(job_id: str):
    """
    Get the current status of a training job.
    """
    try:
        response = httpx.get(f"{API_URL}/training-jobs/{job_id}/status")
        response.raise_for_status()
        data = response.json()
        typer.secho(f"Job {data['job_id']} status: {data['status']}", fg=typer.colors.BLUE)
    except httpx.HTTPError as e:
        typer.secho(f"Failed to fetch status: {e}", err=True, fg=typer.colors.RED)
        sys.exit(1)


@app.command()
def list_jobs(user_wallet: Optional[str] = None):
    """
    List all training jobs for a wallet address.
    """
    wallet = user_wallet or _get_wallet_address()
    try:
        response = httpx.get(f"{API_URL}/training-jobs/by-user/{wallet}")
        response.raise_for_status()
        jobs = response.json()
        if not jobs:
            typer.echo("No jobs found for this wallet.")
            return
        for job in jobs:
            typer.echo(f"- ID: {job['id']}, status: {job['status']}, platform: {job['platform']}")
    except httpx.HTTPError as e:
        typer.secho(f"Failed to list jobs: {e}", err=True, fg=typer.colors.RED)
        sys.exit(1)


if __name__ == "__main__":
    app()
