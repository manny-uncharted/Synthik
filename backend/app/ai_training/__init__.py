from fastapi import FastAPI
from app.ai_training.api import credentials, training_jobs, jobs

def create_app() -> FastAPI:
    ai_training_app = FastAPI(
        title="Enterprise MLOps API",
        version="0.1.0",
    )
    ai_training_app.include_router(credentials.router)
    ai_training_app.include_router(training_jobs.router)
    ai_training_app.include_router(jobs.router)
    return ai_training_app
