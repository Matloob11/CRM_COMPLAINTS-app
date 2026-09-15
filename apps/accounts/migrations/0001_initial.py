from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="AppUser",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("bitrix_id", models.BigIntegerField(db_index=True, unique=True)),
                ("name", models.CharField(max_length=255)),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("avatar_url", models.URLField(blank=True, default="", max_length=1000)),
                (
                    "role",
                    models.CharField(
                        choices=[("agent", "Agent"), ("admin", "Admin")],
                        default="agent",
                        max_length=16,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
    ]
