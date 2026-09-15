import logging
import time

from django.conf import settings
from django.http import StreamingHttpResponse
from rest_framework.views import APIView

from . import events

log = logging.getLogger(__name__)


class EventStreamView(APIView):
    """
    Server-Sent Events.

    Authenticated by the same bearer token, which for this endpoint alone may
    arrive as `?access_token=` because EventSource cannot set headers.
    """

    def get(self, request):
        user = request.user
        heartbeat = settings.SSE_HEARTBEAT_SECONDS
        max_lifetime = settings.SSE_MAX_LIFETIME_SECONDS

        def stream():
            pubsub = events.subscribe(user)
            started = time.monotonic()
            last_beat = started
            try:
                # Tells EventSource how long to wait before reconnecting, so a
                # server restart does not produce a reconnect storm.
                yield "retry: 5000\n\n"
                while True:
                    if time.monotonic() - started > max_lifetime:
                        # Recycled deliberately: an immortal connection leaks a
                        # worker slot if the client vanishes without FIN.
                        break

                    message = pubsub.get_message(timeout=1.0)
                    if message and message.get("type") == "message":
                        yield f"data: {message['data']}\n\n"

                    now = time.monotonic()
                    if now - last_beat >= heartbeat:
                        # A comment frame. Idle proxies drop a silent
                        # connection well before their read timeout, and the
                        # browser then reports a network error rather than a
                        # clean end of stream.
                        yield ": keepalive\n\n"
                        last_beat = now
            except GeneratorExit:
                raise
            except Exception:
                log.warning("sse stream ended unexpectedly", exc_info=True)
            finally:
                try:
                    pubsub.close()
                except Exception:
                    pass

        response = StreamingHttpResponse(stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        # Without this nginx buffers the stream and nothing arrives until the
        # buffer fills, which for heartbeat-sized frames is effectively never.
        response["X-Accel-Buffering"] = "no"
        return response
