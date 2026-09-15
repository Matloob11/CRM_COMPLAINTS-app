from rest_framework import serializers

from .models import Attachment


class AttachmentSerializer(serializers.ModelSerializer):
    """Matches the `Attachment` interface in the frontend's api/types.ts."""

    id = serializers.UUIDField(format="hex_verbose", read_only=True)
    duration = serializers.FloatField(source="duration_seconds", read_only=True)
    url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id",
            "original_name",
            "mime",
            "size_bytes",
            "width",
            "height",
            "duration",
            "url",
            "thumbnail_url",
        ]
        read_only_fields = fields

    def get_url(self, obj):
        return f"/api/v1/attachments/{obj.pk}"

    def get_thumbnail_url(self, obj):
        # No separate thumbnail pipeline: generating one for a multi-gigabyte
        # video would cost CPU this box does not have spare. Images are their
        # own thumbnail; the UI scales them down.
        if obj.mime.startswith("image/"):
            return f"/api/v1/attachments/{obj.pk}"
        return None
