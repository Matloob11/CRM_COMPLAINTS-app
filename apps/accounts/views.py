from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tickets.permissions import IsAdmin

from .models import AppUser, Role
from .serializers import ApiUserSerializer


class MeView(APIView):
    def get(self, request):
        user = request.user
        AppUser.objects.filter(pk=user.pk).update(last_seen_at=timezone.now())
        return Response(
            {
                "user": ApiUserSerializer(user).data,
                "role": user.role,
                "server_time": timezone.now().isoformat(),
            }
        )


class UserListView(APIView):
    """
    Assignee picker.

    Admin-only: an agent has no assignee dropdown, and must not be able to
    enumerate colleagues through this app either.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = AppUser.objects.filter(is_active=True)

        role = request.query_params.get("role")
        if role in Role.values:
            queryset = queryset.filter(role=role)

        results = ApiUserSerializer(queryset, many=True).data
        return Response(
            {
                "results": results,
                "count": len(results),
                "next": None,
                "previous": None,
                "role": request.user.role,
            }
        )
