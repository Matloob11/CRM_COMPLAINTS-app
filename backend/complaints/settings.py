"""Settings for the A7 Complaints System.

Mirrors the shape of the a7wa settings module already running on this VPS so
the two stacks stay operationally interchangeable: same env() helpers, same
Postgres/Redis wiring, same stdout logging discipline.

Everything is environment-driven. No secret is ever defaulted to a usable
value: if one is missing in production the process refuses to start rather
than running with a key that is identical on every machine that has ever held
a copy of this repository.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return value


def env_bool(name, default=False):
    return str(os.environ.get(name, default)).lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


# Core
# ---------------------------------------------------------------------------
DEBUG = env_bool("DJANGO_DEBUG", env("DEBUG", "false"))
SECRET_KEY = env("DJANGO_SECRET_KEY", required=not DEBUG) or "insecure-dev-only-key"
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    env("ALLOWED_HOSTS", "complaints.srv1802669.hstgr.cloud,localhost,127.0.0.1"),
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "apps.accounts",
    "apps.tickets",
    "apps.uploads",
    "apps.realtime",
    "apps.notifications",
]

# NOTE: XFrameOptionsMiddleware is deliberately absent.
#
# This application is designed to be framed by the Bitrix24 CRM. Django's
# clickjacking middleware sends `X-Frame-Options: DENY`, which has no origin
# allowlist and would block the CRM iframe outright with no per-origin
# override. Framing is controlled by nginx instead, which sends
#   Content-Security-Policy: frame-ancestors https://crm.a7grouprealestatedxb.com;
# That header is strictly more precise: exactly one origin may frame us.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "complaints.urls"
WSGI_APPLICATION = "complaints.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Data stores
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "complaints"),
        "USER": env("POSTGRES_USER", "complaints"),
        "PASSWORD": env("POSTGRES_PASSWORD", required=not DEBUG) or "complaints",
        "HOST": env("POSTGRES_HOST", "complaints-postgres"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REDIS_URL = env("REDIS_URL", "redis://complaints-redis:6379/0")
CELERY_BROKER_URL = env("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TIMEZONE = "UTC"

# When True the webhook and reaper tasks run inline instead of being queued.
# Only ever set in tests: a webhook must never block a user's request.
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)

# Bitrix24
# ---------------------------------------------------------------------------
BITRIX_PORTAL_URL = env("BITRIX_PORTAL_URL", "https://crm.a7grouprealestatedxb.com").rstrip("/")

# Recorded at install time from the member_id Bitrix sends to /bitrix/install/.
# Every later handler POST is rejected unless it matches. Configured in the
# environment by work package 1 once the local app is registered.
BITRIX_EXPECTED_MEMBER_ID = env("BITRIX_EXPECTED_MEMBER_ID", env("BITRIX_PORTAL_MEMBER_ID", ""))

BITRIX_CLIENT_ID = env("BITRIX_CLIENT_ID", "")
BITRIX_CLIENT_SECRET = env("BITRIX_CLIENT_SECRET", "")
BITRIX_REQUEST_TIMEOUT = float(env("BITRIX_REQUEST_TIMEOUT", "15"))

# Admin users: Bitrix user id 1 ("Admin Abdul Malik") and id 2558 ("khadija Munir").
# Read from the environment so additional admins need no code change. Bitrix id 43
# ("Abdul Malik Mughal") is an imconnector_* WhatsApp contact record, not a portal
# user, and must never appear here.
ADMIN_BITRIX_IDS = {
    int(value)
    for value in env_list("COMPLAINTS_ADMIN_BITRIX_IDS", "1,2558")
    if value.lstrip("-").isdigit()
}

# Application auth
# ---------------------------------------------------------------------------
JWT_SECRET = env("COMPLAINTS_JWT_SECRET", env("APP_JWT_SECRET")) or ("insecure-dev-only-jwt" if DEBUG else "")
if not JWT_SECRET:
    raise RuntimeError("Required environment variable COMPLAINTS_JWT_SECRET (or APP_JWT_SECRET) is not set")
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(env("COMPLAINTS_JWT_TTL_HOURS", "12"))

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.AppJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": "apps.tickets.pagination.PagePagination",
    "PAGE_SIZE": 30,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "complaints.exceptions.exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "A7 Complaints API",
    "DESCRIPTION": (
        "Complaint ticketing for A7 Group Real Estate, embedded in Bitrix24 as an "
        "iframe. No cookies and no login screen: the Bitrix handler mints a bearer "
        "token which every /api/v1/ call must present."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
}

# Uploads and media
# ---------------------------------------------------------------------------
MEDIA_ROOT = Path(env("COMPLAINTS_MEDIA_ROOT", env("MEDIA_ROOT", str(BASE_DIR / "media"))))
UPLOAD_TMP_ROOT = Path(env("COMPLAINTS_UPLOAD_TMP", str(BASE_DIR / "media" / "_incoming")))

# The owner explicitly refused any upload size cap, so a single POST is not
# viable: one dropped packet on a multi-gigabyte video loses the whole
# transfer. Files arrive as resumable chunks instead.
UPLOAD_CHUNK_SIZE = int(env("COMPLAINTS_UPLOAD_CHUNK_SIZE", str(8 * 1024 * 1024)))
UPLOAD_ABANDON_HOURS = int(env("COMPLAINTS_UPLOAD_ABANDON_HOURS", "24"))

# No Django-level request cap. nginx runs with `client_max_body_size 0` and
# `proxy_request_buffering off` because the owner requires unbounded uploads; a
# limit here would contradict it and reject the very case the design exists
# for. Safe because the only endpoint that receives a large body streams it
# straight to disk and never materialises request.body.
DATA_UPLOAD_MAX_MEMORY_SIZE = None
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024

# nginx streams the bytes via X-Accel-Redirect once Django has authorised the
# request, so a media file is never reachable by guessing a URL.
MEDIA_INTERNAL_PREFIX = env("COMPLAINTS_MEDIA_INTERNAL_PREFIX", "/protected_media").rstrip("/")

# False for local development and tests, where there is no nginx in front to
# honour X-Accel-Redirect and Django must serve the bytes itself.
USE_X_ACCEL_REDIRECT = env_bool("COMPLAINTS_USE_X_ACCEL_REDIRECT", not DEBUG)

# Frontend bootstrap
# ---------------------------------------------------------------------------
# Where work package 3 builds its Vite output. The handler reads
# `<dist>/.vite/manifest.json` to find the hashed entry files it references
# from the bootstrap HTML, so a frontend rebuild needs no backend change.
FRONTEND_DIST = Path(env("COMPLAINTS_FRONTEND_DIST", str(BASE_DIR / "frontend-dist")))
FRONTEND_ASSET_BASE = env("COMPLAINTS_FRONTEND_ASSET_BASE", "/").rstrip("/") + "/"

# Outbound notifications (n8n)
# ---------------------------------------------------------------------------
N8N_WEBHOOK_URL = env("COMPLAINTS_N8N_WEBHOOK_URL", env("N8N_WEBHOOK_URL", ""))
N8N_WEBHOOK_SECRET = env("COMPLAINTS_N8N_WEBHOOK_SECRET", "")
N8N_WEBHOOK_TIMEOUT = float(env("COMPLAINTS_N8N_WEBHOOK_TIMEOUT", "15"))

# Realtime
# ---------------------------------------------------------------------------
# A comment line every 25s. Idle proxies drop a silent connection well before
# their read timeout expires, and the browser then reports a network error
# rather than a clean end of stream.
SSE_HEARTBEAT_SECONDS = int(env("COMPLAINTS_SSE_HEARTBEAT_SECONDS", "25"))
SSE_MAX_LIFETIME_SECONDS = int(env("COMPLAINTS_SSE_MAX_LIFETIME_SECONDS", str(60 * 60)))

# Localisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
# Storage is UTC everywhere and the API always emits ISO-8601 UTC. Rendering in
# Asia/Dubai is the frontend's job; sending local times would lie to any client
# that is not in that zone.
TIME_ZONE = "UTC"
DISPLAY_TIME_ZONE = env("COMPLAINTS_DISPLAY_TIME_ZONE", "Asia/Dubai")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/django-static/"
STATIC_ROOT = Path(env("STATIC_ROOT", str(BASE_DIR / "staticfiles")))

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "https://complaints.srv1802669.hstgr.cloud,https://crm.a7grouprealestatedxb.com",
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {"stdout": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["stdout"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
        # httpx logs the full URL of every request at INFO. The Bitrix calls
        # carry AUTH_ID in the query string, so that one line would put a live
        # portal token into the container log, which far more people read than
        # the environment file the token is supposed to live in.
        "httpx": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
        "httpcore": {"level": "WARNING", "handlers": ["stdout"], "propagate": False},
    },
}
