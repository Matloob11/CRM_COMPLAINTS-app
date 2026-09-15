from django.contrib import admin

from .models import Complaint, Message, ReadReceipt, StatusEvent


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ("ticket_no", "subject", "author", "status", "priority", "assigned_to", "last_message_at")
    list_filter = ("status", "priority")
    search_fields = ("ticket_no", "subject", "description")
    readonly_fields = ("ticket_no", "created_at", "updated_at", "last_message_at")
    autocomplete_fields = ("author", "assigned_to")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "complaint", "sender", "kind", "is_internal", "created_at")
    list_filter = ("kind", "is_internal")
    search_fields = ("body",)
    readonly_fields = ("created_at",)


@admin.register(StatusEvent)
class StatusEventAdmin(admin.ModelAdmin):
    list_display = ("complaint", "from_status", "to_status", "changed_by", "created_at")
    list_filter = ("to_status",)
    readonly_fields = ("created_at",)


@admin.register(ReadReceipt)
class ReadReceiptAdmin(admin.ModelAdmin):
    list_display = ("complaint", "user", "last_read_message_id", "updated_at")
