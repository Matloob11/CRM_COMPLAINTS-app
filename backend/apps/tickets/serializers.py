from rest_framework import serializers

from apps.accounts.serializers import ApiUserSerializer
from apps.uploads.serializers import AttachmentSerializer

from .models import Complaint, Message, Priority, Status, StatusEvent


class MessageSerializer(serializers.ModelSerializer):
    complaint_id = serializers.IntegerField(read_only=True)
    sender = ApiUserSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "complaint_id",
            "kind",
            "body",
            "is_internal",
            "sender",
            "attachments",
            "created_at",
        ]
        read_only_fields = fields


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(allow_blank=True, required=False, default="")
    attachment_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    is_internal = serializers.BooleanField(required=False, default=False)
    # Echoed back untouched so the optimistic bubble in the composer can be
    # reconciled with the server's row instead of duplicating it.
    client_id = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("body", "").strip() and not attrs.get("attachment_ids"):
            raise serializers.ValidationError("A message needs either text or an attachment.")
        return attrs


class ComplaintSummarySerializer(serializers.ModelSerializer):
    author = ApiUserSerializer(read_only=True)
    assigned_to = ApiUserSerializer(read_only=True)
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
            "updated_at",
            "resolved_at",
            "last_message_at",
            "last_message_preview",
            "unread_count",
        ]

    def get_last_message_preview(self, obj):
        # Annotated by the view so the list does not fire a query per row.
        return getattr(obj, "preview_body", None) or None

    def get_unread_count(self, obj):
        return getattr(obj, "unread_count_value", 0)


class ComplaintDetailSerializer(ComplaintSummarySerializer):
    class Meta(ComplaintSummarySerializer.Meta):
        fields = ComplaintSummarySerializer.Meta.fields + ["description"]


class ComplaintCreateSerializer(serializers.Serializer):
    """
    There is deliberately no category field: the owner rejected the idea, and
    no substitute (department, type, tag) may be introduced in its place.
    """

    subject = serializers.CharField(max_length=255)
    body = serializers.CharField(allow_blank=True, required=False, default="")
    priority = serializers.ChoiceField(choices=Priority.choices, default=Priority.NORMAL)
    attachment_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)

    def validate_subject(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Subject cannot be empty.")
        return value


class ComplaintUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Status.choices, required=False)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    priority = serializers.ChoiceField(choices=Priority.choices, required=False)
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if "status" in attrs and not attrs.get("note", "").strip():
            # A status change is the one action the agent cannot undo or argue
            # with, so it always carries a stated reason.
            raise serializers.ValidationError({"note": "A note is required when changing status."})
        if not any(key in attrs for key in ("status", "assigned_to", "priority")):
            raise serializers.ValidationError("Nothing to update.")
        return attrs


class StatusEventSerializer(serializers.ModelSerializer):
    changed_by = ApiUserSerializer(read_only=True)

    class Meta:
        model = StatusEvent
        fields = ["id", "from_status", "to_status", "changed_by", "note", "created_at"]
        read_only_fields = fields
