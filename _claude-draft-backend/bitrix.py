"""
Bitrix24 REST client.

The portal is Bitrix24 On-Premise at BITRIX_PORTAL_URL. The only thing we ever
ask it is who the caller is, which is also the only thing we need: an AUTH_ID
that `user.current` accepts is proof of identity, because Bitrix issued and
validated it. Nothing in the POST body from the iframe is trusted.
"""

import logging

import requests
from django.conf import settings

log = logging.getLogger(__name__)


class BitrixError(Exception):
    pass


def _call(method, auth_token, params=None):
    url = f"{settings.BITRIX_PORTAL_URL}/rest/{method}.json"
    payload = dict(params or {})
    payload["auth"] = auth_token
    try:
        response = requests.post(url, data=payload, timeout=settings.BITRIX_REQUEST_TIMEOUT)
    except requests.RequestException as exc:
        raise BitrixError(f"{method}: transport failure") from exc

    if response.status_code != 200:
        # Deliberately does not log the body: it echoes the auth token back.
        raise BitrixError(f"{method}: HTTP {response.status_code}")

    try:
        data = response.json()
    except ValueError as exc:
        raise BitrixError(f"{method}: response was not JSON") from exc

    if "error" in data:
        raise BitrixError(f"{method}: {data.get('error')}")

    return data.get("result")


def get_current_user(auth_token):
    """
    Resolve the caller's Bitrix identity from an AUTH_ID.

    Returns a normalised dict. Raises BitrixError if the token is not valid,
    which the caller must treat as authentication failure.
    """
    result = _call("user.current", auth_token)
    if not result or not result.get("ID"):
        raise BitrixError("user.current returned no user")

    first = (result.get("NAME") or "").strip()
    last = (result.get("LAST_NAME") or "").strip()
    name = " ".join(part for part in (first, last) if part) or (result.get("EMAIL") or f"User {result['ID']}")

    return {
        "bitrix_id": int(result["ID"]),
        "name": name,
        "email": (result.get("EMAIL") or "").strip(),
        "avatar_url": (result.get("PERSONAL_PHOTO") or "").strip(),
        "is_active": result.get("ACTIVE", True) is not False,
    }


def is_portal_admin(auth_token):
    """
    Ask Bitrix whether the caller is a portal administrator.

    Used only to corroborate the configured allowlist, never as the sole
    source of truth: portal-admin and complaints-admin are different roles and
    the business decided exactly who holds the latter.
    """
    try:
        result = _call("user.admin", auth_token)
    except BitrixError:
        log.warning("user.admin check failed; falling back to allowlist only")
        return False
    return bool(result)
