import logging
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status as http
from rest_framework.parsers import BaseParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tickets.views import complaints_for

from . import storage
from .models import Attachment, Upload
from .serializers import AttachmentSerializer

log = logging.getLogger(__name__)


class OctetStreamParser(BaseParser):
    """A chunk is an opaque byte range, not form data."""

    media_type = "application/octet-stream"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


class UploadInitView(APIView):
    def post(self, request):
        filename = (request.data.get("filename") or "").strip()
        mime = (request.data.get("mime") or "application/octet-stream").strip()
        try:
            size = int(request.data.get("size_bytes"))
        except (TypeError, ValueError):
            return Response({"detail": "size_bytes is required."}, status=http.HTTP_400_BAD_REQUEST)

        if not filename or size < 0:
            return Response(
                {"detail": "filename and a non-negative size_bytes are required."},
                status=http.HTTP_400_BAD_REQUEST,
            )

        upload = Upload.objects.create(
            owner=request.user,
            original_name=filename[:512],
            mime=mime[:255],
            total_bytes=size,
            chunk_size=settings.UPLOAD_CHUNK_SIZE,
        )
        return Response(
            {"upload_id": str(upload.id), "chunk_size": upload.chunk_size},
            status=http.HTTP_201_CREATED,
        )


class UploadChunkView(APIView):
    parser_classes = [OctetStreamParser]

    def put(self, request, upload_id, index):
        upload = get_object_or_404(Upload, pk=upload_id, owner=request.user, completed=False)

        try:
            index = int(index)
        except (TypeError, ValueError):
            raise Http404

        if index < 0 or index >= upload.expected_chunks:
            return Response({"detail": "Chunk index out of range."}, status=http.HTTP_400_BAD_REQUEST)

        data = request.data if isinstance(request.data, (bytes, bytearray)) else request.body
        received = storage.write_chunk(upload, index, data)
        return Response({"received": received})


class UploadCompleteView(APIView):
    def post(self, request, upload_id):
        upload = get_object_or_404(Upload, pk=upload_id, owner=request.user)
        if upload.completed:
            return Response({"detail": "This upload is already complete."}, status=http.HTTP_409_CONFLICT)

        try:
            path, size, checksum = storage.assemble(upload)
        except ValueError as exc:
            # 409 rather than 400: the client fixes this by sending the missing
            # chunks, without restarting a multi-gigabyte transfer.
            return Response(
                {"detail": str(exc), "received_chunks": upload.received_chunks},
                status=http.HTTP_409_CONFLICT,
            )

        claimed = (request.data.get("checksum_sha256") or "").strip().lower()
        if claimed and claimed != checksum:
            Path(path).unlink(missing_ok=True)
            storage.cleanup(upload.id)
            upload.delete()
            return Response(
                {"detail": "Checksum mismatch; the upload was corrupted in transit."},
                status=http.HTTP_400_BAD_REQUEST,
            )

        probe = storage.probe(path, upload.mime)
        attachment = Attachment.objects.create(
            uploaded_by=request.user,
            original_name=upload.original_name,
            stored_path=str(path),
            mime=upload.mime,
            size_bytes=size,
            checksum_sha256=checksum,
            width=probe["width"],
            height=probe["height"],
            duration_seconds=probe["duration_seconds"],
        )

        upload.completed = True
        upload.save(update_fields=["completed", "updated_at"])
        storage.cleanup(upload.id)

        return Response(
            {
                "attachment_id": str(attachment.pk),
                "attachment": AttachmentSerializer(attachment).data,
            },
            status=http.HTTP_201_CREATED,
        )


class AttachmentDownloadView(APIView):
    def get(self, request, pk):
        attachment = get_object_or_404(Attachment, pk=pk)

        # Authorisation is re-checked on every download. An unguessable path is
        # not an access control.
        if attachment.message_id is None:
            if attachment.uploaded_by_id != request.user.pk:
                raise Http404
        else:
            message = attachment.message
            if message.is_internal and not request.user.is_admin:
                raise Http404
            if not complaints_for(request.user).filter(pk=message.complaint_id).exists():
                raise Http404

        path = Path(attachment.stored_path)
        disposition = f'inline; filename*=UTF-8\'\'{quote(attachment.original_name)}'

        if not settings.USE_X_ACCEL_REDIRECT:
            # Development and tests: no nginx in front to honour the header.
            if not path.exists():
                raise Http404
            response = FileResponse(path.open("rb"), content_type=attachment.mime)
            response["Content-Disposition"] = disposition
            return response

        try:
            relative = path.relative_to(Path(settings.MEDIA_ROOT))
        except ValueError:
            log.error("attachment outside media root", extra={"attachment_id": str(attachment.pk)})
            raise Http404

        # nginx streams the bytes; Django only authorises. This keeps a
        # multi-gigabyte video off the Python worker entirely.
        response = HttpResponse(status=200)
        response["X-Accel-Redirect"] = f"{settings.MEDIA_INTERNAL_PREFIX}/{quote(str(relative).replace(chr(92), '/'))}"
        response["Content-Type"] = attachment.mime
        response["Content-Disposition"] = disposition
        del response["Content-Length"]
        return response
