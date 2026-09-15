"""
Resumable chunked uploads.

The owner refused any size cap: an agent may attach a multi-gigabyte video. A
single POST cannot serve that -- one dropped connection loses the whole
transfer and the user starts over. Files therefore arrive as fixed-size chunks
that can be retried individually and resumed after a network drop.
"""

import hashlib
import json
import logging
import re
import subprocess
import uuid
from pathlib import Path

from django.conf import settings

log = logging.getLogger(__name__)

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
_IMAGE_MIMES = ("image/",)
_VIDEO_MIMES = ("video/",)


def sanitise_filename(name):
    """
    Produce a filesystem-safe name.

    Path separators and traversal sequences are stripped rather than escaped:
    the original name is preserved separately for display, so nothing is lost
    by being aggressive here.
    """
    name = Path(name or "").name
    name = _SAFE_NAME.sub("_", name).strip("._") or "file"
    return name[:200]


def chunk_dir(upload_id):
    return settings.UPLOAD_TMP_ROOT / str(upload_id)


def chunk_path(upload_id, index):
    return chunk_dir(upload_id) / f"{index:08d}.part"


def storage_path(upload_id, filename, created_at):
    return (
        settings.MEDIA_ROOT
        / f"{created_at:%Y}"
        / f"{created_at:%m}"
        / str(upload_id)
        / filename
    )


def write_chunk(upload, index, data):
    directory = chunk_dir(upload.id)
    directory.mkdir(parents=True, exist_ok=True)

    target = chunk_path(upload.id, index)
    # Write to a temp name then rename, so a half-written chunk from an aborted
    # request is never mistaken for a complete one on resume.
    staging = target.with_suffix(".partial")
    staging.write_bytes(data)
    staging.replace(target)

    received = set(upload.received_chunks)
    received.add(index)
    upload.received_chunks = sorted(received)
    upload.save(update_fields=["received_chunks", "updated_at"])


def assemble(upload):
    """
    Concatenate chunks into the final file and return its metadata.

    Returns (path, size_bytes, sha256). Raises ValueError if a chunk is
    missing, which the caller surfaces as a 409 so the client can resume rather
    than restart.
    """
    from django.utils import timezone

    expected = upload.expected_chunks
    missing = [i for i in range(expected) if not chunk_path(upload.id, i).exists()]
    if missing:
        raise ValueError(f"missing chunks: {missing[:10]}")

    filename = sanitise_filename(upload.original_name)
    destination = storage_path(upload.id, filename, timezone.now())
    destination.parent.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha256()
    size = 0
    with open(destination, "wb") as out:
        for index in range(expected):
            data = chunk_path(upload.id, index).read_bytes()
            digest.update(data)
            size += len(data)
            out.write(data)

    return destination, size, digest.hexdigest()


def cleanup(upload_id):
    import shutil

    shutil.rmtree(chunk_dir(upload_id), ignore_errors=True)


def probe_media(path, mime):
    """
    Best-effort dimensions and duration for the thumbnail UI.

    Never transcodes: this box also runs the WhatsApp stacks and the CPU is not
    ours to spend. Failure is silent and non-fatal -- the file is still valid,
    the UI just renders a generic card.
    """
    result = {"width": None, "height": None, "duration_seconds": None}

    if mime.startswith(_IMAGE_MIMES):
        try:
            from PIL import Image

            with Image.open(path) as image:
                result["width"], result["height"] = image.size
        except Exception:
            log.debug("image probe failed", exc_info=True)
        return result

    if mime.startswith(_VIDEO_MIMES):
        try:
            output = subprocess.run(
                [
                    "ffprobe", "-v", "quiet", "-print_format", "json",
                    "-show_streams", "-show_format", str(path),
                ],
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
            log.debug("video probe failed", exc_info=True)

    return result


def new_upload_id():
    return uuid.uuid4()
