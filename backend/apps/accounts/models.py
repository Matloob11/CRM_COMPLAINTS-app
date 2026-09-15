from django.conf import settings
from django.db import models


class Role(models.TextChoices):
    AGENT = "agent", "Agent"
    ADMIN = "admin", "Admin"


class AppUser(models.Model):
    """
    A CRM user, mirrored locally.

    Not Django's auth user. Identity is owned by Bitrix24; this row caches what
    `user.current` returned and is refreshed on every iframe open. No field
    here is ever populated from client input, so a caller cannot rename
    themselves or grant themselves a role.
    """

    bitrix_id = models.BigIntegerField(unique=True, db_index=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    avatar_url = models.URLField(blank=True, default="", max_length=1000)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.AGENT)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} (#{self.bitrix_id})"

    @property
    def is_admin(self):
        return self.role == Role.ADMIN

    # DRF's IsAuthenticated inspects these on request.user. AppUser stands in
    # for a Django auth user without dragging in the auth tables.
    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @staticmethod
    def role_for(bitrix_id):
        """
        Resolve a role from the configured allowlist.

        A Bitrix portal administrator who is not on the allowlist stays an
        agent: portal-admin and complaints-admin are different jobs, and the
        business named exactly one person for the latter.
        """
        return Role.ADMIN if int(bitrix_id) in settings.ADMIN_BITRIX_IDS else Role.AGENT
