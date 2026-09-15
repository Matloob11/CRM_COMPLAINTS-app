import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from . import storage
from .models import Upload

log = logging.getLogger(__name__)


@shared_task
def reap_abandoned_uploads():
    """
    Delete partial uploads nobody finished.

    With no size cap, abandoned transfers are the most likely way this disk
    fills up, so this is capacity safety rather than housekeeping.
    """
    cutoff = timezone.now() - timedelta(hours=settings.UPLOAD_ABANDON_HOURS)

    reaped = 0
    for upload in Upload.objects.filter(completed=False, updated_at__lt=cutoff):
        storage.cleanup(upload.id)
        upload.delete()
        reaped += 1

    if reaped:
        log.info("reaped abandoned uploads", extra={"count": reaped})
    return reaped
