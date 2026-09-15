"""
The two endpoints Bitrix24 itself calls.

A Bitrix local application is an iframe by design. On every open, Bitrix POSTs
an AUTH_ID to the handler; we verify it against the portal, resolve the user,
and hand the SPA a token of our own. There is no login screen and no cookie
anywhere in this flow.
"""

import logging

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import bitrix, tokens
from .models import AppUser, Role

log = logging.getLogger(__name__)

_INSTALL_FINISH_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>Complaints installed</title>
<script src="https://api.bitrix24.com/api/v1/"></script></head>
<body><p>Complaints application installed.</p>
<script>BX24.init(function(){ BX24.installFinish(); });</script>
</body></html>"""


def _portal_mismatch(request):
    """
    Reject any portal other than the one this deployment belongs to.

    Without this check, anyone who stands up their own Bitrix24 and points a
    local app at this URL would be handed accounts on our instance.
    """
    expected = settings.BITRIX_EXPECTED_MEMBER_ID
    if not expected:
        # Not yet installed. The install endpoint is what pins this value.
        return False
    return request.POST.get("member_id") != expected


def _resolve_role(bitrix_id, auth_token):
    if bitrix_id in settings.ADMIN_BITRIX_IDS:
        return Role.ADMIN
    # A portal administrator who is not on the allowlist stays an agent:
    # portal-admin and complaints-admin are different jobs, and the business
    # named exactly one person for the latter.
    return Role.AGENT


def _upsert_user(profile, auth_token):
    role = _resolve_role(profile["bitrix_id"], auth_token)
    user, _ = AppUser.objects.update_or_create(
        bitrix_id=profile["bitrix_id"],
        defaults={
            "name": profile["name"],
            "email": profile["email"],
            "avatar_url": profile["avatar_url"],
            "is_active": profile["is_active"],
            "role": role,
            "last_seen_at": timezone.now(),
        },
    )
    return user


@csrf_exempt
@require_POST
def install(request):
    """Called once, when the local application is installed on the portal."""
    member_id = request.POST.get("member_id", "")
    auth_token = request.POST.get("AUTH_ID", "")

    if not auth_token:
        return HttpResponseForbidden("Missing AUTH_ID")

    try:
        profile = bitrix.get_current_user(auth_token)
    except bitrix.BitrixError as exc:
        log.warning("install rejected", extra={"reason": str(exc)})
        return HttpResponseForbidden("Could not verify installer identity")

    _upsert_user(profile, auth_token)

    # member_id is not written to the database here on purpose: it belongs in
    # the environment file alongside the other deployment identity, so a
    # database restore into a different portal cannot silently re-point the app.
    log.info(
        "install completed -- record this member_id in BITRIX_EXPECTED_MEMBER_ID",
        extra={"member_id": member_id, "installer_bitrix_id": profile["bitrix_id"]},
    )
    return HttpResponse(_INSTALL_FINISH_HTML)


@csrf_exempt
@require_POST
def handler(request):
    """Called on every iframe open. Returns the SPA with a token embedded."""
    if _portal_mismatch(request):
        log.warning("handler rejected: portal mismatch")
        return HttpResponseForbidden("Unknown portal")

    auth_token = request.POST.get("AUTH_ID", "")
    if not auth_token:
        return HttpResponseForbidden("Missing AUTH_ID")

    try:
        profile = bitrix.get_current_user(auth_token)
    except bitrix.BitrixError as exc:
        log.warning("handler rejected", extra={"reason": str(exc)})
        return HttpResponseForbidden("Could not verify identity")

    if not profile["is_active"]:
        return HttpResponseForbidden("This account is not active")

    user = _upsert_user(profile, auth_token)

    return render(
        request,
        "complaints/app.html",
        {
            "token": tokens.issue(user),
            "user_name": user.name,
            "user_role": user.role,
            "build_id": settings.APP_BUILD_ID,
            "display_timezone": settings.DISPLAY_TIME_ZONE,
        },
    )
