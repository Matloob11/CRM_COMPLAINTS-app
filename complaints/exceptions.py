"""
Uniform error envelope.

The frontend reads `detail` off every failure (see `parseError` in
api/client.ts) and shows it to the user, so every error path must produce that
key -- including the ones DRF would otherwise render as a bare list or a
field-keyed dict.
"""

import logging

from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

log = logging.getLogger(__name__)


def _first_message(payload):
    """Pull a human sentence out of DRF's nested error shapes."""
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list) and payload:
        return _first_message(payload[0])
    if isinstance(payload, dict):
        if "detail" in payload:
            return _first_message(payload["detail"])
        for value in payload.values():
            message = _first_message(value)
            if message:
                return message
    return ""


def exception_handler(exc, context):
    if isinstance(exc, Http404):
        # 404 is the deliberate answer for a complaint belonging to someone
        # else. A 403 would confirm the id exists and let an agent enumerate
        # their colleagues' tickets.
        return Response(
            {"detail": "Not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        # An unhandled exception. Log it with the stack, return nothing useful
        # to the client: internal messages leak schema and file paths.
        log.exception("unhandled API exception", extra={"path": context.get("request") and context["request"].path})
        return Response(
            {"detail": "Something went wrong on our side."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    detail = _first_message(data) or "Request failed."

    envelope = {"detail": detail}
    if isinstance(data, dict) and not isinstance(exc, exceptions.APIException.__bases__):
        # Keep the field-level detail so the composer can highlight the field
        # that failed, but never at the cost of the top-level `detail` string.
        field_errors = {key: value for key, value in data.items() if key != "detail"}
        if field_errors:
            envelope["errors"] = field_errors

    response.data = envelope
    return response
