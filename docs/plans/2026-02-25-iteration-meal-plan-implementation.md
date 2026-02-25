# Iteration-Based Meal Plan Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the meal plan from a single disposable plan into a rolling iteration-based system with configurable shopping days, iteration archival, and duplicate avoidance.

**Architecture:** MealPlan becomes a long-lived config container (one per household). PlanIteration is a new model representing a 1-3 week block. MealPlanEntry and ShoppingList FKs move from MealPlan to PlanIteration. Shopping lists are generated per shopping-day segment within an iteration.

**Tech Stack:** Django 5.1, Django Ninja, PostgreSQL/SQLite, React 19, TypeScript, TanStack Query, Tailwind CSS

**Design doc:** `docs/plans/2026-02-25-iteration-meal-plan-design.md`

---

### Task 1: Rework MealPlan Model + Create PlanIteration Model

**Files:**
- Modify: `backend/planner/models.py`

**Step 1: Rewrite models.py**

Replace the entire file with:

```python
import uuid

from django.db import models


class MealPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.OneToOneField(
        "users.Household", on_delete=models.CASCADE, related_name="meal_plan"
    )
    iteration_weeks = models.PositiveIntegerField(default=1)
    shopping_days = models.JSONField(default=list, help_text="List of weekday ints, 0=Mon..6=Sun")
    servings = models.PositiveIntegerField(default=2)
    known_ratio = models.FloatField(default=0.7)
    default_leftover_days = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"MealPlan for {self.household}"


class PlanIteration(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal_plan = models.ForeignKey(MealPlan, on_delete=models.CASCADE, related_name="iterations")
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.start_date} – {self.end_date} ({self.status})"


class MealPlanEntry(models.Model):
    MEAL_TYPE_CHOICES = [
        ("BREAKFAST", "Breakfast"),
        ("LUNCH", "Lunch"),
        ("DINNER", "Dinner"),
        ("SNACK", "Snack"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    iteration = models.ForeignKey(
        PlanIteration, on_delete=models.CASCADE, related_name="entries"
    )
    date = models.DateField()
    meal_type = models.CharField(max_length=10, choices=MEAL_TYPE_CHOICES)
    recipe = models.ForeignKey("recipes.Recipe", on_delete=models.CASCADE)
    servings = models.PositiveIntegerField()
    is_leftover = models.BooleanField(default=False)
    source_entry = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="leftover_entries"
    )
    is_locked = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.date} {self.meal_type} – {self.recipe.title}"
```

**Step 2: Update ShoppingList model**

Modify `backend/shopping/models.py` — change FK from `meal_plan` to `iteration`, add `shopping_date`:

```python
import uuid

from django.db import models


class ShoppingList(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    iteration = models.ForeignKey(
        "planner.PlanIteration", on_delete=models.CASCADE, related_name="shopping_lists"
    )
    shopping_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Shopping list {self.shopping_date} for {self.iteration}"


class ShoppingListItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shopping_list = models.ForeignKey(ShoppingList, on_delete=models.CASCADE, related_name="items")
    ingredient = models.ForeignKey("recipes.Ingredient", on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.ForeignKey("recipes.Unit", on_delete=models.CASCADE)
    is_checked = models.BooleanField(default=False)

    class Meta:
        ordering = ["ingredient__category", "ingredient__name_en"]
```

**Step 3: Generate and apply migrations**

Run:
```bash
cd backend && python manage.py makemigrations planner shopping
cd backend && python manage.py migrate
```

Note: Since we're changing ForeignKeys and removing fields, Django may need a multi-step migration. If it asks about removing `start_date`/`end_date` from MealPlan and the FK changes, accept defaults. Existing data will be handled in Task 2.

**Step 4: Commit**

```bash
git add backend/planner/models.py backend/shopping/models.py backend/planner/migrations/ backend/shopping/migrations/
git commit -m "feat: rework MealPlan model and create PlanIteration model"
```

---

### Task 2: Data Migration

**Files:**
- Create: `backend/planner/migrations/XXXX_migrate_existing_plans.py` (number will depend on previous migration)

**Step 1: Write data migration**

Run:
```bash
cd backend && python manage.py makemigrations planner --empty -n migrate_existing_plans
```

Then edit the generated file:

```python
from django.db import migrations


def migrate_existing_plans(apps, schema_editor):
    MealPlan = apps.get_model("planner", "MealPlan")
    PlanIteration = apps.get_model("planner", "PlanIteration")
    MealPlanEntry = apps.get_model("planner", "MealPlanEntry")

    for plan in MealPlan.objects.all():
        # Set defaults on the reworked MealPlan fields
        plan.iteration_weeks = 1
        plan.shopping_days = [plan.start_date.weekday()] if hasattr(plan, 'start_date') and plan.start_date else [0]
        plan.servings = 2
        plan.known_ratio = 0.7
        plan.default_leftover_days = 1
        plan.save()

        # Create iteration from old date range
        if hasattr(plan, 'start_date') and plan.start_date and plan.end_date:
            iteration = PlanIteration.objects.create(
                meal_plan=plan,
                start_date=plan.start_date,
                end_date=plan.end_date,
                status="ACTIVE",
            )

            # Move entries to iteration
            MealPlanEntry.objects.filter(meal_plan=plan).update(iteration=iteration)


def reverse_migration(apps, schema_editor):
    pass  # No reverse needed


class Migration(migrations.Migration):
    dependencies = [
        ("planner", "XXXX_previous"),  # Replace with actual previous migration name
    ]

    operations = [
        migrations.RunPython(migrate_existing_plans, reverse_migration),
    ]
```

Note: This migration depends on the schema migration sequence. The actual approach may need to be: (1) add new fields/models first keeping old fields, (2) run data migration, (3) remove old fields. Adjust migration ordering as needed when Django generates them.

**Step 2: Apply migration**

```bash
cd backend && python manage.py migrate
```

**Step 3: Commit**

```bash
git add backend/planner/migrations/
git commit -m "feat: data migration for existing plans to iteration model"
```

---

### Task 3: Update Admin

**Files:**
- Modify: `backend/planner/admin.py`

**Step 1: Rewrite admin.py**

