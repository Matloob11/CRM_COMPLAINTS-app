import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
        ("tickets", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Upload",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("original_name", models.CharField(max_length=512)),
                ("mime", models.CharField(default="application/octet-stream", max_length=255)),
                ("total_bytes", models.BigIntegerField()),
                ("chunk_size", models.IntegerField(default=8388608)),
                ("received_chunks", models.JSONField(default=list)),
                ("completed", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="uploads",
                        to="accounts.appuser",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="Attachment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("original_name", models.CharField(max_length=512)),
                ("stored_path", models.CharField(max_length=1024)),
                ("mime", models.CharField(default="application/octet-stream", max_length=255)),
                ("size_bytes", models.BigIntegerField(default=0)),
                ("checksum_sha256", models.CharField(blank=True, default="", max_length=64)),
                ("width", models.IntegerField(blank=True, null=True)),
                ("height", models.IntegerField(blank=True, null=True)),
                ("duration_seconds", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "message",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="tickets.message",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="attachments",
                        to="accounts.appuser",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="upload",
            index=models.Index(fields=["completed", "updated_at"], name="uploads_upl_complet_1c9a3e_idx"),
        ),
        migrations.AddIndex(
            model_name="attachment",
            index=models.Index(fields=["message"], name="uploads_att_message_7b2d41_idx"),
        ),
    ]
