from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    message = "Administrator role required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_admin)


class IsAdminForWrite(permissions.BasePermission):
    """Anyone authenticated may read; only an admin may mutate the complaint
    record itself (status, assignment, priority)."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_admin)
