# mlops_sdk/cli.py

import typer
from .client import MlopsClient

app = typer.Typer()
client = MlopsClient()

@app.command()
def train(
    name: str = typer.Option(...),
    dataset_id: str = typer.Option(...),
    platform: str = typer.Option(...),
    credential_id: Optional[str] = None,
    model_type: Optional[str] = None,
    hyperparameters: str = "{}",
    config: str = "{}"
):
    """Submit a new training job."""
    import json
    payload_hp = json.loads(hyperparameters)
    payload_cfg = json.loads(config)
    job = client.submit_job(name, dataset_id, platform, credential_id, model_type, payload_hp, payload_cfg)
    typer.echo(f"Submitted: ID={job.id}, status={job.status}")

@app.command()
def status(job_id: str):
    """Check job status."""
    job = client.get_job(job_id)
    typer.echo(f"{job.id} → {job.status}")

@app.command("list")
def list_jobs():
    """List my training jobs."""
    jobs = client.list_jobs()
    for j in jobs:
        typer.echo(f"- {j.id} | {j.status}")
