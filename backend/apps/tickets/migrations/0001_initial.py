import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [("accounts", "0001_initial")]

    operations = [
        # Ticket numbers come from a sequence rather than count() + 1: two
        # concurrent creates would otherwise pick the same number and one would
        # fail the unique constraint.
        migrations.RunSQL(
            sql="CREATE SEQUENCE IF NOT EXISTS complaint_ticket_seq START WITH 1 INCREMENT BY 1;",
            reverse_sql="DROP SEQUENCE IF EXISTS complaint_ticket_seq;",
        ),
        migrations.CreateModel(
            name="Complaint",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ticket_no", models.CharField(editable=False, max_length=20, unique=True)),
                ("subject", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True, default="")),
                (
                    "priority",
                    models.CharField(
                        choices=[("low", "Low"), ("normal", "Normal"), ("high", "High"), ("urgent", "Urgent")],
                        default="normal",
                        max_length=16,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "Open"),
                            ("in_progress", "In Progress"),
                            ("on_hold", "On Hold"),
                            ("resolved", "Resolved"),
                            ("rejected", "Rejected"),
                        ],
                        db_index=True,
                        default="open",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("last_message_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                (
                    "assigned_to",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="assigned_complaints",
                        to="accounts.appuser",
                    ),
                ),
                (
                    "author",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="complaints",
                        to="accounts.appuser",
                    ),
                ),
            ],
            options={"ordering": ["-last_message_at"]},
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "kind",
                    models.CharField(
                        choices=[("user", "User"), ("system", "System")], default="user", max_length=16
                    ),
                ),
                ("body", models.TextField(blank=True, default="")),
                ("is_internal", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "complaint",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="tickets.complaint",
                    ),
                ),
                (
                    "sender",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="messages",
                        to="accounts.appuser",
                    ),
                ),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="StatusEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "from_status",
                    models.CharField(
                        choices=[
                            ("open", "Open"),
                            ("in_progress", "In Progress"),
                            ("on_hold", "On Hold"),
                            ("resolved", "Resolved"),
                            ("rejected", "Rejected"),
                        ],
                        max_length=16,
                    ),
                ),
                (
                    "to_status",
                    models.CharField(
                        choices=[
                            ("open", "Open"),
                            ("in_progress", "In Progress"),
                            ("on_hold", "On Hold"),
                            ("resolved", "Resolved"),
                            ("rejected", "Rejected"),
                        ],
                        max_length=16,
                    ),
                ),
                ("note", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "changed_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="status_changes",
                        to="accounts.appuser",
                    ),
                ),
                (
                    "complaint",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="status_events",
                        to="tickets.complaint",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="ReadReceipt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("last_read_message_id", models.BigIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "complaint",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="read_receipts",
                        to="tickets.complaint",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="read_receipts",
                        to="accounts.appuser",
                    ),
                ),
            ],
            options={"unique_together": {("complaint", "user")}},
        ),
        migrations.AddIndex(
            model_name="complaint",
            index=models.Index(fields=["author", "-last_message_at"], name="tickets_com_author__d8b1e1_idx"),
        ),
        migrations.AddIndex(
            model_name="complaint",
            index=models.Index(fields=["status", "-last_message_at"], name="tickets_com_status_2f4a77_idx"),
        ),
        migrations.AddIndex(
            model_name="message",
            index=models.Index(fields=["complaint", "id"], name="tickets_mes_complai_6c1a9b_idx"),
        ),
    ]
