from celery import Celery
import requests
import os
import tempfile
import time
import json
import datetime
from celery.schedules import crontab

from app.core.constants import BASE_URL, API_KEY, REDIS_URL

from app.core.database import SessionLocal


# Create a Celery app
celery_app = Celery(
    'tasks',
    broker=REDIS_URL,
    include=[
        'app.celery.tasks',
    ],
)
# Automatically discover tasks in the specified modules
celery_app.autodiscover_tasks(
    [
        'app.celery.tasks',
    ]
)




# Schedule the task to run every 30 minutes.
celery_app.conf.beat_schedule = {

}