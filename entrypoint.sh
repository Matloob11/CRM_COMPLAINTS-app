#!/bin/sh
set -e

# Only the web container migrates. The worker shares this image, and two
# containers racing `migrate` on startup is how you get a half-applied schema.
if [ "${RUN_MIGRATIONS:-1}" = "1" ] && [ "${1}" = "gunicorn" ]; then
    echo "running migrations"
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput --clear >/dev/null
fi

exec "$@"
