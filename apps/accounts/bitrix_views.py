"""
The two endpoints Bitrix24 itself calls.

A Bitrix local application is an iframe by design: on every open, Bitrix POSTs
an AUTH_ID to the handler. We verify it against the portal, resolve the user,
and hand the SPA a token of our own. No login screen and no cookie anywhere in
this flow.
"""

import logging

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden
from django.utils import timezone
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import bitrix, bootstrap, tokens
from .models import AppUser

log = logging.getLogger(__name__)

_INSTALL_FINISH = """<!doctype html>
<html><head><meta charset="utf-8"><title>Complaints installed</title>
<script src="https://api.bitrix24.com/api/v1/"></script></head>
<body><p>Complaints application installed.</p>
<script>BX24.init(function(){ BX24.installFinish(); });</script>
</body></html>"""


def _portal_matches(request):
    """
    Accept only the portal this deployment belongs to.

    Without this, anyone could stand up their own Bitrix24, point a local app
    at this URL, and be handed accounts on our instance.
    """
    expected = settings.BITRIX_EXPECTED_MEMBER_ID
    if not expected:
        # Not pinned yet: the install endpoint is what records it.
        return True
    return request.POST.get("member_id") == expected


def _upsert(profile):
    user, _ = AppUser.objects.update_or_create(
        bitrix_id=profile["bitrix_id"],
        defaults={
            "name": profile["name"],
            "email": profile["email"],
            "avatar_url": profile["avatar_url"],
            "is_active": profile["is_active"],
            "role": AppUser.role_for(profile["bitrix_id"]),
            "last_seen_at": timezone.now(),
        },
    )
    return user


@csrf_exempt
@require_POST
@xframe_options_exempt
def install(request):
    """Runs once when the local application is installed on the portal."""
    auth_token = request.POST.get("AUTH_ID", "")
    if not auth_token:
        return HttpResponseForbidden("Missing AUTH_ID")

    try:
        profile = bitrix.get_current_user(auth_token)
    except bitrix.BitrixError as exc:
        log.warning("install rejected", extra={"reason": str(exc)})
        return HttpResponseForbidden("Could not verify installer identity")

    _upsert(profile)

    handler_url = request.build_absolute_uri("/bitrix/handler/")
    bound = bitrix.bind_left_menu_placement(auth_token, handler_url)

    log.info(
        "install completed -- record member_id in BITRIX_EXPECTED_MEMBER_ID",
        extra={
            "member_id": request.POST.get("member_id", ""),
            "installer_bitrix_id": profile["bitrix_id"],
            "placement_bound": bound,
        },
    )
    return HttpResponse(_INSTALL_FINISH)


@csrf_exempt
@require_POST
@xframe_options_exempt
def handler(request):
    """Runs on every iframe open. Returns the SPA with a fresh token in it."""
    if not _portal_matches(request):
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

    user = _upsert(profile)

    document = bootstrap.render(
        token=tokens.issue(user),
        user=user,
        placement=request.POST.get("PLACEMENT", ""),
        placement_options=None,
    )

    response = HttpResponse(document)
    # The token is in the body. Any cache between here and the browser holding
    # it would hand one user's session to the next.
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response["Pragma"] = "no-cache"
    return response