```python
from django.contrib import admin

from .models import MealPlan, MealPlanEntry, PlanIteration


class PlanIterationInline(admin.TabularInline):
    model = PlanIteration
    extra = 0
    fields = ("start_date", "end_date", "status", "created_at")
    readonly_fields = ("created_at",)


class MealPlanEntryInline(admin.TabularInline):
    model = MealPlanEntry
    extra = 0


@admin.register(MealPlan)
class MealPlanAdmin(admin.ModelAdmin):
    list_display = ("household", "iteration_weeks", "servings", "created_at")
    list_filter = ("household",)
    inlines = [PlanIterationInline]


@admin.register(PlanIteration)
class PlanIterationAdmin(admin.ModelAdmin):
    list_display = ("meal_plan", "start_date", "end_date", "status", "created_at")
    list_filter = ("status",)
    inlines = [MealPlanEntryInline]


@admin.register(MealPlanEntry)
class MealPlanEntryAdmin(admin.ModelAdmin):
    list_display = ("iteration", "date", "meal_type", "recipe", "servings", "is_leftover", "is_locked")
    list_filter = ("meal_type", "is_leftover", "is_locked")
```

**Step 2: Commit**

```bash
git add backend/planner/admin.py
git commit -m "feat: update planner admin for iteration model"
```

---

### Task 4: Shopping Day Validation + Segment Calculation Utilities

**Files:**
- Create: `backend/planner/iteration_utils.py`
- Create: `backend/planner/tests/test_iteration_utils.py`

**Step 1: Write failing tests**

```python
import pytest
from datetime import date

from planner.iteration_utils import (
    validate_shopping_days,
    compute_iteration_dates,
    compute_shopping_segments,
)


class TestValidateShoppingDays:
    def test_single_day_valid(self):
        validate_shopping_days([5])  # Saturday — should not raise

    def test_two_days_valid(self):
        validate_shopping_days([0, 3])  # Mon + Thu (3 apart)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="at least 1"):
            validate_shopping_days([])

    def test_three_days_raises(self):
        with pytest.raises(ValueError, match="at most 2"):
            validate_shopping_days([0, 2, 4])

    def test_two_days_too_close_raises(self):
        with pytest.raises(ValueError, match="at least 3 days apart"):
            validate_shopping_days([0, 1])  # Mon + Tue

    def test_two_days_wrapping_too_close_raises(self):
        with pytest.raises(ValueError, match="at least 3 days apart"):
            validate_shopping_days([6, 0])  # Sun + Mon

    def test_two_days_wrapping_valid(self):
        validate_shopping_days([5, 1])  # Sat + Tue (3 apart via wrap)


class TestComputeIterationDates:
    def test_snap_forward_to_shopping_day(self):
        # Wed Feb 25, shopping on Sat (5)
        start, end = compute_iteration_dates(date(2026, 2, 25), [5], iteration_weeks=1)
        assert start == date(2026, 2, 28)  # Snaps to Saturday
        assert end == date(2026, 3, 6)  # 1 week: Sat–Fri

    def test_already_on_shopping_day(self):
        start, end = compute_iteration_dates(date(2026, 2, 28), [5], iteration_weeks=1)
        assert start == date(2026, 2, 28)
        assert end == date(2026, 3, 6)

    def test_two_weeks(self):
        start, end = compute_iteration_dates(date(2026, 2, 28), [5], iteration_weeks=2)
        assert start == date(2026, 2, 28)
        assert end == date(2026, 3, 13)

    def test_two_shopping_days_starts_on_first(self):
        # shopping on Wed(2) + Sat(5), start date is Thu
        start, end = compute_iteration_dates(date(2026, 2, 26), [2, 5], iteration_weeks=1)
        assert start == date(2026, 2, 28)  # Snaps to Sat (nearest forward)
        assert start.weekday() in [2, 5]


class TestComputeShoppingSegments:
    def test_single_shopping_day_one_week(self):
        # Sat Feb 28 – Fri Mar 6, shop on Sat
        segments = compute_shopping_segments(
            start_date=date(2026, 2, 28),
            end_date=date(2026, 3, 6),
            shopping_days=[5],
        )
        assert len(segments) == 1
        assert segments[0] == (date(2026, 2, 28), date(2026, 2, 28), date(2026, 3, 6))

    def test_single_shopping_day_two_weeks(self):
        # Sat Feb 28 – Fri Mar 13, shop on Sat
        segments = compute_shopping_segments(
            start_date=date(2026, 2, 28),
            end_date=date(2026, 3, 13),
            shopping_days=[5],
        )
        assert len(segments) == 2
        assert segments[0] == (date(2026, 2, 28), date(2026, 2, 28), date(2026, 3, 6))
        assert segments[1] == (date(2026, 3, 7), date(2026, 3, 7), date(2026, 3, 13))

    def test_two_shopping_days(self):
        # Wed Mar 4 – Tue Mar 17 (2 weeks), shop Wed + Sat
        segments = compute_shopping_segments(
            start_date=date(2026, 3, 4),
            end_date=date(2026, 3, 17),
            shopping_days=[2, 5],
        )
        # Wed Mar 4 covers Mar 4-6, Sat Mar 7 covers Mar 7-10, Wed Mar 11 covers Mar 11-13, Sat Mar 14 covers Mar 14-17
        assert len(segments) == 4
        assert segments[0][0] == date(2026, 3, 4)  # segment_start
        assert segments[0][1] == date(2026, 3, 4)  # shopping_date
        assert segments[0][2] == date(2026, 3, 6)  # segment_end
```

Each segment tuple is `(segment_start, shopping_date, segment_end)`. For the first segment of an iteration, `segment_start` may be before `shopping_date` if the iteration doesn't start exactly on a shopping day (though with snapping this shouldn't happen). Keeping both for clarity.

**Step 2: Run tests to verify they fail**

```bash
pytest backend/planner/tests/test_iteration_utils.py -v
```

Expected: ImportError — module doesn't exist yet.

**Step 3: Implement iteration_utils.py**

