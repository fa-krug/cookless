# Recipe Tagging System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a household-scoped tagging system with 4 fixed categories so recipes can be filtered by tags and meal plan generation can exclude tagged recipes.

**Architecture:** New `Tag` model in the recipes app with M2M to Recipe. M2M `excluded_tags` on MealPlan. Default tags seeded on household creation. Tag CRUD API + recipe/plan API extensions. Frontend: filter dropdowns on recipe list, tag selectors on recipe form, exclusion checkboxes on plan drawer, tag management in settings.

**Tech Stack:** Django 6.0, Django Ninja, React 19, TanStack React Query, Tailwind CSS 4, react-i18next

---

### Task 1: Tag Model and Migration

**Files:**
- Modify: `backend/recipes/models.py:49` (add Tag model before Recipe)
- Modify: `backend/recipes/models.py:64` (add M2M field to Recipe)
- Modify: `backend/planner/models.py:6-33` (add excluded_tags M2M to MealPlan)

**Step 1: Write the Tag model and update Recipe + MealPlan**

Add to `backend/recipes/models.py` before the `Recipe` class:

```python
class TagCategory(models.TextChoices):
    DIETARY = "DIETARY", "Dietary"
    PROTEIN = "PROTEIN", "Protein"
    CUISINE = "CUISINE", "Cuisine"
    MEAL_TYPE = "MEAL_TYPE", "Meal Type"


class Tag(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(
        "users.Household", on_delete=models.CASCADE, related_name="tags"
    )
    category = models.CharField(max_length=20, choices=TagCategory.choices)
    name_en = models.CharField(max_length=60)
    name_de = models.CharField(max_length=60)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["category", "name_en"]
        constraints = [
            models.UniqueConstraint(
                fields=["household", "category", "name_en"],
                name="unique_tag_per_household_category",
            )
        ]

    def __str__(self) -> str:
        return f"{self.category}: {self.name_en}"
```

Add M2M to `Recipe` (after `updated_at`):

```python
tags = models.ManyToManyField("Tag", blank=True, related_name="recipes")
```

Add M2M to `MealPlan` in `backend/planner/models.py` (after `created_at`):

```python
excluded_tags = models.ManyToManyField(
    "recipes.Tag", blank=True, related_name="+"
)
```

**Step 2: Generate and apply migration**

Run:
```bash
cd backend && python manage.py makemigrations recipes planner
cd backend && python manage.py migrate
```

**Step 3: Commit**

```bash
git add backend/recipes/models.py backend/planner/models.py backend/recipes/migrations/ backend/planner/migrations/
git commit -m "feat: add Tag model with Recipe and MealPlan M2M fields"
```

---

### Task 2: Default Tags Constants and Seeding

**Files:**
- Create: `backend/recipes/tag_defaults.py`
- Modify: `backend/users/api.py:163-174` (seed tags on household creation)

**Step 1: Write the failing test**

Create `backend/recipes/tests/test_tags.py`:

```python
import pytest

from recipes.models import Tag, TagCategory
from recipes.tag_defaults import seed_default_tags
from users.models import Household


@pytest.mark.django_db
def test_seed_default_tags_creates_tags():
    household = Household.objects.create(name="Test")
    seed_default_tags(household)
    tags = Tag.objects.filter(household=household)
    assert tags.count() == 37
    assert tags.filter(category=TagCategory.DIETARY).count() == 10
    assert tags.filter(category=TagCategory.PROTEIN).count() == 9
    assert tags.filter(category=TagCategory.CUISINE).count() == 10
    assert tags.filter(category=TagCategory.MEAL_TYPE).count() == 8
    assert all(t.is_default for t in tags)


@pytest.mark.django_db
def test_seed_default_tags_is_idempotent():
    household = Household.objects.create(name="Test")
    seed_default_tags(household)
    seed_default_tags(household)
    assert Tag.objects.filter(household=household).count() == 37
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: FAIL (ImportError -- `tag_defaults` does not exist)

**Step 3: Write the constants and seeding function**

Create `backend/recipes/tag_defaults.py`:

```python
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
    existing = set(
        Tag.objects.filter(household=household).values_list("category", "name_en")
    )
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
```

**Step 4: Run test to verify it passes**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: PASS

**Step 5: Integrate seeding into household creation**

Modify `backend/users/api.py` -- in the `create_household` function (around line 164), after `Household.objects.create(...)`, add:

```python
from recipes.tag_defaults import seed_default_tags
```

(Add import at top of file)

After `household = Household.objects.create(name=payload.name)` add:

```python
seed_default_tags(household)
```

**Step 6: Write test for household creation seeding**

Add to `backend/recipes/tests/test_tags.py`:

```python
import json

