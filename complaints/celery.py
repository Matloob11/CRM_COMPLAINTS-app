import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "complaints.settings")

app = Celery("complaints")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Partial uploads are multi-gigabyte by design here, so reaping abandoned
    # ones is disk safety, not housekeeping.
    "reap-abandoned-uploads": {
        "task": "apps.uploads.tasks.reap_abandoned_uploads",
        "schedule": crontab(minute=0),
    },
}
