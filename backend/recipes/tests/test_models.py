import pytest

from recipes.models import Ingredient, Unit


@pytest.mark.django_db
def test_create_ingredient():
    ing = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    assert ing.name_en == "flour"
    assert ing.category == "PANTRY"


@pytest.mark.django_db
def test_unit_conversion():
    kg = Unit.objects.create(name_de="Kilogramm", name_en="kilogram", abbreviation="kg")
    g = Unit.objects.create(
        name_de="Gramm",
        name_en="gram",
        abbreviation="g",
        base_unit=kg,
        conversion_factor=0.001,
    )
    assert g.to_base(500) == 0.5  # 500g = 0.5kg