from django.contrib.auth import get_user_model
from django.test import Client

from users.models import HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client_no_household():
    user = User.objects.create_user(email="test@example.com")
    user.onboarding_step = "CREATE_HOUSEHOLD"
    user.save()
    client = Client()
    client.force_login(user)
    return client, user


@pytest.mark.django_db
def test_create_household_seeds_default_tags(auth_client_no_household):
    client, user = auth_client_no_household
    response = client.post(
        "/api/v1/households/",
        json.dumps({"name": "My Home"}),
        content_type="application/json",
    )
    assert response.status_code == 201
    household_id = response.json()["id"]
    assert Tag.objects.filter(household_id=household_id).count() == 37
```

**Step 7: Run all tag tests**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: All PASS

**Step 8: Commit**

```bash
git add backend/recipes/tag_defaults.py backend/recipes/tests/test_tags.py backend/users/api.py
git commit -m "feat: add default tag constants and seed on household creation"
```

---

### Task 3: Tag CRUD API

**Files:**
- Create: `backend/recipes/tag_schemas.py`
- Modify: `backend/recipes/api.py` (add tag endpoints)
- Modify: `backend/cookless/api.py` (register tag router if separate, or add to recipes router)
- Test: `backend/recipes/tests/test_tags.py`

**Step 1: Write the failing tests**

Add to `backend/recipes/tests/test_tags.py`:

```python
@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="tag@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    seed_default_tags(household)
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_list_tags_grouped_by_category(auth_client):
    client, household = auth_client
    response = client.get("/api/v1/tags/")
    assert response.status_code == 200
    data = response.json()
    assert "DIETARY" in data
    assert "PROTEIN" in data
    assert "CUISINE" in data
    assert "MEAL_TYPE" in data
    assert len(data["DIETARY"]) == 10


