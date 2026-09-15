from django.contrib import admin

from .models import Attachment, Upload


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("original_name", "mime", "size_bytes", "uploaded_by", "message", "created_at")
    list_filter = ("mime",)
    search_fields = ("original_name", "checksum_sha256")
    readonly_fields = ("id", "stored_path", "checksum_sha256", "created_at")


@admin.register(Upload)
class UploadAdmin(admin.ModelAdmin):
    list_display = ("id", "original_name", "owner", "total_bytes", "completed", "updated_at")
    list_filter = ("completed",)
    readonly_fields = ("id", "received_chunks", "created_at", "updated_at")
