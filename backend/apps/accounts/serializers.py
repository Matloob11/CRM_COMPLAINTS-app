from rest_framework import serializers

from .models import AppUser


class ApiUserSerializer(serializers.ModelSerializer):
    """Matches the `ApiUser` interface in the frontend's api/types.ts."""

    email = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = AppUser
        fields = ["bitrix_id", "name", "email", "avatar_url", "role"]
        read_only_fields = fields

    def get_email(self, obj):
        # The contract types these as nullable; empty string would render as a
        # blank line in the UI rather than being skipped.
        return obj.email or None

    def get_avatar_url(self, obj):
        return obj.avatar_url or None
