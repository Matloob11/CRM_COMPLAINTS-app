import logging

from rest_framework import authentication, exceptions

from .models import AppUser
from .tokens import TokenError, decode

log = logging.getLogger(__name__)


class AppJWTAuthentication(authentication.BaseAuthentication):
    """
    Bearer-token authentication against our own JWT.

    The token is minted by the Bitrix handler once Bitrix has vouched for the
    user. Rejections log a reason and never the token.
    """

    keyword = "Bearer"

    def _raw_token(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        if header:
            parts = header.split()
            if len(parts) != 2 or parts[0] != self.keyword:
                raise exceptions.AuthenticationFailed("Malformed Authorization header")
            return parts[1]

        # EventSource cannot set request headers, so the SSE stream is the one
        # endpoint that has to accept the token as a query parameter. Scoped to
        # that path only, so a token cannot be smuggled into a write via a URL
        # that might end up in a log or a referrer.
        if request.path.rstrip("/").endswith("/events"):
            return request.query_params.get("access_token") or None

        return None

    def authenticate(self, request):
        raw = self._raw_token(request)
        if not raw:
            return None

        try:
            payload = decode(raw)
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

        # The role claim inside the token is only a snapshot. The database row
        # is authoritative, so demoting an admin takes effect immediately
        # instead of waiting for their current token to expire.
        return (user, payload)

    def authenticate_header(self, request):
        return self.keyword
