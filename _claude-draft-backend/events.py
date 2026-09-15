"""
Realtime fan-out over Redis pub/sub.

SSE is an enhancement, never a correctness requirement: the frontend falls back
to polling the REST endpoints, so nothing here may be load-bearing.
"""

import json
import logging

import redis
from django.conf import settings

log = logging.getLogger(__name__)

_client = None


def client():
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def user_channel(bitrix_id):
    return f"complaints:user:{bitrix_id}"


ADMIN_CHANNEL = "complaints:admins"


def publish(event_type, payload, *, author_bitrix_id):
    """
    Publish to the author's channel and to the admin channel.

    Those are the only two audiences that may ever see a complaint, which keeps
    the fan-out aligned with the isolation rule rather than duplicating it.
    """
    message = json.dumps({"type": event_type, "data": payload})
    try:
        conn = client()
        conn.publish(user_channel(author_bitrix_id), message)
        conn.publish(ADMIN_CHANNEL, message)
    except redis.RedisError:
        # A dead Redis must not fail the user's write. Polling covers it.
        log.warning("event publish failed", extra={"event_type": event_type}, exc_info=True)


def subscribe(user):
    """Return a pubsub handle scoped to what this user is allowed to receive."""
    pubsub = client().pubsub(ignore_subscribe_messages=True)
    channels = [user_channel(user.bitrix_id)]
    if user.is_admin:
        channels.append(ADMIN_CHANNEL)
    pubsub.subscribe(*channels)
    return pubsub
