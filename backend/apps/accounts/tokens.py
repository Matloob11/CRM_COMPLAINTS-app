"""
Application bearer tokens.

Deliberately not cookies. The app is framed cross-origin by the CRM, so any
cookie it set would be a third-party cookie: blocked by default in Safari and
being removed in Chrome. A bearer token held in the iframe's own memory
sidesteps that entire class of failure.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings


class TokenError(Exception):
    pass


def issue(app_user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(app_user.bitrix_id),
        "role": app_user.role,
        "name": app_user.name,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.JWT_TTL_HOURS)).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode(token):
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("token invalid") from exc
