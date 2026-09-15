FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=complaints.settings

# ffprobe only, to read dimensions and duration for the thumbnail UI. Nothing
# is transcoded here: the WhatsApp stacks on this box need the CPU.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/media /app/staticfiles /app/frontend-dist \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8200

ENTRYPOINT ["/app/entrypoint.sh"]

# gevent workers: the SSE endpoint holds one connection open per viewer, which
# would pin a sync worker for its entire lifetime.
CMD ["gunicorn", "complaints.wsgi:application", \
     "--bind", "0.0.0.0:8200", \
     "--worker-class", "gevent", \
     "--workers", "4", \
     "--worker-connections", "250", \
     "--timeout", "3600", \
     "--graceful-timeout", "30", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