@pytest.mark.django_db
def test_create_custom_tag(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/tags/",
        json.dumps({
            "category": "CUISINE",
            "name_en": "Korean",
            "name_de": "Koreanisch",
        }),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name_en"] == "Korean"
    assert data["is_default"] is False


@pytest.mark.django_db
def test_update_tag(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    response = client.put(
        f"/api/v1/tags/{tag.id}/",
        json.dumps({"name_en": "Strict Vegan", "name_de": "Streng Vegan"}),
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json()["name_en"] == "Strict Vegan"


@pytest.mark.django_db
def test_delete_tag(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Paleo").first()
    response = client.delete(f"/api/v1/tags/{tag.id}/")
    assert response.status_code == 204
    assert not Tag.objects.filter(id=tag.id).exists()


@pytest.mark.django_db
def test_delete_tag_removes_from_recipes(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    recipe = Recipe.objects.create(
        household=household, title="Salad", list_type="KNOWN", default_servings=2
    )
    recipe.tags.add(tag)
    response = client.delete(f"/api/v1/tags/{tag.id}/")
    assert response.status_code == 204
    assert recipe.tags.count() == 0


@pytest.mark.django_db
def test_cannot_access_other_household_tags(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    seed_default_tags(other_household)
    other_tag = Tag.objects.filter(household=other_household).first()
    response = client.delete(f"/api/v1/tags/{other_tag.id}/")
    assert response.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_tags.py::test_list_tags_grouped_by_category -v`
Expected: FAIL (404 -- endpoint doesn't exist)

**Step 3: Write tag schemas**

Create `backend/recipes/tag_schemas.py`:

```python
from uuid import UUID

from ninja import Schema


class TagOut(Schema):
    id: UUID
    category: str
    name_en: str
    name_de: str
    is_default: bool


class TagCreateIn(Schema):
    category: str
    name_en: str
    name_de: str


class TagUpdateIn(Schema):
    name_en: str
    name_de: str


class GroupedTagsOut(Schema):
    DIETARY: list[TagOut] = []
    PROTEIN: list[TagOut] = []
    CUISINE: list[TagOut] = []
    MEAL_TYPE: list[TagOut] = []
```

**Step 4: Write tag API endpoints**

Add to `backend/recipes/api.py`. Add imports at top:

```python
from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Tag, TagCategory, Unit
from recipes.tag_schemas import GroupedTagsOut, TagCreateIn, TagOut, TagUpdateIn
```

Add endpoints after the existing recipe/ingredient/unit endpoints:

```python
# ── Tags ────────────────────────────────────────────────────────────


@router.get("/tags/", response=GroupedTagsOut, tags=["tags"])
def list_tags(request):
    require_household_member(request)
    tags = Tag.objects.filter(household=request.user.active_household)
    grouped = {cat.value: [] for cat in TagCategory}
    for tag in tags:
        grouped[tag.category].append(tag)
    return grouped


@router.post("/tags/", response={201: TagOut}, tags=["tags"])
def create_tag(request, payload: TagCreateIn):
    require_household_member(request)
    tag = Tag.objects.create(
        household=request.user.active_household,
        category=payload.category,
        name_en=payload.name_en,
        name_de=payload.name_de,
        is_default=False,
    )
    return 201, tag


@router.put("/tags/{tag_id}/", response=TagOut, tags=["tags"])
def update_tag(request, tag_id: UUID, payload: TagUpdateIn):
    require_household_member(request)
    tag = get_object_or_404(Tag, pk=tag_id, household=request.user.active_household)
    tag.name_en = payload.name_en
    tag.name_de = payload.name_de
    tag.save()
    return tag


@router.delete("/tags/{tag_id}/", response={204: None}, tags=["tags"])
def delete_tag(request, tag_id: UUID):
    require_household_member(request)
    tag = get_object_or_404(Tag, pk=tag_id, household=request.user.active_household)
    tag.delete()
    return None
```

**Step 5: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/recipes/tag_schemas.py backend/recipes/api.py backend/recipes/tests/test_tags.py
git commit -m "feat: add tag CRUD API endpoints"
```

---

### Task 4: Recipe API Tag Integration

**Files:**
- Modify: `backend/recipes/schemas.py` (add tags to RecipeListOut, RecipeOut, RecipeCreateIn)
- Modify: `backend/recipes/api.py` (handle tag_ids in create/update, add tag filter to list)
- Test: `backend/recipes/tests/test_tags.py`

**Step 1: Write the failing tests**

Add to `backend/recipes/tests/test_tags.py`:

```python
@pytest.mark.django_db
def test_create_recipe_with_tags(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    response = client.post(
        "/api/v1/recipes/",
        json.dumps({
            "title": "Green Bowl",
            "list_type": "KNOWN",
            "default_servings": 2,
            "ingredients": [],
            "manual_steps": [],
            "machine_steps": [],
            "tag_ids": [str(tag.id)],
        }),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["tags"]) == 1
    assert data["tags"][0]["name_en"] == "Vegan"


@pytest.mark.django_db
def test_update_recipe_tags(auth_client):
    client, household = auth_client
    vegan = Tag.objects.filter(household=household, name_en="Vegan").first()
    italian = Tag.objects.filter(household=household, name_en="Italian").first()
    recipe = Recipe.objects.create(
        household=household, title="Pasta", list_type="KNOWN", default_servings=2
    )
    recipe.tags.add(vegan)

    response = client.put(
        f"/api/v1/recipes/{recipe.id}/",
        json.dumps({
            "title": "Pasta",
            "list_type": "KNOWN",
            "default_servings": 2,
            "ingredients": [],
            "manual_steps": [],
            "machine_steps": [],
            "tag_ids": [str(italian.id)],
        }),
        content_type="application/json",
    )
    assert response.status_code == 200
    tag_names = [t["name_en"] for t in response.json()["tags"]]
    assert "Italian" in tag_names
    assert "Vegan" not in tag_names


@pytest.mark.django_db
def test_list_recipes_includes_tags(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Simple").first()
    recipe = Recipe.objects.create(
        household=household, title="Toast", list_type="KNOWN", default_servings=1
    )
    recipe.tags.add(tag)

    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert len(items[0]["tags"]) == 1
    assert items[0]["tags"][0]["name_en"] == "Simple"


@pytest.mark.django_db
def test_filter_recipes_by_tags(auth_client):
    client, household = auth_client
    vegan = Tag.objects.filter(household=household, name_en="Vegan").first()
    pork = Tag.objects.filter(household=household, name_en="Pork").first()

    r1 = Recipe.objects.create(
        household=household, title="Salad", list_type="KNOWN", default_servings=2
    )
    r1.tags.add(vegan)
    r2 = Recipe.objects.create(
        household=household, title="Schnitzel", list_type="KNOWN", default_servings=2
    )
    r2.tags.add(pork)

    response = client.get(f"/api/v1/recipes/?tags={vegan.id}")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Salad"
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_tags.py::test_create_recipe_with_tags -v`
Expected: FAIL

**Step 3: Update schemas**

Modify `backend/recipes/schemas.py`:

Add import at top:
```python
from recipes.tag_schemas import TagOut
```

Add `tags` field to `RecipeListOut` (after `updated_at`):
```python
tags: list[TagOut] = []
```

Add `tags` field to `RecipeOut` (after `updated_at`, before `resolve_manual_steps`):
```python
tags: list[TagOut] = []
```

Add `tag_ids` field to `RecipeCreateIn` (after `machine_steps`):
```python
tag_ids: list[UUID] = []
```

Add UUID import at top if not present.

**Step 4: Update API endpoints**

Modify `backend/recipes/api.py`:

In `list_recipes`, add tag filtering after `list_type` filter (around line 71):
```python
tags_param = request.GET.get("tags")
if tags_param:
    tag_ids = [t.strip() for t in tags_param.split(",") if t.strip()]
    qs = qs.filter(tags__id__in=tag_ids).distinct()
```

Add `.prefetch_related("tags")` to the list queryset (before counting):
```python
qs = Recipe.objects.filter(household=request.user.active_household).prefetch_related("tags")
```

In `create_recipe`, after `_save_steps` calls, add:
```python
if payload.tag_ids:
    recipe.tags.set(
        Tag.objects.filter(id__in=payload.tag_ids, household=request.user.active_household)
    )
```

In `update_recipe_put` and `update_recipe_patch`, after `_save_steps` calls, add:
```python
recipe.tags.set(
    Tag.objects.filter(id__in=payload.tag_ids, household=request.user.active_household)
)
```

In `get_recipe`, add `"tags"` to the prefetch_related call:
```python
Recipe.objects.prefetch_related(
    "ingredients",
    "tags",
    Prefetch(...),
    ...
)
```

**Step 5: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: All PASS

**Step 6: Run existing recipe tests to verify no regressions**

Run: `pytest backend/recipes/tests/ -v`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/recipes/schemas.py backend/recipes/api.py backend/recipes/tests/test_tags.py
git commit -m "feat: integrate tags into recipe API (create, update, list, filter)"
```

---

### Task 5: MealPlan Excluded Tags Integration

**Files:**
- Modify: `backend/planner/schemas.py` (add excluded_tag_ids to SetupPlanIn and MealPlanOut)
- Modify: `backend/planner/services.py` (filter recipes by excluded tags)
- Modify: `backend/planner/api.py` (pass excluded_tag_ids through)
- Test: `backend/planner/tests/test_tags.py`

**Step 1: Write the failing test**

Create `backend/planner/tests/test_tags.py`:

```python
import json
from datetime import date

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from planner.models import MealPlan
from planner.services import _select_recipes
from recipes.models import Recipe, Tag
from recipes.tag_defaults import seed_default_tags
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def household_with_recipes():
    user = User.objects.create_user(email="plan@example.com")
    household = Household.objects.create(name="Plan Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    seed_default_tags(household)

    pork_tag = Tag.objects.get(household=household, name_en="Pork")
    vegan_tag = Tag.objects.get(household=household, name_en="Vegan")

    r1 = Recipe.objects.create(
        household=household, title="Pork Chops", list_type="KNOWN", default_servings=2
    )
    r1.tags.add(pork_tag)

    r2 = Recipe.objects.create(
        household=household, title="Vegan Bowl", list_type="KNOWN", default_servings=2
    )
    r2.tags.add(vegan_tag)

    r3 = Recipe.objects.create(
        household=household, title="Plain Rice", list_type="KNOWN", default_servings=2
    )

    client = Client()
    client.force_login(user)
    return client, household, pork_tag, vegan_tag, r1, r2, r3


@pytest.mark.django_db
def test_excluded_tags_filter_recipes(household_with_recipes):
    client, household, pork_tag, vegan_tag, r1, r2, r3 = household_with_recipes
    recipes = _select_recipes(
        household=household,
        days=3,
        known_ratio=1.0,
        default_leftover_days=0,
        exclude_ids=set(),
        excluded_tags=[pork_tag],
    )
    recipe_titles = {r.title for r in recipes}
    assert "Pork Chops" not in recipe_titles


@pytest.mark.django_db
def test_setup_plan_with_excluded_tags(household_with_recipes):
    client, household, pork_tag, vegan_tag, r1, r2, r3 = household_with_recipes
    response = client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps({
            "iteration_weeks": 1,
            "shopping_days": [0],
            "servings": 2,
            "known_ratio": 1.0,
            "default_leftover_days": 0,
            "excluded_tag_ids": [str(pork_tag.id)],
        }),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert str(pork_tag.id) in data["excluded_tag_ids"]


@pytest.mark.django_db
def test_meal_plan_out_includes_excluded_tag_ids(household_with_recipes):
    client, household, pork_tag, vegan_tag, r1, r2, r3 = household_with_recipes
    client.post(
        "/api/v1/meal-plans/setup/",
        json.dumps({
            "iteration_weeks": 1,
            "shopping_days": [0],
            "servings": 2,
            "known_ratio": 1.0,
            "default_leftover_days": 0,
            "excluded_tag_ids": [str(pork_tag.id)],
        }),
        content_type="application/json",
    )
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 200
    plan = response.json()[0]
    assert str(pork_tag.id) in plan["excluded_tag_ids"]
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/planner/tests/test_tags.py -v`
Expected: FAIL

**Step 3: Update planner schemas**

Modify `backend/planner/schemas.py`:

Add to imports:
```python
from uuid import UUID
```

Add to `SetupPlanIn` (after `default_leftover_days`):
```python
excluded_tag_ids: list[UUID] = []
```

Add to `MealPlanOut` (after `default_leftover_days`):
```python
excluded_tag_ids: list[UUID] = []

@staticmethod
def resolve_excluded_tag_ids(obj):
    if hasattr(obj, "_prefetched_excluded_tag_ids"):
        return obj._prefetched_excluded_tag_ids
    return list(obj.excluded_tags.values_list("id", flat=True))
```

**Step 4: Update planner services**

Modify `backend/planner/services.py`:

Update `setup_meal_plan` signature to accept `excluded_tag_ids`:

```python
def setup_meal_plan(
    household,
    iteration_weeks: int,
    shopping_days: list[int],
    servings: int,
    known_ratio: float,
    default_leftover_days: int,
    excluded_tag_ids: list | None = None,
) -> MealPlan:
```

After `plan, _ = MealPlan.objects.update_or_create(...)`, add:

```python
if excluded_tag_ids is not None:
    from recipes.models import Tag
    tags = Tag.objects.filter(id__in=excluded_tag_ids, household=household)
    plan.excluded_tags.set(tags)
```

Update `_select_recipes` signature to accept `excluded_tags`:

```python
def _select_recipes(
    household,
    days: int,
    known_ratio: float,
    default_leftover_days: int,
    exclude_ids: set,
    excluded_tags: list | None = None,
) -> list[Recipe]:
```

After computing `known_qs` and `try_qs` (lines 143-144), add:

```python
if excluded_tags:
    known_qs = known_qs.exclude(tags__in=excluded_tags)
    try_qs = try_qs.exclude(tags__in=excluded_tags)
```

Update `_populate_iteration` to pass excluded tags through. After the `_select_recipes` call (line 99), update to:

```python
excluded_tags = list(plan.excluded_tags.all())

recipes = _select_recipes(
    household=plan.household,
    days=days,
    known_ratio=plan.known_ratio,
    default_leftover_days=plan.default_leftover_days,
    exclude_ids=exclude_recipe_ids,
    excluded_tags=excluded_tags,
)
```

**Step 5: Update planner API**

Modify `backend/planner/api.py` -- pass `excluded_tag_ids` in `setup_plan`:

```python
plan = setup_meal_plan(
    household=request.user.active_household,
    iteration_weeks=payload.iteration_weeks,
    shopping_days=payload.shopping_days,
    servings=payload.servings,
    known_ratio=payload.known_ratio,
    default_leftover_days=payload.default_leftover_days,
    excluded_tag_ids=payload.excluded_tag_ids,
)
```

In `list_plans`, add prefetch for excluded_tags:

```python
return MealPlan.objects.filter(
    household=request.user.active_household
).prefetch_related("iterations__entries", "excluded_tags")
```

In `get_plan`:
```python
qs = MealPlan.objects.prefetch_related("iterations__entries", "excluded_tags")
```

**Step 6: Run tests to verify they pass**

Run: `pytest backend/planner/tests/test_tags.py -v`
Expected: All PASS

**Step 7: Run all planner tests for regressions**

Run: `pytest backend/planner/tests/ -v`
Expected: All PASS

**Step 8: Commit**

```bash
git add backend/planner/schemas.py backend/planner/services.py backend/planner/api.py backend/planner/tests/test_tags.py
git commit -m "feat: add excluded tags support to meal plan generation"
```

---

### Task 6: Frontend Types and API Hooks

**Files:**
- Modify: `frontend/src/api/types.ts` (add Tag types, update Recipe/MealPlan types)
- Create: `frontend/src/hooks/useTags.ts` (tag CRUD hooks)
- Modify: `frontend/src/hooks/useRecipes.ts` (add tag filter param)

**Step 1: Add TypeScript types**

Modify `frontend/src/api/types.ts`:

Add after the `HouseholdRole` type:
```typescript
export type TagCategory = "DIETARY" | "PROTEIN" | "CUISINE" | "MEAL_TYPE";
```

Add after the `Passkey` interface:
```typescript
// ── Tags ──────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  category: TagCategory;
  name_en: string;
  name_de: string;
  is_default: boolean;
}

export type GroupedTags = Record<TagCategory, Tag[]>;

export interface TagCreatePayload {
  category: TagCategory;
  name_en: string;
  name_de: string;
}

export interface TagUpdatePayload {
  name_en: string;
  name_de: string;
}
```

Add `tags` to `RecipeSummary` (after `updated_at`):
```typescript
tags: Tag[];
```

Add `tags` to `Recipe` (after `updated_at`):
```typescript
tags: Tag[];
```

Add `tag_ids` to `RecipeUpdatePayload` (after `machine_steps`):
```typescript
tag_ids: string[];
```

Add `excluded_tag_ids` to `MealPlan` (after `default_leftover_days`):
```typescript
excluded_tag_ids: string[];
```

**Step 2: Create tag hooks**

Create `frontend/src/hooks/useTags.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { GroupedTags, Tag, TagCreatePayload, TagUpdatePayload } from "../api/types";

export function useTags() {
  return useQuery<GroupedTags>({
    queryKey: ["tags"],
    queryFn: () => api.get("/api/v1/tags/"),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation<Tag, Error, TagCreatePayload>({
    mutationFn: (payload) => api.post("/api/v1/tags/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation<Tag, Error, { id: string; payload: TagUpdatePayload }>({
    mutationFn: ({ id, payload }) => api.put(`/api/v1/tags/${id}/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/api/v1/tags/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
```

**Step 3: Update useRecipes to support tag filtering**

Modify `frontend/src/hooks/useRecipes.ts`:

Update `useRecipes` to accept an optional `tagIds` parameter. Add it to the query key and URL:

```typescript
export function useRecipes(listType?: ListType, tagIds?: string[]) {
```

Update the queryKey to include tagIds:
```typescript
queryKey: ["recipes", listType, tagIds],
```

Update the URL construction in queryFn to append tags:
```typescript
const tagParam = tagIds?.length ? `&tags=${tagIds.join(",")}` : "";
// append tagParam to the URL
```

**Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/useTags.ts frontend/src/hooks/useRecipes.ts
git commit -m "feat: add frontend tag types and API hooks"
```

---

### Task 7: Recipe List Page Tag Filters

**Files:**
- Modify: `frontend/src/pages/RecipeListPage.tsx` (add filter dropdowns)
- Modify: `frontend/src/i18n/en.json` (add tag translations)
- Modify: `frontend/src/i18n/de.json` (add tag translations)

**Step 1: Add i18n translations**

Add to `en.json` under a new `"tags"` key:

```json
"tags": {
  "title": "Tags",
  "DIETARY": "Dietary",
  "PROTEIN": "Protein",
  "CUISINE": "Cuisine",
  "MEAL_TYPE": "Meal Type",
  "filter": "Filter",
  "clearFilters": "Clear filters",
  "addTag": "Add Tag",
  "editTag": "Edit Tag",
  "deleteTag": "Delete Tag",
  "deleteConfirm": "This tag is used on {{count}} recipe(s). Remove from all?",
  "nameEn": "Name (English)",
  "nameDe": "Name (German)",
  "category": "Category",
  "manageTags": "Manage Tags",
  "noTags": "No tags yet",
  "customTag": "Custom",
  "allSelected": "All",
  "noneSelected": "None",
  "excludeFromPlan": "Uncheck tags to exclude them from this plan"
}
```

Add equivalent German translations to `de.json`.

**Step 2: Add filter dropdowns to RecipeListPage**

Modify `frontend/src/pages/RecipeListPage.tsx`:

Add state for selected tag filters:
```typescript
const [selectedTags, setSelectedTags] = useState<string[]>([]);
```

Import and use `useTags`:
```typescript
const { data: groupedTags } = useTags();
```

Pass `selectedTags` to `useRecipes`:
```typescript
const { data, ... } = useRecipes(activeTab, selectedTags.length > 0 ? selectedTags : undefined);
```

Add 4 multi-select dropdowns between the search bar and the recipe list. Each dropdown shows tags from one category. When tags are selected, their IDs are added to `selectedTags`. Show dismissible chips for active filters.

Implementation details for the multi-select dropdown: use a `<details>` + `<summary>` pattern or a custom dropdown with checkboxes. Each option has a checkbox. The summary shows the category name + count of selected tags.

**Step 3: Add tag chips to RecipeCard**

Modify `frontend/src/components/RecipeCard.tsx`:

Add tag chips at the bottom of the card. Color-code by category:
- DIETARY: `bg-green-100 text-green-800`
- PROTEIN: `bg-red-100 text-red-800`
- CUISINE: `bg-blue-100 text-blue-800`
- MEAL_TYPE: `bg-amber-100 text-amber-800`

```tsx
const TAG_COLORS: Record<TagCategory, string> = {
  DIETARY: "bg-green-100 text-green-800",
  PROTEIN: "bg-red-100 text-red-800",
  CUISINE: "bg-blue-100 text-blue-800",
  MEAL_TYPE: "bg-amber-100 text-amber-800",
};
```

**Step 4: Run frontend lint and build**

Run:
```bash
cd frontend && npm run lint
cd frontend && npm run build
```
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/RecipeListPage.tsx frontend/src/components/RecipeCard.tsx frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: add tag filter dropdowns to recipe list and tag chips to cards"
```

---

### Task 8: Recipe Create/Edit Form Tags

**Files:**
- Modify: `frontend/src/pages/RecipeCreatePage.tsx` (add tag selectors)
- Modify: `frontend/src/pages/RecipeDetailPage.tsx` (add tag selectors)

**Step 1: Add tag selection to RecipeCreatePage**

Modify `frontend/src/pages/RecipeCreatePage.tsx`:

Add state for selected tag IDs:
```typescript
const [tagIds, setTagIds] = useState<string[]>([]);
```

Import and use `useTags` and `useCreateTag`:
```typescript
const { data: groupedTags } = useTags();
const createTag = useCreateTag();
```

Add a "Tags" section before the submit button. For each category, render a multi-select dropdown listing available tags. Include a "+ Add" button that opens a small popover/inline form to create a new tag (name_en + name_de fields).

Include `tag_ids: tagIds` in the submit payload.

**Step 2: Add tag selection to RecipeDetailPage**

Modify `frontend/src/pages/RecipeDetailPage.tsx`:

Same pattern as create page. Initialize `tagIds` from the existing recipe's tags:
```typescript
const [tagIds, setTagIds] = useState<string[]>(
  recipe?.tags.map((t) => t.id) ?? []
);
```

Include `tag_ids: tagIds` in the update payload.

**Step 3: Run lint and build**

Run:
```bash
cd frontend && npm run lint
cd frontend && npm run build
```

**Step 4: Commit**

```bash
git add frontend/src/pages/RecipeCreatePage.tsx frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: add tag selection to recipe create and edit forms"
```

---

### Task 9: GenerateDrawer Tag Exclusion

**Files:**
- Modify: `frontend/src/components/GenerateDrawer.tsx` (add tag exclusion checkboxes)
- Modify: `frontend/src/hooks/useMealPlan.ts` (pass excluded_tag_ids in setup)

**Step 1: Update useMealPlan hook**

Modify `frontend/src/hooks/useMealPlan.ts`:

Update the `useSetupPlan` mutation payload type to include `excluded_tag_ids: string[]`.

**Step 2: Add tag exclusion UI to GenerateDrawer**

Modify `frontend/src/components/GenerateDrawer.tsx`:

Import `useTags`:
```typescript
const { data: groupedTags } = useTags();
```

Add state for excluded tag IDs (initialize from existing plan):
```typescript
const [excludedTagIds, setExcludedTagIds] = useState<Set<string>>(
  new Set(existingPlan?.excluded_tag_ids ?? [])
);
```

Add a "Tags" section after existing form fields. For each category, show a group of checkboxes (one per tag). All checked by default. Unchecking adds to `excludedTagIds`.

Show hint text: `t("tags.excludeFromPlan")`.

Include `excluded_tag_ids: Array.from(excludedTagIds)` in the setup payload.

**Step 3: Run lint and build**

Run:
```bash
cd frontend && npm run lint
cd frontend && npm run build
```

**Step 4: Commit**

```bash
git add frontend/src/components/GenerateDrawer.tsx frontend/src/hooks/useMealPlan.ts
git commit -m "feat: add tag exclusion checkboxes to plan generation drawer"
```

---

### Task 10: Settings Tag Management

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx` (add tag management section)

**Step 1: Add tag management section**

Modify `frontend/src/pages/SettingsPage.tsx`:

Import hooks:
```typescript
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from "../hooks/useTags";
```

Add a "Manage Tags" section (between existing sections, e.g. after Language or after Household). Show 4 collapsible groups (one per category). Each group lists tags with:
- Tag name (in current language)
- Edit button (opens inline edit with name_en + name_de fields)
- Delete button (with confirmation if tag is used on recipes)
- Default tags marked with a subtle badge
- "+ Add Tag" button at the bottom of each group

Use `useConfirm` for delete confirmation with the count of recipes using the tag.

**Step 2: Run lint and build**

Run:
```bash
cd frontend && npm run lint
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add tag management section to settings page"
```

---

### Task 11: Seed Existing Households and Final Testing

**Files:**
- Create: `backend/recipes/management/commands/seed_tags.py`

**Step 1: Write management command for existing households**

Create `backend/recipes/management/commands/seed_tags.py`:

```python
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
```

**Step 2: Run full test suite**

Run:
```bash
pytest
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm test
```
Expected: All PASS

**Step 3: Run linting**

Run:
```bash
ruff check . --fix && ruff format .
cd backend && mypy --config-file=../pyproject.toml .
```
Expected: Clean

**Step 4: Commit**

```bash
git add backend/recipes/management/commands/seed_tags.py
git commit -m "feat: add seed_tags management command for existing households"
```
