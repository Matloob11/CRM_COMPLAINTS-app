from django.contrib import admin
from django.urls import path
from django.utils import timezone
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import bitrix_views
from apps.accounts.views import MeView, UserListView
from apps.realtime.views import EventStreamView
from apps.tickets.views import (
    ComplaintDetailView,
    ComplaintListCreateView,
    MarkReadView,
    MessageListCreateView,
    StatsView,
)
from apps.uploads.views import (
    AttachmentDownloadView,
    UploadChunkView,
    UploadCompleteView,
    UploadInitView,
)


class HealthView(APIView):
    """Unauthenticated on purpose: the container healthcheck calls it."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response(
            {"status": "healthy", "service": "a7-complaints-web", "time": timezone.now().isoformat()}
        )


api = "api/v1"

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("healthz", HealthView.as_view()),
    # Called by Bitrix itself, not by the SPA.
    path("bitrix/install/", bitrix_views.install),
    path("bitrix/handler/", bitrix_views.handler),
    # SPA API.
    path(f"{api}/me", MeView.as_view()),
    path(f"{api}/stats", StatsView.as_view()),
    path(f"{api}/users", UserListView.as_view()),
    path(f"{api}/complaints", ComplaintListCreateView.as_view()),
    path(f"{api}/complaints/<int:pk>", ComplaintDetailView.as_view()),
    path(f"{api}/complaints/<int:pk>/messages", MessageListCreateView.as_view()),
    path(f"{api}/complaints/<int:pk>/read", MarkReadView.as_view()),
    path(f"{api}/events", EventStreamView.as_view()),
    path(f"{api}/uploads/init", UploadInitView.as_view()),
    path(f"{api}/uploads/<uuid:upload_id>/chunk/<int:index>", UploadChunkView.as_view()),
    path(f"{api}/uploads/<uuid:upload_id>/complete", UploadCompleteView.as_view()),
    path(f"{api}/attachments/<uuid:pk>", AttachmentDownloadView.as_view()),
    # Schema, for the frontend contract.
    path(f"{api}/schema", SpectacularAPIView.as_view(), name="schema"),
    path(f"{api}/docs", SpectacularSwaggerView.as_view(url_name="schema")),
]