```python
from datetime import date, timedelta


def validate_shopping_days(shopping_days: list[int]) -> None:
    if len(shopping_days) < 1:
        raise ValueError("Must configure at least 1 shopping day")
    if len(shopping_days) > 2:
        raise ValueError("Must configure at most 2 shopping days")
    for d in shopping_days:
        if d < 0 or d > 6:
            raise ValueError(f"Invalid weekday: {d}")
    if len(shopping_days) == 2:
        a, b = sorted(shopping_days)
        gap = min(b - a, 7 - (b - a))
        if gap < 3:
            raise ValueError("Shopping days must be at least 3 days apart")


def _snap_to_next_weekday(d: date, weekdays: list[int]) -> date:
    """Snap a date forward to the nearest date whose weekday is in weekdays."""
    for offset in range(7):
        candidate = d + timedelta(days=offset)
        if candidate.weekday() in weekdays:
            return candidate
    return d  # Should never happen


def compute_iteration_dates(
    requested_start: date, shopping_days: list[int], iteration_weeks: int
) -> tuple[date, date]:
    start = _snap_to_next_weekday(requested_start, shopping_days)
    end = start + timedelta(weeks=iteration_weeks) - timedelta(days=1)
    return start, end


def compute_shopping_segments(
    start_date: date, end_date: date, shopping_days: list[int]
) -> list[tuple[date, date, date]]:
    """Return list of (segment_start, shopping_date, segment_end) tuples."""
    # Collect all shopping day occurrences within the iteration
    shopping_dates: list[date] = []
    current = start_date
    while current <= end_date:
        if current.weekday() in shopping_days:
            shopping_dates.append(current)
        current += timedelta(days=1)

    # Drop shopping dates on the last day (nothing to cover after)
    shopping_dates = [d for d in shopping_dates if d < end_date]

    if not shopping_dates:
        # Fallback: single segment covering entire iteration
        return [(start_date, start_date, end_date)]

    segments: list[tuple[date, date, date]] = []
    for i, shop_date in enumerate(shopping_dates):
        if i == 0:
            seg_start = start_date
        else:
            seg_start = shopping_dates[i - 1] + timedelta(days=1)
            # Actually: segment starts day after previous shopping segment ends
            # Recalculate: each segment starts at the shopping_date
            seg_start = shop_date

        if i + 1 < len(shopping_dates):
            seg_end = shopping_dates[i + 1] - timedelta(days=1)
        else:
            seg_end = end_date

        segments.append((seg_start, shop_date, seg_end))

    # Fix first segment to cover from iteration start
    if segments and segments[0][0] > start_date:
        first = segments[0]
        segments[0] = (start_date, first[1], first[2])

    return segments
```

**Step 4: Run tests to verify they pass**

```bash
pytest backend/planner/tests/test_iteration_utils.py -v
```

Expected: All pass.

**Step 5: Commit**

```bash
git add backend/planner/iteration_utils.py backend/planner/tests/test_iteration_utils.py
git commit -m "feat: add shopping day validation and iteration date utilities"
```

---

### Task 5: Rework Generation Service

**Files:**
- Modify: `backend/planner/services.py`
- Create: `backend/planner/tests/test_services.py`

**Step 1: Write failing tests for new generation logic**

Create `backend/planner/tests/test_services.py`:

```python
import pytest
from datetime import date

from planner.models import MealPlan, PlanIteration, MealPlanEntry
from planner.services import setup_meal_plan, generate_next_iteration, renew_iteration
from recipes.models import Recipe, Ingredient, Unit, RecipeIngredient


def _create_recipes(household, count=10):
    """Create test recipes with ingredients for overlap scoring."""
    ingredient = Ingredient.objects.create(name_en="Tomato", name_de="Tomate", category="PRODUCE")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    recipes = []
    for i in range(count):
        lt = "KNOWN" if i < count * 0.7 else "TO_TRY"
        recipe = Recipe.objects.create(
            household=household,
            title=f"Recipe {i}",
            list_type=lt,
            default_servings=2,
        )
        RecipeIngredient.objects.create(
            recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1
        )
        recipes.append(recipe)
    return recipes


@pytest.mark.django_db
class TestSetupMealPlan:
    def test_creates_plan_and_first_iteration(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        assert plan.iteration_weeks == 1
        assert plan.shopping_days == [5]
        iterations = list(plan.iterations.all())
        assert len(iterations) == 1
        assert iterations[0].status == "ACTIVE"
        assert iterations[0].entries.count() > 0

    def test_setup_replaces_existing_config(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan1 = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        plan2 = setup_meal_plan(
            household=household,
            iteration_weeks=2,
            shopping_days=[2, 5],
            servings=4,
            known_ratio=0.5,
            default_leftover_days=0,
            start_date=date(2026, 3, 4),
        )
        assert plan1.id == plan2.id  # Same plan updated
        assert plan2.iteration_weeks == 2

    def test_iteration_dates_snap_to_shopping_day(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],  # Saturday
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 25),  # Wednesday
        )
        iteration = plan.iterations.first()
        assert iteration.start_date == date(2026, 2, 28)  # Snapped to Saturday


@pytest.mark.django_db
class TestGenerateNextIteration:
    def test_generates_next_after_current(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        prev = plan.iterations.first()
        new_iter = generate_next_iteration(plan)
        assert new_iter.start_date == prev.end_date + __import__("datetime").timedelta(days=1)
        assert new_iter.status == "ACTIVE"
        prev.refresh_from_db()
        assert prev.status == "ARCHIVED"

    def test_avoids_previous_iteration_recipes(self, auth_client):
        _, household = auth_client
        _create_recipes(household, count=20)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=0,
            start_date=date(2026, 2, 28),
        )
        prev_recipes = set(
            plan.iterations.first().entries.filter(is_leftover=False).values_list("recipe_id", flat=True)
        )
        new_iter = generate_next_iteration(plan)
        new_recipes = set(
            new_iter.entries.filter(is_leftover=False).values_list("recipe_id", flat=True)
        )
        # With 20 recipes, there should be no overlap
        assert len(prev_recipes & new_recipes) == 0


@pytest.mark.django_db
class TestRenewIteration:
    def test_renew_regenerates_entries(self, auth_client):
        _, household = auth_client
        _create_recipes(household)
        plan = setup_meal_plan(
            household=household,
            iteration_weeks=1,
            shopping_days=[5],
            servings=2,
            known_ratio=0.7,
            default_leftover_days=1,
            start_date=date(2026, 2, 28),
        )
        iteration = plan.iterations.first()
        old_entry_ids = set(iteration.entries.values_list("id", flat=True))
        renew_iteration(iteration)
        new_entry_ids = set(iteration.entries.values_list("id", flat=True))
        assert old_entry_ids != new_entry_ids  # Different entries
        assert iteration.entries.count() > 0
```

**Step 2: Run tests to verify they fail**

```bash
pytest backend/planner/tests/test_services.py -v
```

Expected: ImportError — `setup_meal_plan`, `generate_next_iteration`, `renew_iteration` don't exist.

**Step 3: Rewrite services.py**

Replace `backend/planner/services.py`:

