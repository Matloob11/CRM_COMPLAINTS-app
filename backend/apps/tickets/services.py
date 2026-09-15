"""Write paths that must behave identically no matter which endpoint calls them."""

from django.db import transaction
from django.utils import timezone

from apps.notifications.tasks import notify_n8n
from apps.realtime import events
from apps.uploads.models import Attachment

from .models import (
    Complaint,
    Message,
    MessageKind,
    Status,
    StatusEvent,
    TERMINAL_STATUSES,
)

STATUS_LABELS = dict(Status.choices)


def _attach(message, attachment_ids, owner):
    """
    Bind previously uploaded files to a message.

    Filtered by owner and by being unattached, so a caller cannot rehome
    somebody else's file onto their own message by guessing an id.
    """
    if not attachment_ids:
        return
    Attachment.objects.filter(
        pk__in=attachment_ids, uploaded_by=owner, message__isnull=True
    ).update(message=message)


def _summary(complaint):
    """Serialised complaint for realtime payloads, built lazily to avoid an
    import cycle between services and serializers."""
    from .serializers import ComplaintSummarySerializer

    complaint.preview_body = None
    complaint.unread_count_value = 0
    return ComplaintSummarySerializer(complaint).data


def _message_payload(message):
    from .serializers import MessageSerializer

    return MessageSerializer(message).data


@transaction.atomic
def create_complaint(*, author, subject, body, priority, attachment_ids):
    complaint = Complaint.objects.create(
        author=author,
        subject=subject,
        description=body or "",
        priority=priority,
        status=Status.OPEN,
        last_message_at=timezone.now(),
    )
    message = Message.objects.create(
        complaint=complaint,
        sender=author,
        kind=MessageKind.USER,
        body=body or "",
    )
    _attach(message, attachment_ids, author)
    Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)
    complaint.last_message_at = message.created_at

    def announce():
        events.publish("complaint.created", {"complaint": _summary(complaint)}, complaint=complaint)
        notify_n8n.delay(
            "complaint.created",
            {
                "complaint_id": complaint.pk,
                "ticket_no": complaint.ticket_no,
                "subject": complaint.subject,
                "priority": complaint.priority,
                "author": {"bitrix_id": author.bitrix_id, "name": author.name},
            },
        )

    transaction.on_commit(announce)
    return complaint, message


@transaction.atomic
def post_message(*, complaint, sender, body, attachment_ids, is_internal):
    message = Message.objects.create(
        complaint=complaint,
        sender=sender,
        kind=MessageKind.USER,
        body=body or "",
        is_internal=is_internal,
    )
    _attach(message, attachment_ids, sender)

    if is_internal:
        # An internal note is invisible to the agent, so it must not bump the
        # thread's activity timestamp: that would show the agent an
        # unexplained "something changed" they cannot open.
        return message

    Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)
    complaint.last_message_at = message.created_at

    def announce():
        events.publish(
            "message.created",
            {"complaint_id": complaint.pk, "message": _message_payload(message)},
            complaint=complaint,
        )
        if sender.is_admin:
            notify_n8n.delay(
                "complaint.admin_replied",
                {
                    "complaint_id": complaint.pk,
                    "ticket_no": complaint.ticket_no,
                    "author": {"bitrix_id": complaint.author.bitrix_id, "name": complaint.author.name},
                },
            )

    transaction.on_commit(announce)
    return message


@transaction.atomic
def change_status(*, complaint, actor, to_status, note):
    """
    Move a complaint's state.

    Writes three things in one transaction: the complaint row, the audit event,
    and a system message so the change shows inline in the thread the way
    WhatsApp shows membership changes. Splitting them would let the visible
    thread and the audit trail disagree.
    """
    from_status = complaint.status
    if from_status == to_status:
        return None

    complaint.status = to_status
    complaint.resolved_at = timezone.now() if to_status in TERMINAL_STATUSES else None
    complaint.save(update_fields=["status", "resolved_at", "updated_at"])

    StatusEvent.objects.create(
        complaint=complaint,
        from_status=from_status,
        to_status=to_status,
        changed_by=actor,
        note=note,
    )

    body = (
        f"Status changed from {STATUS_LABELS[from_status]} to {STATUS_LABELS[to_status]} by {actor.name}"
    )
    if note.strip():
        body += f" — {note.strip()}"

    message = Message.objects.create(
        complaint=complaint, sender=actor, kind=MessageKind.SYSTEM, body=body
    )
    Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)
    complaint.last_message_at = message.created_at

    def announce():
        events.publish("complaint.updated", {"complaint": _summary(complaint)}, complaint=complaint)
        events.publish(
            "message.created",
            {"complaint_id": complaint.pk, "message": _message_payload(message)},
            complaint=complaint,
        )
        notify_n8n.delay(
            "complaint.status_changed",
            {
                "complaint_id": complaint.pk,
                "ticket_no": complaint.ticket_no,
                "from_status": from_status,
                "to_status": to_status,
                "note": note,
                "author": {"bitrix_id": complaint.author.bitrix_id, "name": complaint.author.name},
            },
        )

    transaction.on_commit(announce)
    return message


@transaction.atomic
def change_assignment(*, complaint, actor, assignee):
    if complaint.assigned_to_id == (assignee.pk if assignee else None):
        return None

    complaint.assigned_to = assignee
    complaint.save(update_fields=["assigned_to", "updated_at"])

    body = f"Assigned to {assignee.name} by {actor.name}" if assignee else f"Unassigned by {actor.name}"
    message = Message.objects.create(
        complaint=complaint, sender=actor, kind=MessageKind.SYSTEM, body=body
    )
    Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)
    complaint.last_message_at = message.created_at

    def announce():
        events.publish("complaint.updated", {"complaint": _summary(complaint)}, complaint=complaint)
        events.publish(
            "message.created",
            {"complaint_id": complaint.pk, "message": _message_payload(message)},
            complaint=complaint,
        )

    transaction.on_commit(announce)
    return message
