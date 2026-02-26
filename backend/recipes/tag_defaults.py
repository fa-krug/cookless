from __future__ import annotations

from typing import TYPE_CHECKING

from recipes.models import Tag, TagCategory

if TYPE_CHECKING:
    from users.models import Household

DEFAULT_TAGS: dict[str, list[tuple[str, str]]] = {
    TagCategory.DIETARY: [
        ("Vegan", "Vegan"),
        ("Vegetarian", "Vegetarisch"),
        ("Kosher", "Koscher"),
        ("Halal", "Halal"),
        ("Gluten-Free", "Glutenfrei"),
        ("Dairy-Free", "Laktosefrei"),
        ("Low-Carb", "Low-Carb"),
        ("Nut-Free", "Nussfrei"),
        ("Whole30", "Whole30"),
        ("Paleo", "Paleo"),
    ],
    TagCategory.PROTEIN: [
        ("Pork", "Schwein"),
        ("Beef", "Rind"),
        ("Chicken", "Hähnchen"),
        ("Duck", "Ente"),
        ("Turkey", "Truthahn"),
        ("Fish", "Fisch"),
        ("Seafood", "Meeresfrüchte"),
        ("Tofu", "Tofu"),
        ("Egg", "Ei"),
    ],
    TagCategory.CUISINE: [
        ("Italian", "Italienisch"),
        ("Asian", "Asiatisch"),
        ("Mexican", "Mexikanisch"),
        ("Indian", "Indisch"),
        ("Mediterranean", "Mediterran"),
        ("German", "Deutsch"),
        ("American", "Amerikanisch"),
        ("French", "Französisch"),
        ("Middle Eastern", "Nahöstlich"),
        ("Thai", "Thailändisch"),
    ],
    TagCategory.MEAL_TYPE: [
        ("Quick Weeknight", "Schnelles Abendessen"),
        ("One-Pot", "Eintopf"),
        ("Meal-Prep", "Meal-Prep"),
        ("Comfort Food", "Comfort Food"),
        ("Simple", "Einfach"),
        ("Elaborate", "Aufwändig"),
        ("Grilling", "Grillen"),
        ("Salad", "Salat"),
    ],
}


def seed_default_tags(household: Household) -> None:
    """Seed default tags for a household. Idempotent -- skips existing tags."""
    existing = set(Tag.objects.filter(household=household).values_list("category", "name_en"))
    tags_to_create = []
    for category, tag_list in DEFAULT_TAGS.items():
        for name_en, name_de in tag_list:
            if (category, name_en) not in existing:
                tags_to_create.append(
                    Tag(
                        household=household,
                        category=category,
                        name_en=name_en,
                        name_de=name_de,
                        is_default=True,
                    )
                )
    Tag.objects.bulk_create(tags_to_create)