```python
import random
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal

from recipes.models import Recipe

from .iteration_utils import compute_iteration_dates, compute_shopping_segments, validate_shopping_days
from .models import MealPlan, MealPlanEntry, PlanIteration


def setup_meal_plan(
    household,
    iteration_weeks: int,
    shopping_days: list[int],
    servings: int,
    known_ratio: float,
    default_leftover_days: int,
    start_date: date,
) -> MealPlan:
    """Create or update the household's MealPlan config and generate the first iteration."""
    validate_shopping_days(shopping_days)

    plan, _ = MealPlan.objects.update_or_create(
        household=household,
        defaults={
            "iteration_weeks": iteration_weeks,
            "shopping_days": shopping_days,
            "servings": servings,
            "known_ratio": known_ratio,
            "default_leftover_days": default_leftover_days,
        },
    )

    # Delete any existing iterations
    plan.iterations.all().delete()

    # Generate first iteration
    _generate_iteration(plan, start_date)

    return plan


def generate_next_iteration(plan: MealPlan) -> PlanIteration:
    """Generate the next iteration after the current one."""
    previous = plan.iterations.order_by("-start_date").first()
    if previous:
        next_start = previous.end_date + timedelta(days=1)
        previous.status = PlanIteration.Status.ARCHIVED
        previous.save(update_fields=["status"])
    else:
        next_start = date.today()

    return _generate_iteration(plan, next_start)


def renew_iteration(iteration: PlanIteration) -> PlanIteration:
    """Re-generate recipes for an existing iteration."""
    plan = iteration.meal_plan
    iteration.entries.all().delete()
    iteration.shopping_lists.all().delete()

    _populate_iteration(
        iteration=iteration,
        plan=plan,
        exclude_recipe_ids=_get_previous_iteration_recipe_ids(plan, iteration),
    )

    return iteration


def _generate_iteration(plan: MealPlan, requested_start: date) -> PlanIteration:
    """Create a new iteration and populate it with entries and shopping lists."""
    start, end = compute_iteration_dates(
        requested_start, plan.shopping_days, plan.iteration_weeks
    )

    iteration = PlanIteration.objects.create(
        meal_plan=plan,
        start_date=start,
        end_date=end,
        status=PlanIteration.Status.ACTIVE,
    )

    exclude_ids = _get_previous_iteration_recipe_ids(plan, iteration)
    _populate_iteration(iteration, plan, exclude_ids)

    return iteration


def _populate_iteration(
    iteration: PlanIteration,
    plan: MealPlan,
    exclude_recipe_ids: set | None = None,
) -> None:
    """Fill an iteration with meal entries and shopping lists."""
    days = (iteration.end_date - iteration.start_date).days + 1

    recipes = _select_recipes(
        household=plan.household,
        days=days,
        known_ratio=plan.known_ratio,
        default_leftover_days=plan.default_leftover_days,
        exclude_ids=exclude_recipe_ids or set(),
    )

    _assign_schedule_lunch_only(
        iteration, recipes, iteration.start_date, days, plan.servings, plan.default_leftover_days
    )

    # Generate shopping lists per segment
    from shopping.services import generate_shopping_lists_for_iteration

    generate_shopping_lists_for_iteration(iteration, plan.shopping_days)


def _get_previous_iteration_recipe_ids(plan: MealPlan, current: PlanIteration) -> set:
    """Get recipe IDs from the iteration immediately before the current one."""
    previous = (
        plan.iterations.filter(start_date__lt=current.start_date)
        .order_by("-start_date")
        .first()
    )
    if not previous:
        return set()
    return set(
        previous.entries.filter(is_leftover=False).values_list("recipe_id", flat=True)
    )


def _select_recipes(
    household, days: int, known_ratio: float, default_leftover_days: int, exclude_ids: set
) -> list[Recipe]:
    """Select recipes for an iteration, avoiding duplicates from excluded IDs."""
    avg_leftover = default_leftover_days
    slots_per_recipe = 1 + avg_leftover
    cooking_sessions = max(days // slots_per_recipe, 1)

    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    known_recipes = list(
        Recipe.objects.filter(household=household, list_type="KNOWN").exclude(id__in=exclude_ids)
    )
    try_recipes = list(
        Recipe.objects.filter(household=household, list_type="TO_TRY").exclude(id__in=exclude_ids)
    )

    # Fallback: if pool is too small after exclusion, include excluded recipes
    if len(known_recipes) < known_count:
        known_recipes = list(
            Recipe.objects.filter(household=household, list_type="KNOWN")
        )
    if len(try_recipes) < try_count:
        try_recipes = list(
            Recipe.objects.filter(household=household, list_type="TO_TRY")
        )

    return _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)


def _select_recipes_with_overlap(
    known: list[Recipe],
    try_list: list[Recipe],
    known_count: int,
    try_count: int,
    candidates: int = 50,
) -> list[Recipe]:
    best_score = -1
    best_set: list[Recipe] | None = None
    for _ in range(candidates):
        selected_known = random.sample(known, min(known_count, len(known)))
        selected_try = random.sample(try_list, min(try_count, len(try_list)))
        selected = selected_known + selected_try
        score = _ingredient_overlap_score(selected)
        if score > best_score:
            best_score = score
            best_set = selected
    return best_set or []


def _ingredient_overlap_score(recipes: list[Recipe]) -> int:
    ingredient_counts: Counter[int] = Counter()
    for recipe in recipes:
        ingredient_ids = set(recipe.ingredients.values_list("ingredient_id", flat=True))
        for ing_id in ingredient_ids:
            ingredient_counts[ing_id] += 1
    return sum(count for count in ingredient_counts.values() if count > 1)


def _assign_schedule_lunch_only(
    iteration: PlanIteration,
    recipes: list[Recipe],
    start_date: date,
    days: int,
    servings: int,
    default_leftover_days: int,
) -> None:
    if not recipes:
        return

    schedule: dict[int, MealPlanEntry | None] = {i: None for i in range(days)}
    entries_to_create: list[MealPlanEntry] = []

    day_offset = 0
    recipe_idx = 0

    while recipe_idx < len(recipes) and day_offset < days:
        if schedule[day_offset] is not None:
            day_offset += 1
            continue

        recipe = recipes[recipe_idx]
        recipe_idx += 1

        entry = MealPlanEntry(
            iteration=iteration,
            date=start_date + timedelta(days=day_offset),
            meal_type="LUNCH",
            recipe=recipe,
            servings=servings,
            is_leftover=False,
        )
        entries_to_create.append(entry)
        schedule[day_offset] = entry

        leftover_days = recipe.leftover_days if recipe.leftover_days is not None else default_leftover_days
        if leftover_days > 0:
            placed = 0
            candidate = day_offset + 2
            while placed < leftover_days and candidate < days:
                if schedule[candidate] is None:
                    lo_entry = MealPlanEntry(
                        iteration=iteration,
                        date=start_date + timedelta(days=candidate),
                        meal_type="LUNCH",
                        recipe=recipe,
                        servings=servings,
                        is_leftover=True,
                        source_entry=entry,
                    )
                    entries_to_create.append(lo_entry)
                    schedule[candidate] = lo_entry
                    placed += 1
                    candidate += 2
                else:
                    candidate += 1

        day_offset += 1

    # Fill remaining empty slots
    all_recipes = list(recipes)
    fill_idx = 0
    for d in range(days):
        if schedule[d] is None and all_recipes:
            recipe = all_recipes[fill_idx % len(all_recipes)]
            fill_idx += 1
            entry = MealPlanEntry(
                iteration=iteration,
                date=start_date + timedelta(days=d),
                meal_type="LUNCH",
                recipe=recipe,
                servings=servings,
                is_leftover=False,
            )
            entries_to_create.append(entry)

    # Need to save cooking entries first so leftovers can reference them
    cooking_entries = [e for e in entries_to_create if not e.is_leftover]
    MealPlanEntry.objects.bulk_create(cooking_entries)

    leftover_entries = [e for e in entries_to_create if e.is_leftover]
    MealPlanEntry.objects.bulk_create(leftover_entries)
```

