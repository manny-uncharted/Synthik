import time
from typing import List, Tuple


from app.generation.schemas import PreviewConfig, Template, GenerationJobResponse
from app.generation.models import GenerationJob
from app.core.logger import logger

# cost per row by quality (example values)
_COST_PER_ROW = {
    "fast": 0.0001,
    "balanced": 0.0002,
    "high": 0.0003,
}

# In a real app, you might load this from your DB or a JSON file.
_TEMPLATES_STORE = [
    {
        "id": "tpl-user-profiles",
        "name": "User Profiles",
        "description": "Synthetic user profile data (name, email, signup date)",
        "category": "user",
        "schema": [
            {"id": "name", "name": "name", "type": "string", "description": "Full name", "constraints": {"required": True}},
            {"id": "email", "name": "email", "type": "string", "description": "Email address", "constraints": {"required": True, "pattern": r"[^@]+@[^@]+\.[^@]+"}},
            {"id": "signup_date", "name": "signup_date", "type": "datetime", "description": "Date of signup", "constraints": {"required": True}}
        ],
        "previewData": [
            {"name": "Alice Smith", "email": "alice@example.com", "signup_date": "2025-01-10T12:34:56Z"},
            {"name": "Bob Jones",   "email": "bob@example.com",   "signup_date": "2025-02-20T08:15:00Z"}
        ],
        "useCases": ["Testing", "Analytics demos"],
        "estimatedRows": 1000
    },
    {
        "id": "tpl-iot-readings",
        "name": "IoT Sensor Readings",
        "description": "Simulated temperature & humidity sensor data",
        "category": "iot",
        "schema": [
            {"id": "timestamp", "name": "timestamp", "type": "datetime", "description": "Reading time", "constraints": {"required": True}},
            {"id": "temp_c",    "name": "temp_c",    "type": "number",   "description": "Temperature in °C", "constraints": {"required": True, "min": -40, "max": 85}},
            {"id": "humidity",  "name": "humidity",  "type": "number",   "description": "Relative humidity %", "constraints": {"required": True, "min": 0,   "max": 100}}
        ],
        "previewData": [
            {"timestamp": "2025-03-01T00:00:00Z", "temp_c": 22.5, "humidity": 45.0},
            {"timestamp": "2025-03-01T00:01:00Z", "temp_c": 22.7, "humidity": 44.8}
        ],
        "useCases": ["IoT testing", "Edge analytics"],
        "estimatedRows": 50000
    }
]

def list_templates() -> List[Template]:
    """
    Return the list of available dataset templates.
    """
    logger.info("generation.templates.list")
    return [Template(**tpl) for tpl in _TEMPLATES_STORE]

def generate_preview(config: PreviewConfig) -> Tuple[List[dict], float, float]:
    """
    Generate a small preview of synthetic data based on the provided schema.
    Returns: (preview_rows, generation_time_seconds, estimated_cost)
    """
    start = time.time()
    # TODO: replace this stub with a real call to your generation engine
    preview = []
    for _ in range(config.rows):
        # placeholder: map each SchemaField to dummy values
        row = {f.name: f"default_{f.type}" for f in config.schema}
        preview.append(row)

    duration = time.time() - start
    cost = config.rows * _COST_PER_ROW[config.quality]
    logger.info(
        "generation.preview",
        model=config.model,
        rows=config.rows,
        quality=config.quality,
        time=duration,
        cost=cost,
    )
    return preview, duration, cost


def create_generation_job(
    db: Session, dataset_id: str, user_id: str, config: dict
) -> GenerationJob:
    job = GenerationJob(
        dataset_id=dataset_id,
        user_id=user_id,
        config=config,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def get_generation_job(db: Session, job_id: str) -> GenerationJob:
    job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
    if not job:
        raise NotFoundError(f"Generation job {job_id} not found")
    return job