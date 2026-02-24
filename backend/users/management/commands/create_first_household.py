from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from users.models import Household, HouseholdMember, Invite

User = get_user_model()


class Command(BaseCommand):
    help = "Create the first household and an invite link for the first user to register."

    def add_arguments(self, parser):
        parser.add_argument("household_name", type=str, help="Name of the household")

    def handle(self, *args, **options):
        household_name = options["household_name"]

        household = Household.objects.create(name=household_name)

        # Create a system user to own the invite
        system_user, _ = User.objects.get_or_create(
            email="system@cookless.local",
            defaults={"is_active": False},
        )
        HouseholdMember.objects.create(
            household=household,
            user=system_user,
            role=HouseholdMember.Role.OWNER,
        )

        invite = Invite.objects.create(
            household=household,
            created_by=system_user,
            expires_at=timezone.now() + timedelta(days=30),
        )

        self.stdout.write(self.style.SUCCESS(f"Household '{household_name}' created."))
        self.stdout.write(self.style.SUCCESS(f"Invite code: {invite.code}"))
        self.stdout.write(self.style.SUCCESS(f"Registration URL: /invite/{invite.code}"))
