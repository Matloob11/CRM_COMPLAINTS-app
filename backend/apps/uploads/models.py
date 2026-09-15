import uuid

from django.conf import settings
from django.db import models

from apps.accounts.models import AppUser


class Upload(models.Model):
    """
    An in-flight resumable upload.

    Chunks land in a temp directory keyed by this row's id and are assembled on
    completion. Rows abandoned longer than UPLOAD_ABANDON_HOURS are reaped by a
    periodic task together with their partial data.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="uploads")
    original_name = models.CharField(max_length=512)
    mime = models.CharField(max_length=255, default="application/octet-stream")
    total_bytes = models.BigIntegerField()
    chunk_size = models.IntegerField(default=settings.UPLOAD_CHUNK_SIZE)
    received_chunks = models.JSONField(default=list)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["completed", "updated_at"])]

    @property
    def expected_chunks(self):
        if self.total_bytes <= 0:
            return 1
        return (self.total_bytes + self.chunk_size - 1) // self.chunk_size


class Attachment(models.Model):
    """
    A stored file.

    The primary key is a UUID because the API contract types attachment ids as
    strings and because a sequential id would let someone probe for the
    existence of other people's files by counting.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Null until the message that carries it is actually sent. An upload the
    # user cancelled or abandoned in the composer stays orphaned and is reaped.
    message = models.ForeignKey(
        "tickets.Message", on_delete=models.CASCADE, related_name="attachments", null=True, blank=True
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

    class Meta:
        indexes = [models.Index(fields=["message"])]

    def __str__(self):
        return self.original_name
