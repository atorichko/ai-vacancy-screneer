from celery import Celery

from app.config import settings

celery = Celery("recruitment", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.task_track_started = True
