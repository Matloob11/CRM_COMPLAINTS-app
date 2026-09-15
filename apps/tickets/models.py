from django.db import connection, models
from django.utils import timezone

from apps.accounts.models import AppUser


class Status(models.TextChoices):
    OPEN = "open", "Open"
    IN_PROGRESS = "in_progress", "In Progress"
    ON_HOLD = "on_hold", "On Hold"
    RESOLVED = "resolved", "Resolved"
    REJECTED = "rejected", "Rejected"


TERMINAL_STATUSES = {Status.RESOLVED, Status.REJECTED}


class Priority(models.TextChoices):
    LOW = "low", "Low"
    NORMAL = "normal", "Normal"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class MessageKind(models.TextChoices):
    USER = "user", "User"
    SYSTEM = "system", "System"


class ComplaintQuerySet(models.QuerySet):
    def visible_to(self, user):
        """
        The single isolation rule for the whole application.

        An agent may only ever see complaints they raised. Every read path --
        list, detail, thread, attachments, stats, realtime fan-out -- goes
        through here, so the rule cannot be enforced in one endpoint and
        forgotten in another.
        """
        if user.is_admin:
            return self
        return self.filter(author=user)


class Complaint(models.Model):
    ticket_no = models.CharField(max_length=20, unique=True, editable=False)
    author = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="complaints")
    subject = models.CharField(max_length=255)

    # The opening description. Also written as the first Message so it appears
    # in the thread, but kept here too because the detail contract exposes it
    # as a first-class field and the list would otherwise need a join to show
    # a complaint that has no replies yet.
    description = models.TextField(blank=True, default="")

    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)
    assigned_to = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_complaints"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    # Denormalised deliberately: the complaint list is the hottest query in the
    # app and ordering it must not aggregate the message table on every load.
    last_message_at = models.DateTimeField(default=timezone.now, db_index=True)

    objects = ComplaintQuerySet.as_manager()

    class Meta:
        ordering = ["-last_message_at"]
        indexes = [
            models.Index(fields=["author", "-last_message_at"]),
            models.Index(fields=["status", "-last_message_at"]),
        ]

    def __str__(self):
        return f"{self.ticket_no} {self.subject}"

    def save(self, *args, **kwargs):
        if not self.ticket_no:
            self.ticket_no = self._next_ticket_no()
        super().save(*args, **kwargs)

    @staticmethod
    def _next_ticket_no():
        # A Postgres sequence, not count() + 1: two concurrent creates would
        # otherwise pick the same number and one would hit the unique
        # constraint.
        with connection.cursor() as cursor:
            cursor.execute("SELECT nextval('complaint_ticket_seq')")
            value = cursor.fetchone()[0]
        return f"CMP-{value:06d}"


class MessageQuerySet(models.QuerySet):
    def readable_by(self, user):
        """Internal notes are admin-only, everywhere, without exception."""
        if user.is_admin:
            return self
        return self.filter(is_internal=False)


class Message(models.Model):
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="messages")
    kind = models.CharField(max_length=16, choices=MessageKind.choices, default=MessageKind.USER)
    body = models.TextField(blank=True, default="")

    # An admin-only note. Must never surface to an agent through any endpoint,
    # including list previews, unread counts and search.
    is_internal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = MessageQuerySet.as_manager()

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["complaint", "id"])]

    def __str__(self):
        return f"msg#{self.pk} on complaint {self.complaint_id}"


class StatusEvent(models.Model):
    """Audit trail, kept separate from the system Message so history survives
    even if a thread is ever pruned."""

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="status_events")
    from_status = models.CharField(max_length=16, choices=Status.choices)
    to_status = models.CharField(max_length=16, choices=Status.choices)
    changed_by = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="status_changes")
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ReadReceipt(models.Model):
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="read_receipts")
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="read_receipts")
    last_read_message_id = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("complaint", "user")]
