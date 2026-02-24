from decimal import Decimal

from django.core.management import call_command

import pytest

from recipes.models import Unit


@pytest.mark.django_db
def test_seed_units_creates_all_units():
    call_command("seed_units")
    assert Unit.objects.count() == 8


@pytest.mark.django_db
def test_seed_units_is_idempotent():
    call_command("seed_units")
    call_command("seed_units")
    assert Unit.objects.count() == 8


@pytest.mark.django_db
def test_seed_units_sets_base_unit_for_kg():
    call_command("seed_units")
    kg = Unit.objects.get(abbreviation="kg")
    assert kg.base_unit is not None
    assert kg.base_unit.abbreviation == "g"
    assert kg.conversion_factor == Decimal("1000")


@pytest.mark.django_db
def test_seed_units_sets_base_unit_for_liter():
    call_command("seed_units")
    liter = Unit.objects.get(abbreviation="l")
    assert liter.base_unit is not None
    assert liter.base_unit.abbreviation == "ml"
    assert liter.conversion_factor == Decimal("1000")


@pytest.mark.django_db
def test_seed_units_standalone_units_have_no_base():
    call_command("seed_units")
    for abbr in ("g", "ml", "Stk", "EL", "TL", "Prise"):
        unit = Unit.objects.get(abbreviation=abbr)
        assert unit.base_unit is None, f"{abbr} should have no base_unit"


@pytest.mark.django_db
def test_seed_units_bilingual_names():
    call_command("seed_units")
    el = Unit.objects.get(abbreviation="EL")
    assert el.name_de == "Esslöffel"
    assert el.name_en == "tablespoon"
