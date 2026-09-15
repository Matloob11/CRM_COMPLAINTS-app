import json
import logging
import time
from urllib.parse import quote

from django.conf import settings
from django.db.models import Count, OuterRef, Q, Subquery
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.parsers import BaseParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import events, services, uploads
from .models import (
    AppUser,
    Attachment,
    Complaint,
    Message,
    ReadReceipt,
    Role,
    Status,
    Upload,
)
from .permissions import IsAdmin
from .serializers import (
    AppUserSerializer,
    ComplaintCreateSerializer,
    ComplaintDetailSerializer,
    ComplaintListSerializer,
    ComplaintUpdateSerializer,
    MessageCreateSerializer,
    MessageSerializer,
)

log = logging.getLogger(__name__)


def _complaints_for(user):
    """Every read path starts here. See ComplaintQuerySet.visible_to."""
    return Complaint.objects.visible_to(user).select_related("author", "assigned_to")


def _get_complaint_or_404(user, pk):
    """
    404, never 403, when a complaint belongs to someone else.

    A 403 would confirm the id exists, which leaks how many complaints other
    agents have filed and lets someone enumerate them.
    """
    try:
        return _complaints_for(user).get(pk=pk)
    except Complaint.DoesNotExist:
        raise Http404


class MeView(APIView):
    def get(self, request):
        user = request.user
        user.last_seen_at = timezone.now()
        user.save(update_fields=["last_seen_at"])
        return Response(
            {
                "user": AppUserSerializer(user).data,
                "role": user.role,
                "is_admin": user.is_admin,
                "display_timezone": settings.DISPLAY_TIME_ZONE,
                "upload_chunk_size": settings.UPLOAD_CHUNK_SIZE,
            }
        )


class ComplaintListCreateView(APIView):
    def get(self, request):
        user = request.user
        queryset = _complaints_for(user)

        status_filter = request.query_params.get("status")
        if status_filter and status_filter != "all":
            queryset = queryset.filter(status=status_filter)

        search = (request.query_params.get("q") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(subject__icontains=search)
                | Q(ticket_no__icontains=search)
                | Q(messages__body__icontains=search)
            ).distinct()

        if user.is_admin:
            assigned = request.query_params.get("assigned_to")
            if assigned == "none":
                queryset = queryset.filter(assigned_to__isnull=True)
            elif assigned:
                queryset = queryset.filter(assigned_to_id=assigned)
            author = request.query_params.get("author")
            if author:
                queryset = queryset.filter(author_id=author)

        # Annotated rather than resolved per row: the list is the hottest query
        # in the app and a per-row lookup would make it N+1 twice over.
        visible_messages = Message.objects.filter(complaint=OuterRef("pk")).readable_by(user)
        last_body = visible_messages.order_by("-id").values("body")[:1]

        receipt = ReadReceipt.objects.filter(complaint=OuterRef("pk"), user=user).values(
            "last_read_message_id"
        )[:1]

        queryset = queryset.annotate(
            preview_body=Subquery(last_body),
            last_read=Subquery(receipt),
        )

        page_size = min(int(request.query_params.get("page_size", 30)), 100)
        page = max(int(request.query_params.get("page", 1)), 1)
        offset = (page - 1) * page_size
        total = queryset.count()
        rows = list(queryset[offset : offset + page_size])

        # Unread counts in one grouped query for the page, rather than one per row.
        unread_map = {}
        if rows:
            unread_rows = (
                Message.objects.filter(complaint_id__in=[r.pk for r in rows])
                .readable_by(user)
                .exclude(sender=user)
                .values("complaint_id")
                .annotate(total=Count("id"), newest=Count("id"))
            )
            counts = {}
            for row in Message.objects.filter(
                complaint_id__in=[r.pk for r in rows]
            ).readable_by(user).exclude(sender=user).values("complaint_id", "id"):
                counts.setdefault(row["complaint_id"], []).append(row["id"])
            for complaint in rows:
                last_read = complaint.last_read or 0
                unread_map[complaint.pk] = sum(
                    1 for mid in counts.get(complaint.pk, []) if mid > last_read
                )
            del unread_rows

        for complaint in rows:
            complaint.unread_count_value = unread_map.get(complaint.pk, 0)

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "results": ComplaintListSerializer(rows, many=True).data,
            }
        )

    def post(self, request):
        serializer = ComplaintCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        complaint, _ = services.create_complaint(
            author=request.user,
            subject=data["subject"],
            body=data["body"],
            priority=data["priority"],
            attachment_ids=data["attachment_ids"],
        )
        complaint.preview_body = data["body"]
        complaint.unread_count_value = 0
        return Response(
            ComplaintDetailSerializer(complaint).data, status=http_status.HTTP_201_CREATED
        )