**Step 4: Run tests**

```bash
pytest backend/planner/tests/test_services.py -v
```

Expected: All pass.

**Step 5: Commit**

```bash
git add backend/planner/services.py backend/planner/tests/test_services.py
git commit -m "feat: rework plan generation for iteration model with duplicate avoidance"
```

---

### Task 6: Rework Shopping List Service

**Files:**
- Modify: `backend/shopping/services.py`
- Modify: `backend/shopping/schemas.py`

**Step 1: Write failing tests**

Create `backend/shopping/tests/test_services.py` (or add to existing):

```python
import pytest
from datetime import date
from decimal import Decimal

from planner.models import MealPlan, PlanIteration, MealPlanEntry
from shopping.models import ShoppingList
from shopping.services import generate_shopping_lists_for_iteration
from recipes.models import Recipe, Ingredient, Unit, RecipeIngredient


@pytest.fixture
def setup_iteration(auth_client):
    """Create a plan with an iteration and recipe entries."""
    _, household = auth_client
    ingredient = Ingredient.objects.create(name_en="Tomato", name_de="Tomate", category="PRODUCE")
    unit = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")
    recipe = Recipe.objects.create(
        household=household, title="Test Recipe", list_type="KNOWN", default_servings=2
    )
    RecipeIngredient.objects.create(recipe=recipe, ingredient=ingredient, quantity=100, unit=unit, order=1)

    plan = MealPlan.objects.create(
        household=household,
        iteration_weeks=1,
        shopping_days=[5],  # Saturday
        servings=2,
        known_ratio=0.7,
        default_leftover_days=1,
    )
    iteration = PlanIteration.objects.create(
        meal_plan=plan,
        start_date=date(2026, 2, 28),  # Saturday
        end_date=date(2026, 3, 6),     # Friday
        status="ACTIVE",
    )
    # Create entries for each day
    for i in range(7):
        MealPlanEntry.objects.create(
            iteration=iteration,
            date=date(2026, 2, 28) + __import__("datetime").timedelta(days=i),
            meal_type="LUNCH",
            recipe=recipe,
            servings=2,
            is_leftover=(i % 2 == 1),
        )
    return iteration, plan


@pytest.mark.django_db
class TestGenerateShoppingListsForIteration:
    def test_creates_one_list_per_segment(self, setup_iteration):
        iteration, plan = setup_iteration
        generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        lists = ShoppingList.objects.filter(iteration=iteration)
        assert lists.count() == 1  # 1-week, 1 shopping day = 1 list

    def test_shopping_date_set(self, setup_iteration):
        iteration, plan = setup_iteration
        generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        sl = ShoppingList.objects.filter(iteration=iteration).first()
        assert sl.shopping_date == date(2026, 2, 28)

    def test_only_non_leftover_entries(self, setup_iteration):
        iteration, plan = setup_iteration
        generate_shopping_lists_for_iteration(iteration, plan.shopping_days)
        sl = ShoppingList.objects.filter(iteration=iteration).first()
        # 4 non-leftover entries out of 7 (days 0, 2, 4, 6)
        assert sl.items.count() == 1  # All same ingredient, aggregated to 1 item
```

**Step 2: Run tests to verify they fail**

```bash
pytest backend/shopping/tests/test_services.py -v
```

**Step 3: Rewrite shopping/services.py**

```python
from collections import defaultdict
from decimal import Decimal

from planner.iteration_utils import compute_shopping_segments
from planner.models import PlanIteration
from shopping.models import ShoppingList, ShoppingListItem


def generate_shopping_lists_for_iteration(
    iteration: PlanIteration, shopping_days: list[int]
) -> list[ShoppingList]:
    """Generate one shopping list per shopping segment within an iteration."""
    iteration.shopping_lists.all().delete()

    segments = compute_shopping_segments(
        iteration.start_date, iteration.end_date, shopping_days
    )

    created_lists: list[ShoppingList] = []
    for seg_start, shopping_date, seg_end in segments:
        entries = iteration.entries.filter(
            date__gte=seg_start, date__lte=seg_end, is_leftover=False
        )
        shopping_list = _create_shopping_list_for_entries(iteration, shopping_date, entries)
        created_lists.append(shopping_list)

    return created_lists


def _create_shopping_list_for_entries(iteration, shopping_date, entries) -> ShoppingList:
    """Aggregate ingredients from entries into a shopping list."""
    aggregated: dict[tuple[int, int], Decimal] = defaultdict(Decimal)

    for entry in entries:
        scale = Decimal(entry.servings) / Decimal(entry.recipe.default_servings)
        for ri in entry.recipe.ingredients.all():
            scaled_quantity = Decimal(str(ri.quantity)) * scale
            base_quantity = ri.unit.to_base(scaled_quantity)
            base_unit = ri.unit.base_unit or ri.unit
            key = (ri.ingredient_id, base_unit.pk)
            aggregated[key] += base_quantity

    shopping_list = ShoppingList.objects.create(
        iteration=iteration,
        shopping_date=shopping_date,
    )
    items = [
        ShoppingListItem(
            shopping_list=shopping_list,
            ingredient_id=ingredient_id,
            quantity=quantity,
            unit_id=unit_id,
        )
        for (ingredient_id, unit_id), quantity in aggregated.items()
    ]
    ShoppingListItem.objects.bulk_create(items)

    return shopping_list


# Keep backward-compatible function for any other callers
def generate_shopping_list(meal_plan) -> ShoppingList:
    """Legacy wrapper — generates for the active iteration."""
    iteration = meal_plan.iterations.filter(status="ACTIVE").first()
    if not iteration:
        raise ValueError("No active iteration found")
    lists = generate_shopping_lists_for_iteration(iteration, meal_plan.shopping_days)
    return lists[0] if lists else None
```

