import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "complaints.settings")

app = Celery("complaints")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Unlimited video uploads on a 263 GB disk make this housekeeping
    # load-bearing for capacity, not merely tidy.
    "reap-abandoned-uploads": {
        "task": "apps.uploads.tasks.reap_abandoned_uploads",
        "schedule": crontab(minute=7),
    },
    # Attachments uploaded but never sent are the same disk risk, arrived at a
    # different way: the user picked a 3 GB file and then closed the tab.
    "reap-orphan-attachments": {
        "task": "apps.uploads.tasks.reap_orphan_attachments",
        "schedule": crontab(minute=37),
    },
}
