from django.core.management.base import BaseCommand

from recipes.tag_defaults import seed_default_tags
from users.models import Household


class Command(BaseCommand):
    help = "Seed default tags for all households that don't have them yet"

    def handle(self, *args, **options):
        for household in Household.objects.all():
            seed_default_tags(household)
            self.stdout.write(f"Seeded tags for {household.name}")
        self.stdout.write(self.style.SUCCESS("Done"))
