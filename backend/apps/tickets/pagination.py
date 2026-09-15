from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PagePagination(PageNumberPagination):
    """
    DRF page-number pagination plus the caller's effective role.

    The frontend's `Paginated<T>` expects `role` on every list response so the
    UI never has to guess what it may render. Echoing it here means one place
    produces it rather than each view remembering to.
    """

    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        user = getattr(self.request, "user", None)
        return Response(
            {
                "results": data,
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "role": getattr(user, "role", "agent"),
            }
        )
