"""
Chunk handling for resumable uploads.

The owner refused any size cap, so a multi-gigabyte video is the normal case,
not the edge case. A single POST cannot serve that: one dropped connection
loses the whole transfer. Files arrive as fixed-size chunks that are retried
and resumed individually.
"""

import hashlib
import json
import logging
import re
import shutil
import subprocess
from pathlib import Path

from django.conf import settings
from django.utils import timezone

log = logging.getLogger(__name__)

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def sanitise_filename(name):
    """
    Produce a filesystem-safe name.

    Path separators and traversal sequences are stripped rather than escaped.
    Being aggressive costs nothing here because the original name is stored
    separately for display.
    """
    name = Path(name or "").name
    name = _UNSAFE.sub("_", name).strip("._")
    return (name or "file")[:200]


def chunk_dir(upload_id):
    return Path(settings.UPLOAD_TMP_ROOT) / str(upload_id)


def chunk_path(upload_id, index):
    return chunk_dir(upload_id) / f"{index:08d}.part"


def write_chunk(upload, index, data):
    """Persist one chunk. Idempotent: re-sending a chunk is how resume works."""
    directory = chunk_dir(upload.id)
    directory.mkdir(parents=True, exist_ok=True)

    target = chunk_path(upload.id, index)
    # Write to a staging name and rename, so a half-written chunk from an
    # aborted request is never mistaken for a complete one on resume.
    staging = target.with_suffix(".partial")
    staging.write_bytes(data)
    staging.replace(target)

    received = set(upload.received_chunks or [])
    received.add(int(index))
    upload.received_chunks = sorted(received)
    upload.save(update_fields=["received_chunks", "updated_at"])
    return len(upload.received_chunks)


def assemble(upload):
    """
    Concatenate chunks into the final file.

    Returns (path, size_bytes, sha256_hex). Raises ValueError naming the
    missing chunks so the client can resume rather than restart.
    """
    expected = upload.expected_chunks
    missing = [i for i in range(expected) if not chunk_path(upload.id, i).exists()]
    if missing:
        raise ValueError(f"missing chunks: {missing[:10]}")

    now = timezone.now()
    destination = (
        Path(settings.MEDIA_ROOT)
        / f"{now:%Y}"
        / f"{now:%m}"
        / str(upload.id)
        / sanitise_filename(upload.original_name)
    )
    destination.parent.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha256()
    size = 0
    # Streamed in fixed blocks: a 2 GB file must never be held in memory, which
    # is the whole reason the chunked protocol exists.
    with open(destination, "wb") as out:
        for index in range(expected):
            with open(chunk_path(upload.id, index), "rb") as part:
                while True:
                    block = part.read(1024 * 1024)
                    if not block:
                        break
                    digest.update(block)
                    size += len(block)
                    out.write(block)

    return destination, size, digest.hexdigest()


def cleanup(upload_id):
    shutil.rmtree(chunk_dir(upload_id), ignore_errors=True)


def probe(path, mime):
    """
    Best-effort dimensions and duration, for the thumbnail UI.

    Never transcodes: this box also runs the WhatsApp stacks and the CPU is not
    ours to spend. Failure is silent and non-fatal -- the file is still valid,
    the UI just renders a generic file card.
    """
    result = {"width": None, "height": None, "duration_seconds": None}

    if mime.startswith("image/"):
        try:
            from PIL import Image

            with Image.open(path) as image:
                result["width"], result["height"] = image.size
        except Exception:
            log.debug("image probe failed", exc_info=True)
        return result

    if mime.startswith(("video/", "audio/")):
        try:
            output = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                capture_output=True,
                timeout=30,
                check=True,
            ).stdout
            data = json.loads(output)
            duration = data.get("format", {}).get("duration")
            if duration:
                result["duration_seconds"] = float(duration)
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    result["width"] = stream.get("width")
                    result["height"] = stream.get("height")
                    break
        except Exception:
            log.debug("media probe failed", exc_info=True)

    return result
