import logging

from rest_framework import authentication, exceptions

from .models import AppUser
from .tokens import TokenError, decode

log = logging.getLogger(__name__)


class AppJWTAuthentication(authentication.BaseAuthentication):
    """
    Bearer-token authentication against our own JWT.

    The token is minted by the Bitrix handler after Bitrix has vouched for the
    user. Failures log a reason but never the token itself.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        if not header:
            return None

        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            raise exceptions.AuthenticationFailed("Malformed Authorization header")

        try:
            payload = decode(parts[1])
        except TokenError as exc:
            log.info("auth rejected", extra={"reason": str(exc)})
            raise exceptions.AuthenticationFailed(str(exc)) from exc

        try:
            user = AppUser.objects.get(bitrix_id=int(payload["sub"]))
        except (AppUser.DoesNotExist, ValueError, KeyError) as exc:
            log.info("auth rejected", extra={"reason": "unknown subject"})
            raise exceptions.AuthenticationFailed("Unknown user") from exc

        if not user.is_active:
            raise exceptions.AuthenticationFailed("User is inactive")

        # The role in the token is a snapshot; the database row is authoritative.
        # If an admin is demoted their existing token must not keep admin powers.
        return (user, payload)

    def authenticate_header(self, request):
        return self.keyword
