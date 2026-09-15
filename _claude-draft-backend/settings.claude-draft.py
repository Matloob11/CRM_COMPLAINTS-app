"""
Django settings for the A7 Complaints System.

Everything environment-driven. Nothing secret is ever defaulted to a usable value:
if a secret is missing the process refuses to start rather than running insecurely.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return value


def env_bool(name, default=False):
    return str(os.environ.get(name, default)).lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# --------------------------------------------------------------------------
# Core
# --------------------------------------------------------------------------

DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = env("DJANGO_SECRET_KEY", required=not DEBUG) or "insecure-dev-only-key"
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "complaints.srv1802669.hstgr.cloud,localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.complaints",
]

# NOTE: XFrameOptionsMiddleware is deliberately absent.
#
# This application is designed to be framed by the Bitrix24 CRM. Django's
# clickjacking middleware would send `X-Frame-Options: DENY`, which has no
# origin allowlist and would block the CRM iframe outright with no way to
# override it per-origin. Framing is instead controlled by nginx, which sends
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

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "complaints"),
        "USER": env("POSTGRES_USER", "complaints"),
        "PASSWORD": env("POSTGRES_PASSWORD", required=not DEBUG),
        "HOST": env("POSTGRES_HOST", "complaints-postgres"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# Redis / Celery
# --------------------------------------------------------------------------

REDIS_URL = env("REDIS_URL", "redis://complaints-redis:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# --------------------------------------------------------------------------
# Bitrix24 integration
# --------------------------------------------------------------------------

BITRIX_PORTAL_URL = env("BITRIX_PORTAL_URL", "https://crm.a7grouprealestatedxb.com").rstrip("/")

# Set once, at install time, from the member_id Bitrix sends to /bitrix/install/.
# Every subsequent handler POST is rejected unless its member_id matches.
BITRIX_EXPECTED_MEMBER_ID = env("BITRIX_EXPECTED_MEMBER_ID", "")

# Admins: Bitrix user id 1 ("Admin Abdul Malik") and id 2558 ("khadija Munir").
# Read from the environment so additional admins need no code change.
# Bitrix id 43 ("Abdul Malik Mughal") is an imconnector_* WhatsApp contact
# record, not a portal user, and must never appear here.
ADMIN_BITRIX_IDS = {int(x) for x in env_list("COMPLAINTS_ADMIN_BITRIX_IDS", "1,2558")}

BITRIX_REQUEST_TIMEOUT = int(env("BITRIX_REQUEST_TIMEOUT", "15"))

# --------------------------------------------------------------------------
# Application auth
# --------------------------------------------------------------------------

JWT_SECRET = env("COMPLAINTS_JWT_SECRET", required=not DEBUG) or "insecure-dev-only-jwt"
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(env("COMPLAINTS_JWT_TTL_HOURS", "12"))

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.complaints.authentication.AppJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 30,
    "UNAUTHENTICATED_USER": None,
}

# --------------------------------------------------------------------------
# Uploads and media
# --------------------------------------------------------------------------

MEDIA_ROOT = Path(env("COMPLAINTS_MEDIA_ROOT", "/media"))
UPLOAD_TMP_ROOT = Path(env("COMPLAINTS_UPLOAD_TMP", "/var/tmp/uploads"))

# The owner explicitly refused any upload size cap, so a single POST is not
# viable: one dropped packet on a multi-gigabyte video loses the entire
# transfer. Files arrive as resumable 8 MB chunks instead, and no Django-level
# size limit is set that would contradict nginx's `client_max_body_size 0`.
UPLOAD_CHUNK_SIZE = int(env("COMPLAINTS_UPLOAD_CHUNK_SIZE", str(8 * 1024 * 1024)))
UPLOAD_ABANDON_HOURS = int(env("COMPLAINTS_UPLOAD_ABANDON_HOURS", "24"))
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# nginx serves the actual bytes via X-Accel-Redirect once Django has authorised
# the request, so media is never reachable by guessing a URL.
MEDIA_INTERNAL_PREFIX = env("COMPLAINTS_MEDIA_INTERNAL_PREFIX", "/protected-media")

# --------------------------------------------------------------------------
# Outbound notifications (n8n)
# --------------------------------------------------------------------------

N8N_WEBHOOK_URL = env("COMPLAINTS_N8N_WEBHOOK_URL", "")
N8N_WEBHOOK_SECRET = env("COMPLAINTS_N8N_WEBHOOK_SECRET", "")

# --------------------------------------------------------------------------
# Static, i18n, misc
# --------------------------------------------------------------------------

# Cache-busting suffix for the SPA assets, stamped at build time by deploy.sh.
APP_BUILD_ID = env("APP_BUILD_ID", "dev")

STATIC_URL = "/django-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Display timezone for humans; storage stays UTC.
DISPLAY_TIME_ZONE = "Asia/Dubai"

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "https://complaints.srv1802669.hstgr.cloud",
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "stdout": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {"handlers": ["stdout"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
    "loggers": {
        "django.request": {"handlers": ["stdout"], "level": "WARNING", "propagate": False},
    },
}