**Step 4: Run tests**

```bash
pytest backend/shopping/tests/test_services.py -v
```

**Step 5: Commit**

```bash
git add backend/shopping/services.py backend/shopping/tests/test_services.py
git commit -m "feat: shopping list generation per iteration segment"
```

---

### Task 7: Rework API Endpoints + Schemas

**Files:**
- Modify: `backend/planner/api.py`
- Modify: `backend/planner/schemas.py`
- Modify: `backend/shopping/api.py`
- Modify: `backend/shopping/schemas.py`

**Step 1: Rewrite planner schemas**

`backend/planner/schemas.py`:

```python
from datetime import date, datetime
from uuid import UUID

from ninja import Schema


class SetupPlanIn(Schema):
    iteration_weeks: int = 1
    shopping_days: list[int]
    servings: int = 2
    known_ratio: float = 0.7
    default_leftover_days: int = 1
    start_date: date


class MealPlanEntryOut(Schema):
    id: UUID
    date: date
    meal_type: str
    recipe: UUID
    servings: int
    is_leftover: bool
    source_entry: UUID | None = None
    is_locked: bool


class PlanIterationOut(Schema):
    id: UUID
    start_date: date
    end_date: date
    status: str
    entries: list[MealPlanEntryOut]
    created_at: datetime


class MealPlanOut(Schema):
    id: UUID
    iteration_weeks: int
    shopping_days: list[int]
    servings: int
    known_ratio: float
    default_leftover_days: int
    iterations: list[PlanIterationOut]
    created_at: datetime
```

**Step 2: Rewrite planner API**

`backend/planner/api.py`:

```python
from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router

from users.permissions import require_household_member

from .models import MealPlan, PlanIteration
from .schemas import MealPlanOut, PlanIterationOut, SetupPlanIn
from .services import generate_next_iteration, renew_iteration, setup_meal_plan

router = Router(tags=["meal-plans"])


@router.post("/setup/", response={201: MealPlanOut})
def setup_plan(request, payload: SetupPlanIn):
    require_household_member(request)
    plan = setup_meal_plan(
        household=request.user.active_household,
        iteration_weeks=payload.iteration_weeks,
        shopping_days=payload.shopping_days,
        servings=payload.servings,
        known_ratio=payload.known_ratio,
        default_leftover_days=payload.default_leftover_days,
        start_date=payload.start_date,
    )
    return 201, plan


@router.get("/", response=list[MealPlanOut])
def list_plans(request):
    require_household_member(request)
    return MealPlan.objects.filter(household=request.user.active_household)


@router.get("/{plan_id}/", response=MealPlanOut)
def get_plan(request, plan_id: UUID):
    require_household_member(request)
    return get_object_or_404(MealPlan, id=plan_id, household=request.user.active_household)


@router.post("/iterations/{iteration_id}/renew/", response={200: PlanIterationOut})
def renew(request, iteration_id: UUID):
    require_household_member(request)
    iteration = get_object_or_404(
        PlanIteration,
        id=iteration_id,
        meal_plan__household=request.user.active_household,
    )
    renewed = renew_iteration(iteration)
    return renewed


@router.post("/iterations/next/", response={201: PlanIterationOut})
def next_iteration(request):
    require_household_member(request)
    plan = get_object_or_404(MealPlan, household=request.user.active_household)
    iteration = generate_next_iteration(plan)
    return 201, iteration
```

**Step 3: Update shopping schemas**

`backend/shopping/schemas.py` — change `meal_plan` to `iteration` and add `shopping_date`:

```python
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from ninja import Schema


class ShoppingListItemOut(Schema):
    id: UUID
    ingredient_name: str
    ingredient_category: str
    quantity: Decimal
    unit_abbreviation: str
    is_checked: bool

    @staticmethod
    def resolve_ingredient_name(obj):
        return obj.ingredient.name_en

    @staticmethod
    def resolve_ingredient_category(obj):
        return obj.ingredient.category

    @staticmethod
    def resolve_unit_abbreviation(obj):
        return obj.unit.abbreviation


class ShoppingListOut(Schema):
    id: UUID
    iteration: UUID
    shopping_date: date | None
    items: list[ShoppingListItemOut]
    created_at: datetime


class BulkToggleIn(Schema):
    item_ids: list[UUID]
    is_checked: bool
```

**Step 4: Update shopping API**

In `backend/shopping/api.py`, update the list endpoint to filter by `iteration__meal_plan__household` instead of `meal_plan__household`, and remove the generate endpoint (generation is handled by planner service now):

Replace the `list_shopping_lists` query filter and the `generate_shopping_list` endpoint. Keep toggle/bulk-toggle endpoints as-is but update any `meal_plan` references to `iteration`.

**Step 5: Run all tests**

```bash
pytest backend/ -v
```

Fix any import errors or FK reference issues.

**Step 6: Commit**

```bash
git add backend/planner/api.py backend/planner/schemas.py backend/shopping/api.py backend/shopping/schemas.py
git commit -m "feat: rework API endpoints for iteration-based meal plans"
```

---

### Task 8: Fix Existing Tests

**Files:**
- Modify: `backend/planner/tests/test_api.py`
- Modify: `backend/planner/tests/test_generator.py`

**Step 1: Update test_api.py**

Rewrite tests to use the new `/setup/` endpoint instead of `/generate/`. Update assertions for the new response shape (plan has `iterations` array instead of `entries` directly). Update all references from `meal_plan` FK to `iteration` FK.

