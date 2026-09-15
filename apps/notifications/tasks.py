import hashlib
import hmac
import json
import logging

import httpx
from celery import shared_task
from django.conf import settings

log = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=5,
    default_retry_delay=30,
    autoretry_for=(httpx.HTTPError,),
    retry_backoff=True,
)
def notify_n8n(self, event_type, payload):
    """
    Outbound webhook to the existing n8n instance.

    Always queued, never inline: a webhook failure must not fail the user's
    request or roll back the transaction that produced the event.
    """
    if not settings.N8N_WEBHOOK_URL:
        return "disabled"

    body = json.dumps({"event": event_type, "data": payload}, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json"}

    if settings.N8N_WEBHOOK_SECRET:
        signature = hmac.new(settings.N8N_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        headers["X-A7-Signature"] = f"sha256={signature}"

    response = httpx.post(
        settings.N8N_WEBHOOK_URL,
        content=body,
        headers=headers,
        timeout=settings.N8N_WEBHOOK_TIMEOUT,
    )

    if response.status_code >= 500:
        raise self.retry(exc=RuntimeError(f"n8n returned {response.status_code}"))
    if response.status_code >= 400:
        # A 4xx is a contract problem. Retrying cannot fix it, so record it and
        # stop rather than burning the queue.
        log.error(
            "n8n webhook rejected",
            extra={"event_type": event_type, "status": response.status_code},
        )
        return f"rejected:{response.status_code}"
    return "ok"
