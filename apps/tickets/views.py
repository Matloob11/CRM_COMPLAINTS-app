from django.db.models import Count, F, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status as http
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AppUser

from . import services
from .models import Complaint, Message, ReadReceipt, Status
from .pagination import PagePagination
from .serializers import (
    ComplaintCreateSerializer,
    ComplaintDetailSerializer,
    ComplaintSummarySerializer,
    ComplaintUpdateSerializer,
    MessageCreateSerializer,
    MessageSerializer,
)


def complaints_for(user):
    """Every read path starts here. See ComplaintQuerySet.visible_to."""
    return Complaint.objects.visible_to(user).select_related("author", "assigned_to")


def get_complaint_or_404(user, pk):
    """
    404, never 403, for a complaint belonging to someone else.

    A 403 would confirm the id exists, which is enough to enumerate how many
    complaints colleagues have filed.
    """
    try:
        return complaints_for(user).get(pk=pk)
    except Complaint.DoesNotExist:
        raise Http404


def _decorate(rows, user):
    """Attach preview and unread count to a page of complaints in two queries,
    rather than two queries per row."""
    if not rows:
        return rows

    ids = [row.pk for row in rows]

    previews = {
        row["complaint_id"]: row["body"]
        for row in (
            Message.objects.filter(complaint_id__in=ids)
            .readable_by(user)
            .order_by("complaint_id", "-id")
            .distinct("complaint_id")
            .values("complaint_id", "body")
        )
    }

    receipt = ReadReceipt.objects.filter(complaint=OuterRef("complaint"), user=user).values(
        "last_read_message_id"
    )[:1]
    unread = {
        row["complaint_id"]: row["n"]
        for row in (
            Message.objects.filter(complaint_id__in=ids)
            .readable_by(user)
            .exclude(sender=user)
            .annotate(last_read=Coalesce(Subquery(receipt), Value(0)))
            .filter(id__gt=F("last_read"))
            .values("complaint_id")
            .annotate(n=Count("id"))
        )
    }

    for row in rows:
        row.preview_body = previews.get(row.pk)
        row.unread_count_value = unread.get(row.pk, 0)
    return rows


class ComplaintListCreateView(APIView):
    def get(self, request):
        user = request.user
        queryset = complaints_for(user)

        status_filter = request.query_params.get("status")
        if status_filter and status_filter != "all" and status_filter in Status.values:
            queryset = queryset.filter(status=status_filter)

        search = (request.query_params.get("q") or "").strip()
        if search:
            # Message bodies are searched through readable_by so an agent can
            # never match on the text of an internal note.
            matching = (
                Message.objects.filter(body__icontains=search).readable_by(user).values("complaint_id")
            )
            queryset = queryset.filter(
                Q(subject__icontains=search)
                | Q(ticket_no__icontains=search)
                | Q(pk__in=Subquery(matching))
            )

        if user.is_admin:
            assigned = request.query_params.get("assigned_to")
            if assigned == "unassigned":
                queryset = queryset.filter(assigned_to__isnull=True)
            elif assigned and assigned.isdigit():
                queryset = queryset.filter(assigned_to__bitrix_id=int(assigned))

            author = request.query_params.get("author")
            if author and author.isdigit():
                queryset = queryset.filter(author__bitrix_id=int(author))

        paginator = PagePagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        _decorate(page, user)
        return paginator.get_paginated_response(ComplaintSummarySerializer(page, many=True).data)

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
        _decorate([complaint], request.user)
        return Response(ComplaintDetailSerializer(complaint).data, status=http.HTTP_201_CREATED)


class ComplaintDetailView(APIView):
    def get(self, request, pk):
        complaint = get_complaint_or_404(request.user, pk)
        _decorate([complaint], request.user)
        return Response(ComplaintDetailSerializer(complaint).data)

    def patch(self, request, pk):
        complaint = get_complaint_or_404(request.user, pk)

        # Only an admin moves a complaint's state. An agent reaching this for
        # their own complaint is still refused.
        if not request.user.is_admin:
            return Response({"detail": "Administrator role required."}, status=http.HTTP_403_FORBIDDEN)

        serializer = ComplaintUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "priority" in data:
            complaint.priority = data["priority"]
            complaint.save(update_fields=["priority", "updated_at"])

        if "assigned_to" in data:
            assignee = None
            if data["assigned_to"] is not None:
                assignee = get_object_or_404(AppUser, bitrix_id=data["assigned_to"])
            services.change_assignment(complaint=complaint, actor=request.user, assignee=assignee)

        if "status" in data:
            services.change_status(
                complaint=complaint,
                actor=request.user,
                to_status=data["status"],
                note=data["note"],
            )

        complaint.refresh_from_db()
        _decorate([complaint], request.user)
        return Response(ComplaintDetailSerializer(complaint).data)


class MessageListCreateView(APIView):
    def get(self, request, pk):
        complaint = get_complaint_or_404(request.user, pk)
        queryset = (
            Message.objects.filter(complaint=complaint)
            .readable_by(request.user)
            .select_related("sender")
            .prefetch_related("attachments")
        )

        after_id = request.query_params.get("after_id")
        if after_id and after_id.isdigit():
            queryset = queryset.filter(id__gt=int(after_id))

        paginator = PagePagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(MessageSerializer(page, many=True).data)

    def post(self, request, pk):
        complaint = get_complaint_or_404(request.user, pk)
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # An agent must not be able to write an internal note even by crafting
        # the request by hand.
        is_internal = bool(data["is_internal"]) and request.user.is_admin

        message = services.post_message(
            complaint=complaint,
            sender=request.user,
            body=data["body"],
            attachment_ids=data["attachment_ids"],
            is_internal=is_internal,
        )

        payload = MessageSerializer(message).data
        if data.get("client_id"):
            payload["client_id"] = data["client_id"]
        return Response(payload, status=http.HTTP_201_CREATED)


class MarkReadView(APIView):
    def post(self, request, pk):
        complaint = get_complaint_or_404(request.user, pk)
        try:
            last_id = int(request.data.get("last_read_message_id") or 0)
        except (TypeError, ValueError):
            last_id = 0

        receipt, _ = ReadReceipt.objects.get_or_create(complaint=complaint, user=request.user)
        if last_id > receipt.last_read_message_id:
            receipt.last_read_message_id = last_id
            receipt.save(update_fields=["last_read_message_id", "updated_at"])
        return Response({"ok": True})


class StatsView(APIView):
    def get(self, request):
        queryset = Complaint.objects.visible_to(request.user)
        counts = {row["status"]: row["n"] for row in queryset.values("status").annotate(n=Count("id"))}
        return Response(
            {
                "total": sum(counts.values()),
                "by_status": {value: counts.get(value, 0) for value in Status.values},
                "role": request.user.role,
            }
        )