class ComplaintDetailView(APIView):
    def get(self, request, pk):
        complaint = _get_complaint_or_404(request.user, pk)
        complaint.preview_body = ""
        complaint.unread_count_value = 0
        return Response(ComplaintDetailSerializer(complaint).data)

    def patch(self, request, pk):
        complaint = _get_complaint_or_404(request.user, pk)

        # Only an admin may move a complaint's state. An agent who reaches this
        # for their own complaint is still refused.
        if not request.user.is_admin:
            return Response(
                {"detail": "Administrator role required."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        serializer = ComplaintUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "priority" in data:
            complaint.priority = data["priority"]
            complaint.save(update_fields=["priority", "updated_at"])

        if "assigned_to_id" in data:
            assignee = None
            if data["assigned_to_id"] is not None:
                assignee = get_object_or_404(AppUser, pk=data["assigned_to_id"])
            services.change_assignment(
                complaint=complaint, actor=request.user, assignee=assignee
            )

        if "status" in data:
            services.change_status(
                complaint=complaint,
                actor=request.user,
                to_status=data["status"],
                note=data["note"],
            )

        complaint.refresh_from_db()
        complaint.preview_body = ""
        complaint.unread_count_value = 0
        return Response(ComplaintDetailSerializer(complaint).data)


class MessageListCreateView(APIView):
    def get(self, request, pk):
        complaint = _get_complaint_or_404(request.user, pk)
        queryset = (
            Message.objects.filter(complaint=complaint)
            .readable_by(request.user)
            .select_related("sender")
            .prefetch_related("attachments")
        )

        after_id = request.query_params.get("after_id")
        if after_id:
            queryset = queryset.filter(id__gt=after_id)

        limit = min(int(request.query_params.get("limit", 100)), 200)
        return Response({"results": MessageSerializer(queryset[:limit], many=True).data})

    def post(self, request, pk):
        complaint = _get_complaint_or_404(request.user, pk)
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # An agent must never be able to write an internal note, even by
        # crafting the request by hand.
        is_internal = bool(data["is_internal"]) and request.user.is_admin

        message = services.post_message(
            complaint=complaint,
            sender=request.user,
            body=data["body"],
            attachment_ids=data["attachment_ids"],
            is_internal=is_internal,
        )
        return Response(
            MessageSerializer(message).data, status=http_status.HTTP_201_CREATED
        )


class MarkReadView(APIView):
    def post(self, request, pk):
        complaint = _get_complaint_or_404(request.user, pk)
        last_id = int(request.data.get("last_read_message_id") or 0)

        receipt, _ = ReadReceipt.objects.get_or_create(
            complaint=complaint, user=request.user
        )
        if last_id > receipt.last_read_message_id:
            receipt.last_read_message_id = last_id
            receipt.save(update_fields=["last_read_message_id", "updated_at"])
        return Response({"last_read_message_id": receipt.last_read_message_id})


class StatsView(APIView):
    def get(self, request):
        queryset = Complaint.objects.visible_to(request.user)
        counts = {row["status"]: row["n"] for row in queryset.values("status").annotate(n=Count("id"))}
        return Response(
            {
                "total": sum(counts.values()),
                "by_status": {value: counts.get(value, 0) for value, _ in Status.choices},
            }
        )


class UserListView(APIView):
    """Assignee picker. Admin-only: an agent must not be able to enumerate
    colleagues through this app."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = AppUser.objects.filter(is_active=True)
        if request.query_params.get("role"):
            queryset = queryset.filter(role=request.query_params["role"])
        return Response({"results": AppUserSerializer(queryset, many=True).data})


# --------------------------------------------------------------------------
# Uploads
# --------------------------------------------------------------------------


class RawBinaryParser(BaseParser):
    """Chunks arrive as an opaque byte range, not as form data."""

    media_type = "application/octet-stream"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


class UploadInitView(APIView):
    def post(self, request):
        name = (request.data.get("filename") or "").strip()
        mime = (request.data.get("mime") or "application/octet-stream").strip()
        try:
            total = int(request.data.get("total_bytes"))
        except (TypeError, ValueError):
            return Response(
                {"detail": "total_bytes is required."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not name or total < 0:
            return Response(
                {"detail": "filename and a non-negative total_bytes are required."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        upload = Upload.objects.create(
            id=uploads.new_upload_id(),
            owner=request.user,
            original_name=name[:512],
            mime=mime[:255],
            total_bytes=total,
            chunk_size=settings.UPLOAD_CHUNK_SIZE,
        )
        return Response(
            {
                "upload_id": str(upload.id),
                "chunk_size": upload.chunk_size,
                "expected_chunks": upload.expected_chunks,
                "received_chunks": [],
            },
            status=http_status.HTTP_201_CREATED,
        )


class UploadChunkView(APIView):
    parser_classes = [RawBinaryParser]

    def put(self, request, upload_id, index):
        upload = get_object_or_404(Upload, pk=upload_id, owner=request.user, completed=False)
        index = int(index)
        if index < 0 or index >= upload.expected_chunks:
            return Response(
                {"detail": "Chunk index out of range."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        data = request.data if isinstance(request.data, bytes) else request.body
        uploads.write_chunk(upload, index, data)
        return Response(
            {"received_chunks": upload.received_chunks, "expected_chunks": upload.expected_chunks}
        )

    def get(self, request, upload_id, index=None):
        """Resume support: tell the client what already landed."""
        upload = get_object_or_404(Upload, pk=upload_id, owner=request.user)
        return Response(
            {"received_chunks": upload.received_chunks, "expected_chunks": upload.expected_chunks}
        )


class UploadCompleteView(APIView):
    def post(self, request, upload_id):
        upload = get_object_or_404(Upload, pk=upload_id, owner=request.user)
        if upload.completed:
            return Response({"detail": "Already completed."}, status=http_status.HTTP_409_CONFLICT)

        try:
            path, size, checksum = uploads.assemble(upload)
        except ValueError as exc:
            # 409 rather than 400: the client can fix this by sending the
            # missing chunks, without starting the transfer over.
            return Response(
                {"detail": str(exc), "received_chunks": upload.received_chunks},
                status=http_status.HTTP_409_CONFLICT,
            )

        client_checksum = (request.data.get("sha256") or "").strip().lower()
        if client_checksum and client_checksum != checksum:
            path.unlink(missing_ok=True)
            uploads.cleanup(upload.id)
            upload.delete()
            return Response(
                {"detail": "Checksum mismatch; the upload was corrupted in transit."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        probe = uploads.probe_media(path, upload.mime)
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
        uploads.cleanup(upload.id)

        return Response(
            {
                "attachment_id": attachment.pk,
                "original_name": attachment.original_name,
                "mime": attachment.mime,
                "size_bytes": attachment.size_bytes,
                "width": attachment.width,
                "height": attachment.height,
                "duration_seconds": attachment.duration_seconds,
            },
            status=http_status.HTTP_201_CREATED,
        )


class AttachmentDownloadView(APIView):
    def get(self, request, pk):
        attachment = get_object_or_404(Attachment, pk=pk)

        # Ownership is re-checked on every download. An unguessable path is not
        # an access control.
        if attachment.message_id is None:
            if attachment.uploaded_by_id != request.user.pk:
                raise Http404
        else:
            message = attachment.message
            if message.is_internal and not request.user.is_admin:
                raise Http404
            if not _complaints_for(request.user).filter(pk=message.complaint_id).exists():
                raise Http404

        try:
            relative = str(attachment.stored_path).replace(str(settings.MEDIA_ROOT), "", 1).lstrip("/\\")
        except Exception:
            raise Http404

        # nginx streams the bytes; Django only authorises. This keeps a
        # multi-gigabyte video off the Python worker entirely.
        response = HttpResponse(status=200)
        response["X-Accel-Redirect"] = f"{settings.MEDIA_INTERNAL_PREFIX}/{quote(relative)}"
        response["Content-Type"] = attachment.mime
        response["Content-Disposition"] = (
            f'inline; filename="{quote(attachment.original_name)}"'
        )
        del response["Content-Length"]
        return response


# --------------------------------------------------------------------------
# Realtime
# --------------------------------------------------------------------------


class EventStreamView(APIView):
    """
    Server-Sent Events.

    Strictly an enhancement. If this endpoint is unavailable the frontend polls
    the REST endpoints instead, so nothing here may be load-bearing.
    """

    def get(self, request):
        user = request.user

        def stream():
            pubsub = events.subscribe(user)
            last_beat = time.monotonic()
            try:
                yield "retry: 5000\n\n"
                while True:
                    message = pubsub.get_message(timeout=1.0)
                    if message and message.get("type") == "message":
                        yield f"data: {message['data']}\n\n"
                    now = time.monotonic()
                    if now - last_beat > 25:
                        # Comment frame. Without it, intermediary proxies close
                        # an idle connection and the client reconnect-storms.
                        yield ": keepalive\n\n"
                        last_beat = now
            except GeneratorExit:
                raise
            except Exception:
                log.warning("sse stream ended", exc_info=True)
            finally:
                try:
                    pubsub.close()
                except Exception:
                    pass

        response = StreamingHttpResponse(stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({"status": "ok", "time": timezone.now().isoformat()})
