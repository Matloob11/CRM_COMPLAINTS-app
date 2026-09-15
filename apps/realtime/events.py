"""
Realtime fan-out over Redis pub/sub.

Strictly an enhancement: the frontend falls back to polling the REST endpoints,
so nothing here may be load-bearing for correctness.
"""

import json
import logging

import redis
from django.conf import settings

log = logging.getLogger(__name__)

ADMIN_CHANNEL = "complaints:admins"

_client = None


def client():
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def user_channel(bitrix_id):
    return f"complaints:user:{bitrix_id}"


def publish(event_type, payload, *, complaint):
    """
    Publish to the author's channel and to the admin channel.

    Those are exactly the two audiences allowed to see a complaint, so the
    fan-out mirrors the isolation rule instead of restating it. Internal notes
    are never published: they only reach admins, who are already reading the
    thread, and a stray payload would be far harder to audit than a missing one.
    """
    message = json.dumps({"type": event_type, **payload})
    try:
        conn = client()
        conn.publish(user_channel(complaint.author.bitrix_id), message)
        conn.publish(ADMIN_CHANNEL, message)
    except redis.RedisError:
        # A dead Redis must not fail the user's write; polling covers the gap.
        log.warning("event publish failed", extra={"event_type": event_type}, exc_info=True)


def subscribe(user):
    """Return a pubsub handle scoped to what this user may receive."""
    pubsub = client().pubsub(ignore_subscribe_messages=True)
    channels = [user_channel(user.bitrix_id)]
    if user.is_admin:
        channels.append(ADMIN_CHANNEL)
    pubsub.subscribe(*channels)
    return pubsub