Key changes:
- `POST /api/v1/meal-plans/generate/` → `POST /api/v1/meal-plans/setup/`
- Payload: `{ start_date, days, servings, ... }` → `{ start_date, iteration_weeks, shopping_days, servings, ... }`
- Response: `plan.entries` → `plan.iterations[0].entries`
- Shopping list: `sl.meal_plan` → `sl.iteration`

**Step 2: Update test_generator.py**

Update to call `setup_meal_plan()` instead of `generate_meal_plan()`. Adjust assertions for iteration model.

**Step 3: Run tests**

```bash
pytest backend/ -v
```

Expected: All pass.

**Step 4: Commit**

```bash
git add backend/planner/tests/
git commit -m "fix: update existing tests for iteration model"
```

---

### Task 9: Frontend Types + Hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/hooks/useMealPlan.ts`
- Modify: `frontend/src/hooks/useShoppingList.ts`

**Step 1: Update types.ts**

Add/modify these types:

```typescript
export interface MealPlanEntry {
  id: string;
  date: string;
  meal_type: MealType;
  recipe: string;
  servings: number;
  is_leftover: boolean;
  source_entry: string | null;
  is_locked: boolean;
}

export interface PlanIteration {
  id: string;
  start_date: string;
  end_date: string;
  status: "ACTIVE" | "ARCHIVED";
  entries: MealPlanEntry[];
  created_at: string;
}

export interface MealPlan {
  id: string;
  iteration_weeks: number;
  shopping_days: number[];
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
  iterations: PlanIteration[];
  created_at: string;
}

export interface ShoppingListItem {
  id: string;
  ingredient_name: string;
  ingredient_category: IngredientCategory;
  quantity: number;
  unit_abbreviation: string;
  is_checked: boolean;
}

export interface ShoppingList {
  id: string;
  iteration: string;
  shopping_date: string | null;
  items: ShoppingListItem[];
  created_at: string;
}
```

