from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    message = "Administrator role required."

    def has_permission(self, request, view):
        return bool(request.user and getattr(request.user, "is_admin", False))
