from rest_framework import serializers

from .models import (
    AppUser,
    Attachment,
    Complaint,
    Message,
    Priority,
    Status,
    StatusEvent,
)


class AppUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["id", "bitrix_id", "name", "email", "avatar_url", "role"]
        read_only_fields = fields


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id",
            "original_name",
            "mime",
            "size_bytes",
            "width",
            "height",
            "duration_seconds",
            "url",
        ]
        read_only_fields = fields

    def get_url(self, obj):
        return f"/api/v1/attachments/{obj.pk}"


class MessageSerializer(serializers.ModelSerializer):
    sender = AppUserSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ["id", "kind", "body", "is_internal", "sender", "attachments", "created_at"]
        read_only_fields = fields


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(allow_blank=True, required=False, default="")
    attachment_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    is_internal = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get("body", "").strip() and not attrs.get("attachment_ids"):
            raise serializers.ValidationError("A message needs either text or an attachment.")
        return attrs


class ComplaintListSerializer(serializers.ModelSerializer):
    author = AppUserSerializer(read_only=True)
    assigned_to = AppUserSerializer(read_only=True)
    last_message_preview = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = [
            "id",
            "ticket_no",
            "subject",
            "status",
            "priority",
            "author",
            "assigned_to",
            "created_at",
            "last_message_at",
            "resolved_at",
            "last_message_preview",
            "unread_count",
        ]

    def get_last_message_preview(self, obj):
        # Annotated in the view so this does not fire a query per row.
        return getattr(obj, "preview_body", "") or ""

    def get_unread_count(self, obj):
        return getattr(obj, "unread_count_value", 0)


class ComplaintDetailSerializer(ComplaintListSerializer):
    class Meta(ComplaintListSerializer.Meta):
        fields = ComplaintListSerializer.Meta.fields + ["updated_at"]


class ComplaintCreateSerializer(serializers.Serializer):
    """
    There is deliberately no category field. The owner rejected the idea, and no
    substitute (department, type, tag) may be introduced in its place.
    """

    subject = serializers.CharField(max_length=255)
    body = serializers.CharField(allow_blank=True, required=False, default="")
    priority = serializers.ChoiceField(choices=Priority.choices, default=Priority.NORMAL)
    attachment_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate_subject(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Subject cannot be empty.")
        return value


class ComplaintUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Status.choices, required=False)
    assigned_to_id = serializers.IntegerField(required=False, allow_null=True)
    priority = serializers.ChoiceField(choices=Priority.choices, required=False)
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if "status" in attrs and not attrs.get("note", "").strip():
            # A status change is the one action an agent cannot undo or argue
            # with, so it must always carry a stated reason.
            raise serializers.ValidationError({"note": "A note is required when changing status."})
        if not any(key in attrs for key in ("status", "assigned_to_id", "priority")):
            raise serializers.ValidationError("Nothing to update.")
        return attrs


class StatusEventSerializer(serializers.ModelSerializer):
    changed_by = AppUserSerializer(read_only=True)

    class Meta:
        model = StatusEvent
        fields = ["id", "from_status", "to_status", "changed_by", "note", "created_at"]
        read_only_fields = fields