Remove `start_date` and `end_date` from `MealPlan`. Remove `entries` from `MealPlan` (they're on `PlanIteration` now).

**Step 2: Update useMealPlan.ts**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { MealPlan, PlanIteration } from "../api/types";

interface SetupPlanPayload {
  iteration_weeks: number;
  shopping_days: number[];
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
  start_date: string;
}

export function useMealPlans() {
  return useQuery<MealPlan[]>({
    queryKey: ["meal-plans"],
    queryFn: () => api.get<MealPlan[]>("/api/v1/meal-plans/"),
  });
}

export function useMealPlan(id: string | undefined) {
  return useQuery<MealPlan>({
    queryKey: ["meal-plans", id],
    queryFn: () => api.get<MealPlan>(`/api/v1/meal-plans/${id}/`),
    enabled: !!id,
  });
}

export function useSetupPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SetupPlanPayload) =>
      api.post<MealPlan>("/api/v1/meal-plans/setup/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}

export function useRenewIteration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (iterationId: string) =>
      api.post<PlanIteration>(`/api/v1/meal-plans/iterations/${iterationId}/renew/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}

export function useNextIteration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<PlanIteration>("/api/v1/meal-plans/iterations/next/"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}
```

**Step 3: Update useShoppingList.ts**

Update the `ShoppingList` type import (already updated in types.ts). No hook logic changes needed since endpoints stay the same.

**Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/useMealPlan.ts frontend/src/hooks/useShoppingList.ts
git commit -m "feat: update frontend types and hooks for iteration model"
```

---

### Task 10: Rework GenerateDrawer

**Files:**
- Modify: `frontend/src/components/GenerateDrawer.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add new i18n keys**

Add to the `plan` section of both locale files:

English:
```json
"iterationWeeks": "Iteration length",
"weeks_one": "{{count}} week",
"weeks_other": "{{count}} weeks",
"shoppingDays": "Shopping days",
"weekdays": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
"shoppingDaysTooClose": "Shopping days must be at least 3 days apart",
"startDate": "Start date",
"setup": "Set up plan",
"updateConfig": "Update plan"
```

German:
```json
"iterationWeeks": "Iterationslänge",
"weeks_one": "{{count}} Woche",
"weeks_other": "{{count}} Wochen",
"shoppingDays": "Einkaufstage",
"weekdays": ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
"shoppingDaysTooClose": "Einkaufstage müssen mindestens 3 Tage auseinander liegen",
"startDate": "Startdatum",
"setup": "Plan einrichten",
"updateConfig": "Plan aktualisieren"
```

**Step 2: Rewrite GenerateDrawer**

Replace with new config fields: iteration_weeks toggle (1/2/3), weekday picker for shopping days (with validation), servings, known ratio, leftover days, start date. The drawer calls `useSetupPlan()` instead of `useGeneratePlan()`.

Key UI elements:
- **Iteration length:** 3 toggle buttons (1, 2, 3 weeks)
- **Shopping days:** 7 weekday buttons (tap to toggle, max 2, validate 3-day gap)
- **Start date:** native date input
- **Servings, ratio, leftover days:** same controls as before

The drawer accepts an optional `existingPlan` prop to pre-fill values when editing config.

**Step 3: Commit**

```bash
git add frontend/src/components/GenerateDrawer.tsx frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: rework GenerateDrawer for iteration config"
```

---

### Task 11: Rework MealPlanPage + Create IterationCard

**Files:**
- Modify: `frontend/src/pages/MealPlanPage.tsx`
- Create: `frontend/src/components/IterationCard.tsx`
- Modify: `frontend/src/components/PlanGrid.tsx` → rename/repurpose

**Step 1: Create IterationCard component**

`frontend/src/components/IterationCard.tsx` — extracts the per-iteration display from PlanGrid:

- Props: `iteration: PlanIteration`, `shoppingDays: number[]`, `isArchived: boolean`, `onRenew?: () => void`
- Header: date range formatted + renew button (if not archived)
- Day cards: same as current PlanGrid but with shopping day highlighting
- Shopping day cards: shopping cart icon + link to shopping list for that segment
- Today highlight: same orange styling
- If archived: collapsed by default, expand on click, no renew button

**Step 2: Rework MealPlanPage**

```typescript
export default function MealPlanPage() {
  const { t } = useTranslation();
  const { data: plans, isLoading } = useMealPlans();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const renewMutation = useRenewIteration();
  const nextMutation = useNextIteration();

  const plan = plans?.[0] ?? null;

  // Separate active and archived iterations
  const activeIteration = plan?.iterations.find((i) => i.status === "ACTIVE") ?? null;
  const archivedIterations = plan?.iterations.filter((i) => i.status === "ARCHIVED") ?? [];

  // Check if active iteration has ended
  const today = new Date().toISOString().split("T")[0];
  const iterationEnded = activeIteration && activeIteration.end_date < today;

  return (
    <div className="p-4">
      {/* Header with config button */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("plan.title")}</h1>
        {plan && (
          <button onClick={() => setDrawerOpen(true)} className="...gear icon button...">
            {/* gear/cog SVG icon */}
          </button>
        )}
      </div>

      {/* Empty state — no plan at all */}
      {!isLoading && !plan && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">{t("plan.noPlan")}</p>
          <button onClick={() => setDrawerOpen(true)} className="...">
            {t("plan.setup")}
          </button>
        </div>
      )}

      {/* Next iteration prompt */}
      {iterationEnded && (
        <div className="mb-4 rounded-lg border-2 border-dashed border-orange-300 bg-orange-50 p-6 text-center">
          <p className="text-gray-600">{t("plan.iterationEnded")}</p>
          <button onClick={() => nextMutation.mutate()} className="...">
            {t("plan.generateNext")}
          </button>
        </div>
      )}

      {/* Active iteration */}
      {activeIteration && !iterationEnded && (
        <IterationCard
          iteration={activeIteration}
          shoppingDays={plan!.shopping_days}
          isArchived={false}
          onRenew={() => renewMutation.mutate(activeIteration.id)}
        />
      )}

      {/* Archived iterations — accordion */}
      {archivedIterations.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">{t("plan.pastIterations")}</h2>
          {archivedIterations.map((iter) => (
            <IterationCard
              key={iter.id}
              iteration={iter}
              shoppingDays={plan!.shopping_days}
              isArchived={true}
            />
          ))}
        </div>
      )}

      <GenerateDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        existingPlan={plan}
      />
    </div>
  );
}
```

**Step 3: Add i18n keys**

English:
```json
"iterationEnded": "Your current plan has ended.",
"generateNext": "Generate next iteration",
"pastIterations": "Past iterations",
"renew": "Renew"
```

German:
```json
"iterationEnded": "Dein aktueller Plan ist abgelaufen.",
"generateNext": "Nächste Iteration erstellen",
"pastIterations": "Vergangene Iterationen",
"renew": "Erneuern"
```

**Step 4: Delete or repurpose PlanGrid.tsx**

Remove `PlanGrid.tsx` since its functionality is now in `IterationCard.tsx`.

**Step 5: Commit**

```bash
git add frontend/src/pages/MealPlanPage.tsx frontend/src/components/IterationCard.tsx frontend/src/i18n/en.json frontend/src/i18n/de.json
git rm frontend/src/components/PlanGrid.tsx
git commit -m "feat: rework MealPlanPage with iteration cards and accordion"
```

---

### Task 12: Shopping Day Highlighting in IterationCard

**Files:**
- Modify: `frontend/src/components/IterationCard.tsx`

**Step 1: Add shopping day detection**

In the day card rendering loop, check if the date's weekday matches any configured shopping day. If so, add visual markers:

- Blue-tinted left border or top accent
- Shopping cart icon next to the date
- Link to the corresponding shopping list

Compute which shopping list corresponds to each shopping day by matching `shopping_date` from the `ShoppingList` objects.

**Step 2: Commit**

```bash
git add frontend/src/components/IterationCard.tsx
git commit -m "feat: highlight shopping days in iteration cards"
```

---

### Task 13: End-to-End Testing

**Files:**
- Modify: `backend/planner/tests/test_api.py`

**Step 1: Write API integration tests for new endpoints**

```python
@pytest.mark.django_db
class TestSetupEndpoint:
    def test_setup_creates_plan_and_iteration(self, auth_client):
        client, household = auth_client
        _create_recipes(household)
        response = client.post(
            "/api/v1/meal-plans/setup/",
            json.dumps({
                "iteration_weeks": 1,
                "shopping_days": [5],
                "servings": 2,
                "known_ratio": 0.7,
                "default_leftover_days": 1,
                "start_date": "2026-02-28",
            }),
            content_type="application/json",
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["iterations"]) == 1
        assert data["iteration_weeks"] == 1
        assert data["shopping_days"] == [5]

    def test_setup_unauthenticated(self, client):
        response = client.post("/api/v1/meal-plans/setup/", "{}", content_type="application/json")
        assert response.status_code == 401


@pytest.mark.django_db
class TestRenewEndpoint:
    def test_renew_iteration(self, auth_client):
        client, household = auth_client
        _create_recipes(household)
        # Setup first
        response = client.post(
            "/api/v1/meal-plans/setup/",
            json.dumps({
                "iteration_weeks": 1,
                "shopping_days": [5],
                "servings": 2,
                "known_ratio": 0.7,
                "default_leftover_days": 1,
                "start_date": "2026-02-28",
            }),
            content_type="application/json",
        )
        iteration_id = response.json()["iterations"][0]["id"]
        # Renew
        response = client.post(
            f"/api/v1/meal-plans/iterations/{iteration_id}/renew/",
            content_type="application/json",
        )
        assert response.status_code == 200


@pytest.mark.django_db
class TestNextIterationEndpoint:
    def test_generates_next(self, auth_client):
        client, household = auth_client
        _create_recipes(household)
        # Setup first
        client.post(
            "/api/v1/meal-plans/setup/",
            json.dumps({
                "iteration_weeks": 1,
                "shopping_days": [5],
                "servings": 2,
                "known_ratio": 0.7,
                "default_leftover_days": 1,
                "start_date": "2026-02-28",
            }),
            content_type="application/json",
        )
        # Next
        response = client.post(
            "/api/v1/meal-plans/iterations/next/",
            content_type="application/json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "ACTIVE"
        assert data["start_date"] == "2026-03-07"  # Week after Feb 28
```

**Step 2: Run all tests**

```bash
pytest backend/ -v
```

**Step 3: Run frontend lint + typecheck**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add backend/planner/tests/test_api.py
git commit -m "test: add API integration tests for iteration endpoints"
```

---

### Task 14: Final Cleanup

**Step 1: Run all linters**

```bash
ruff check backend/ --fix && ruff format backend/
cd frontend && npm run lint -- --fix
```

**Step 2: Run full test suite**

```bash
pytest backend/ -v
cd frontend && npm test
```

**Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes"
```
