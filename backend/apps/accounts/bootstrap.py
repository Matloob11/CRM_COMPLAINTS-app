"""
SPA bootstrap rendering.

The frontend is a Vite build with content-hashed asset names. Rather than
tracking those hashes, the handler serves the build's own `index.html` and
injects the auth token into it. A frontend rebuild therefore needs no backend
change and no manifest parsing, and there is exactly one copy of the asset
references to go stale.
"""

import html
import json
import logging
from pathlib import Path

from django.conf import settings

log = logging.getLogger(__name__)

# Loads BX24, which the SPA needs for fitWindow(). Not pinned with Subresource
# Integrity on purpose: this is a mutable versioned loader that Bitrix updates
# in place, so a pinned hash would break the app on their next release rather
# than protect anything. The origin is fixed to https so it cannot be
# downgraded.
_BX24_TAG = '<script src="https://api.bitrix24.com/api/v1/"></script>'

_FALLBACK = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Complaints</title>{head}</head>
<body><div id="root"></div>
<p style="font:14px system-ui;padding:24px;color:#64748b">
The Complaints interface has not been deployed yet.</p>
</body></html>"""


def _index_html():
    path = Path(settings.FRONTEND_DIST) / "index.html"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        log.warning("frontend build not found", extra={"path": str(path)})
        return None


def render(*, token, user, placement, placement_options):
    """Return the SPA HTML with the bootstrap payload injected."""
    payload = {
        "token": token,
        "api_base": "/api/v1",
        "placement": placement or "",
        "placement_options": placement_options or {},
        "user": {
            "bitrix_id": user.bitrix_id,
            "name": user.name,
            "role": user.role,
        },
    }

    # Serialised into a JSON script block rather than a JS literal so that a
    # name containing a quote or an angle bracket cannot break out into
    # executable context. `</` is escaped because it would otherwise close the
    # script element early.
    encoded = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")

    head = (
        f"{_BX24_TAG}"
        f'<script id="complaints-bootstrap" type="application/json">{encoded}</script>'
        f'<meta name="complaints-token" content="{html.escape(token, quote=True)}">'
    )

    document = _index_html()
    if document is None:
        return _FALLBACK.format(head=head)

    if "</head>" in document:
        return document.replace("</head>", head + "</head>", 1)
    return head + document
