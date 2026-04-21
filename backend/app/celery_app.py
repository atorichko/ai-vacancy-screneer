from celery import Celery

from app.config import settings

# include обязателен: иначе worker не импортирует app.tasks и все задачи остаются
# «unregistered» — analyze_candidate_task и build_profile_struct_task никогда не выполняются.
celery = Celery(
    "recruitment",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)
celery.conf.task_track_started = True
