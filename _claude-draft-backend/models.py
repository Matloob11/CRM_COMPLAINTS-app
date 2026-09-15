from django.conf import settings
from django.db import connection, models
from django.utils import timezone


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


class Role(models.TextChoices):
    AGENT = "agent", "Agent"
    ADMIN = "admin", "Admin"


class AppUser(models.Model):
    """
    A CRM user, mirrored locally.

    Not Django's auth user. Identity is owned by Bitrix24: this row is a cache
    of what `user.current` returned, refreshed on every iframe open. Nothing
    here is ever populated from client input.
    """

    bitrix_id = models.BigIntegerField(unique=True, db_index=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    avatar_url = models.URLField(blank=True, default="", max_length=1000)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.AGENT)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} (#{self.bitrix_id})"

    @property
    def is_admin(self):
        return self.role == Role.ADMIN

    # DRF's IsAuthenticated permission checks these two attributes on
    # request.user. AppUser stands in for a Django auth user.
    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False


class ComplaintQuerySet(models.QuerySet):
    def visible_to(self, user):
        """
        The single isolation rule for the whole application.

        An agent may only ever see complaints they raised. Everything that
        reads complaints -- list, retrieve, message threads, attachments,
        stats, SSE fan-out -- funnels through here, so the rule cannot be
        forgotten in one endpoint and enforced in another.
        """
        if user.is_admin:
            return self
        return self.filter(author=user)


class Complaint(models.Model):
    ticket_no = models.CharField(max_length=20, unique=True, editable=False)
    author = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="complaints")
    subject = models.CharField(max_length=255)
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)
    assigned_to = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_complaints"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    # Denormalised on purpose. The complaint list is the hottest query in the
    # app; ordering it must not aggregate over the message table every time.
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
        # otherwise race to the same number and one would fail the unique
        # constraint.
        with connection.cursor() as cursor:
            cursor.execute("SELECT nextval('complaint_ticket_seq')")
            value = cursor.fetchone()[0]
        return f"CMP-{value:06d}"


class MessageKind(models.TextChoices):
    USER = "user", "User"
    SYSTEM = "system", "System"


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

    # Admin-only note. Must never surface to an agent through any endpoint,
    # including list previews, unread counts and search.
    is_internal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = MessageQuerySet.as_manager()

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["complaint", "id"])]

    def __str__(self):
        return f"msg#{self.pk} on {self.complaint_id}"


class Attachment(models.Model):
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="attachments", null=True, blank=True
    )
    uploaded_by = models.ForeignKey(AppUser, on_delete=models.PROTECT, related_name="attachments")
    original_name = models.CharField(max_length=512)
    stored_path = models.CharField(max_length=1024)
    mime = models.CharField(max_length=255, default="application/octet-stream")
    size_bytes = models.BigIntegerField(default=0)
    checksum_sha256 = models.CharField(max_length=64, blank=True, default="")
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_name

    @property
    def is_orphan(self):
        """Uploaded but never attached to a sent message."""
        return self.message_id is None


class StatusEvent(models.Model):
    """Audit trail. Kept separate from the system Message so that history
    survives even if a thread is ever pruned."""

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


class Upload(models.Model):
    """
    An in-flight resumable upload.

    Chunks land in a temp directory keyed by this row's id and are assembled on
    completion. Rows abandoned for longer than COMPLAINTS_UPLOAD_ABANDON_HOURS
    are reaped by a periodic task along with their partial data.
    """

    id = models.UUIDField(primary_key=True)
    owner = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="uploads")
    original_name = models.CharField(max_length=512)
    mime = models.CharField(max_length=255, default="application/octet-stream")
    total_bytes = models.BigIntegerField()
    chunk_size = models.IntegerField(default=settings.UPLOAD_CHUNK_SIZE)
    received_chunks = models.JSONField(default=list)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def expected_chunks(self):
        if self.total_bytes == 0:
            return 1
        return (self.total_bytes + self.chunk_size - 1) // self.chunk_size
