"""
Bitrix24 REST client.

The only question we ever ask the portal is who the caller is, and that is the
only question we need answered: an AUTH_ID that `user.current` accepts is proof
of identity because Bitrix issued and validated it. Nothing in the POST body
that arrives from the iframe is trusted.
"""

import logging

import httpx
from django.conf import settings

log = logging.getLogger(__name__)


class BitrixError(Exception):
    pass


def _call(method, auth_token, params=None):
    url = f"{settings.BITRIX_PORTAL_URL}/rest/{method}.json"
    payload = dict(params or {})
    payload["auth"] = auth_token

    try:
        # The token travels in the form body rather than the query string so it
        # cannot land in an intermediary's access log.
        response = httpx.post(url, data=payload, timeout=settings.BITRIX_REQUEST_TIMEOUT)
    except httpx.HTTPError as exc:
        raise BitrixError(f"{method}: transport failure") from exc

    if response.status_code != 200:
        # The body is not logged: Bitrix echoes the auth token back in errors.
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

    Raises BitrixError if the token does not check out, which the caller must
    treat as an authentication failure rather than a transient glitch.
    """
    result = _call("user.current", auth_token)
    if not result or not result.get("ID"):
        raise BitrixError("user.current returned no user")

    first = (result.get("NAME") or "").strip()
    last = (result.get("LAST_NAME") or "").strip()
    name = " ".join(part for part in (first, last) if part)
    if not name:
        name = (result.get("EMAIL") or "").strip() or f"User {result['ID']}"

    return {
        "bitrix_id": int(result["ID"]),
        "name": name,
        "email": (result.get("EMAIL") or "").strip(),
        "avatar_url": (result.get("PERSONAL_PHOTO") or "").strip(),
        "is_active": result.get("ACTIVE", True) is not False,
    }


def bind_left_menu_placement(auth_token, handler_url, title="Complaints"):
    """
    Register the CRM sidebar entry.

    Called from the install handler because a placement binds to the app that
    calls `placement.bind`, and only the install POST carries a token with the
    app's own scope. Already-bound is a success, not an error: the install
    endpoint is re-runnable by design.
    """
    try:
        _call(
            "placement.bind",
            auth_token,
            {"PLACEMENT": "LEFT_MENU", "HANDLER": handler_url, "TITLE": title},
        )
        return True
    except BitrixError as exc:
        if "ALREADY_EXISTS" in str(exc).upper():
            return True
        log.warning("placement.bind failed", extra={"reason": str(exc)})
        return False
