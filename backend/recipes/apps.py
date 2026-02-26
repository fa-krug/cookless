from django.apps import AppConfig


class RecipesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "recipes"

    def ready(self):
        from django.db.models.signals import post_migrate

        post_migrate.connect(_seed_units_if_empty, sender=self)


def _seed_units_if_empty(sender, **kwargs):
    from recipes.models import Unit

    if not Unit.objects.exists():
        from django.core.management import call_command

        call_command("seed_units")
