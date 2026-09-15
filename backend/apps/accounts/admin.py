from django.contrib import admin

from .models import AppUser


@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = ("bitrix_id", "name", "email", "role", "is_active", "last_seen_at")
    list_filter = ("role", "is_active")
    search_fields = ("name", "email", "bitrix_id")
    # Identity is owned by Bitrix and refreshed on every open, so editing these
    # here would be silently reverted on the user's next visit.
    readonly_fields = ("bitrix_id", "name", "email", "avatar_url", "last_seen_at", "created_at")
