from decimal import Decimal

from django.core.management.base import BaseCommand

from recipes.models import Unit

UNITS: list[dict[str, str | Decimal | None]] = [
    {
        "abbreviation": "g",
        "name_de": "Gramm",
        "name_en": "gram",
        "base_unit_abbr": None,
        "conversion_factor": Decimal("1"),
    },
    {
        "abbreviation": "kg",
        "name_de": "Kilogramm",
        "name_en": "kilogram",
        "base_unit_abbr": "g",
        "conversion_factor": Decimal("1000"),
    },
    {
        "abbreviation": "ml",
        "name_de": "Milliliter",
        "name_en": "milliliter",
        "base_unit_abbr": None,
        "conversion_factor": Decimal("1"),
    },
    {
        "abbreviation": "l",
        "name_de": "Liter",
        "name_en": "liter",
        "base_unit_abbr": "ml",
        "conversion_factor": Decimal("1000"),
    },
    {
        "abbreviation": "Stk",
        "name_de": "Stück",
        "name_en": "piece",
        "base_unit_abbr": None,
        "conversion_factor": Decimal("1"),
    },
    {
        "abbreviation": "EL",
        "name_de": "Esslöffel",
        "name_en": "tablespoon",
        "base_unit_abbr": None,
        "conversion_factor": Decimal("1"),
    },
    {
        "abbreviation": "TL",
        "name_de": "Teelöffel",
        "name_en": "teaspoon",
        "base_unit_abbr": None,
        "conversion_factor": Decimal("1"),
    },
    {
        "abbreviation": "Prise",
        "name_de": "Prise",
        "name_en": "pinch",
        "base_unit_abbr": None,
        "conversion_factor": Decimal("1"),
    },
]


class Command(BaseCommand):
    help = "Seed the database with common cooking units"

    def handle(self, *args: object, **options: object) -> None:
        # First pass: create/update all units without base_unit references
        for unit_data in UNITS:
            Unit.objects.update_or_create(
                abbreviation=unit_data["abbreviation"],
                defaults={
                    "name_de": unit_data["name_de"],
                    "name_en": unit_data["name_en"],
                    "conversion_factor": unit_data["conversion_factor"],
                },
            )

        # Second pass: set base_unit references
        for unit_data in UNITS:
            if unit_data["base_unit_abbr"]:
                unit = Unit.objects.get(abbreviation=unit_data["abbreviation"])
                unit.base_unit = Unit.objects.get(abbreviation=unit_data["base_unit_abbr"])
                unit.save(update_fields=["base_unit"])

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(UNITS)} units"))
