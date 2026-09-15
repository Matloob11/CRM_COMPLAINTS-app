import hashlib
import hmac
import json
import logging
import shutil
from datetime import timedelta

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

log = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=5,
    default_retry_delay=30,
    autoretry_for=(requests.RequestException,),
    retry_backoff=True,
)
def notify_n8n(self, event_type, payload):
    """
    Outbound webhook to the existing n8n instance.

    Runs in the worker, never inline: a webhook failure must not fail the
    user's request or roll back the transaction that produced the event.
    """
    if not settings.N8N_WEBHOOK_URL:
        return "disabled"

    body = json.dumps({"event": event_type, "data": payload}, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json"}

    if settings.N8N_WEBHOOK_SECRET:
        signature = hmac.new(
            settings.N8N_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        headers["X-A7-Signature"] = f"sha256={signature}"

    response = requests.post(
        settings.N8N_WEBHOOK_URL, data=body, headers=headers, timeout=15
    )
    if response.status_code >= 500:
        raise self.retry(exc=RuntimeError(f"n8n returned {response.status_code}"))
    if response.status_code >= 400:
        # A 4xx is a contract problem; retrying will not fix it. Dead-letter it.
        log.error(
            "n8n webhook rejected",
            extra={"event_type": event_type, "status": response.status_code},
        )
        return f"rejected:{response.status_code}"
    return "ok"


@shared_task
def reap_abandoned_uploads():
    """Delete partial uploads nobody finished. Multi-gigabyte videos make this
    housekeeping load-bearing for disk safety, not merely tidy."""
    from .models import Upload

    cutoff = timezone.now() - timedelta(hours=settings.UPLOAD_ABANDON_HOURS)
    stale = Upload.objects.filter(completed=False, updated_at__lt=cutoff)

    reaped = 0
    for upload in stale:
        chunk_dir = settings.UPLOAD_TMP_ROOT / str(upload.id)
        shutil.rmtree(chunk_dir, ignore_errors=True)
        upload.delete()
        reaped += 1

    if reaped:
        log.info("reaped abandoned uploads", extra={"count": reaped})
    return reaped
