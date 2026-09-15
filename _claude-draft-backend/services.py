"""Write paths that must stay consistent across every caller."""

from django.db import transaction
from django.utils import timezone

from . import events
from .models import (
    Attachment,
    Complaint,
    Message,
    MessageKind,
    Status,
    StatusEvent,
    TERMINAL_STATUSES,
)
from .tasks import notify_n8n

STATUS_LABELS = dict(Status.choices)


def _attach(message, attachment_ids, owner):
    """Bind previously uploaded attachments to a message.

    Filtered by owner and by being unattached, so one user cannot rehome
    another user's file onto their own message.
    """
    if not attachment_ids:
        return
    Attachment.objects.filter(
        pk__in=attachment_ids, uploaded_by=owner, message__isnull=True
    ).update(message=message)


@transaction.atomic
def create_complaint(*, author, subject, body, priority, attachment_ids):
    complaint = Complaint.objects.create(
        author=author,
        subject=subject,
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

    transaction.on_commit(
        lambda: events.publish(
            "complaint.created",
            {"complaint_id": complaint.pk, "ticket_no": complaint.ticket_no},
            author_bitrix_id=author.bitrix_id,
        )
    )
    transaction.on_commit(
        lambda: notify_n8n.delay(
            "complaint.created",
            {
                "complaint_id": complaint.pk,
                "ticket_no": complaint.ticket_no,
                "subject": complaint.subject,
                "priority": complaint.priority,
                "author": {"bitrix_id": author.bitrix_id, "name": author.name},
            },
        )
    )
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

    # An internal note is invisible to the agent, so it must not bump the
    # thread's activity timestamp -- that would surface an unexplained
    # "something changed" in the agent's list.
    if not is_internal:
        Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)
        complaint.last_message_at = message.created_at

        transaction.on_commit(
            lambda: events.publish(
                "message.created",
                {"complaint_id": complaint.pk, "message_id": message.pk},
                author_bitrix_id=complaint.author.bitrix_id,
            )
        )
        if sender.is_admin:
            transaction.on_commit(
                lambda: notify_n8n.delay(
                    "complaint.admin_replied",
                    {
                        "complaint_id": complaint.pk,
                        "ticket_no": complaint.ticket_no,
                        "author": {
                            "bitrix_id": complaint.author.bitrix_id,
                            "name": complaint.author.name,
                        },
                    },
                )
            )
    return message


@transaction.atomic
def change_status(*, complaint, actor, to_status, note):
    """
    A status change writes three things atomically: the complaint row, the
    audit event, and a system message so the change is visible inline in the
    thread the way WhatsApp shows membership changes. Splitting these would let
    the thread and the audit trail disagree.
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

    system_body = (
        f"Status changed from {STATUS_LABELS[from_status]} to {STATUS_LABELS[to_status]} "
        f"by {actor.name}"
    )
    if note.strip():
        system_body += f" — {note.strip()}"

    message = Message.objects.create(
        complaint=complaint,
        sender=actor,
        kind=MessageKind.SYSTEM,
        body=system_body,
    )
    Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)

    transaction.on_commit(
        lambda: events.publish(
            "complaint.status_changed",
            {"complaint_id": complaint.pk, "status": to_status},
            author_bitrix_id=complaint.author.bitrix_id,
        )
    )
    transaction.on_commit(
        lambda: notify_n8n.delay(
            "complaint.status_changed",
            {
                "complaint_id": complaint.pk,
                "ticket_no": complaint.ticket_no,
                "from_status": from_status,
                "to_status": to_status,
                "note": note,
                "author": {
                    "bitrix_id": complaint.author.bitrix_id,
                    "name": complaint.author.name,
                },
            },
        )
    )
    return message


@transaction.atomic
def change_assignment(*, complaint, actor, assignee):
    previous = complaint.assigned_to
    if previous == assignee:
        return None

    complaint.assigned_to = assignee
    complaint.save(update_fields=["assigned_to", "updated_at"])

    if assignee is None:
        body = f"Unassigned by {actor.name}"
    else:
        body = f"Assigned to {assignee.name} by {actor.name}"

    message = Message.objects.create(
        complaint=complaint,
        sender=actor,
        kind=MessageKind.SYSTEM,
        body=body,
    )
    Complaint.objects.filter(pk=complaint.pk).update(last_message_at=message.created_at)

    transaction.on_commit(
        lambda: events.publish(
            "complaint.assigned",
            {"complaint_id": complaint.pk, "assigned_to": assignee.pk if assignee else None},
            author_bitrix_id=complaint.author.bitrix_id,
        )
    )
    return message
