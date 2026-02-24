# Plan Page Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the meal plan page to merge duplicate buttons, show lunch-only with static "Kaltes Essen" dinner, add shopping list preview on day 1, make day cards clickable to recipe details, and add configurable leftover spacing.

**Architecture:** Modify the existing PlanGrid/MealPlanPage in-place. Add `leftover_days` field to Recipe model. Rework the generation algorithm to only plan lunch slots with non-consecutive leftover spacing. Frontend shows shopping preview on day 1 and navigates to recipe detail on click.

**Tech Stack:** Django 5.1 + Django Ninja (backend), React 19 + TypeScript + TanStack Query + Tailwind CSS (frontend)

---

### Task 1: Add `leftover_days` field to Recipe model

**Files:**
- Modify: `backend/recipes/models.py:49-66` (Recipe model)
- Create: migration via `makemigrations`

**Step 1: Write the failing test**

Add to `backend/planner/tests/test_generator.py`:

```python
@pytest.mark.django_db
def test_recipe_leftover_days_default():
    household = Household.objects.create(name="Home")
    recipe = Recipe.objects.create(
        household=household, title="Test", list_type="KNOWN", default_servings=2
    )
    assert recipe.leftover_days == 1
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/planner/tests/test_generator.py::test_recipe_leftover_days_default -v`
Expected: FAIL with `AttributeError: 'Recipe' object has no attribute 'leftover_days'`

**Step 3: Add the field to Recipe model**

In `backend/recipes/models.py`, add after `cook_time_minutes` (line 60):

```python
leftover_days = models.PositiveIntegerField(default=1)
```

**Step 4: Create and run migration**

Run: `cd backend && python manage.py makemigrations recipes && python manage.py migrate`

**Step 5: Run test to verify it passes**

Run: `pytest backend/planner/tests/test_generator.py::test_recipe_leftover_days_default -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/recipes/models.py backend/recipes/migrations/
git commit -m "feat: add leftover_days field to Recipe model"
```

---

### Task 2: Expose `leftover_days` in recipe schemas

**Files:**
- Modify: `backend/recipes/schemas.py:50-70` (RecipeOut)
- Modify: `backend/recipes/schemas.py:84-93` (RecipeCreateIn)
- Modify: `frontend/src/api/types.ts:78-90` (Recipe interface)

**Step 1: Write the failing test**

Add to `backend/recipes/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_recipe_includes_leftover_days(auth_client):
    client, household = auth_client
    response = client.post(
        "/api/v1/recipes/",
        json.dumps({
            "title": "Test",
            "list_type": "KNOWN",
            "default_servings": 2,
            "leftover_days": 3,
        }),
        content_type="application/json",
    )
    assert response.status_code == 201
    data = response.json()
    assert data["leftover_days"] == 3
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_api.py::test_recipe_includes_leftover_days -v`
Expected: FAIL — `leftover_days` not in response or not accepted in input

**Step 3: Update schemas**

In `backend/recipes/schemas.py`, add to `RecipeOut` after `cook_time_minutes` (line 56):

```python
leftover_days: int
```

In `RecipeCreateIn` after `cook_time_minutes` (line 90):

```python
leftover_days: int = 1
```

**Step 4: Run test to verify it passes**

Run: `pytest backend/recipes/tests/test_api.py::test_recipe_includes_leftover_days -v`
Expected: PASS

**Step 5: Update frontend type**

In `frontend/src/api/types.ts`, add to `Recipe` interface after `cook_time_minutes` (line 85):

```typescript
leftover_days: number;
```

In `RecipeUpdatePayload` after `cook_time_minutes` (line 110):

```typescript
leftover_days: number;
```

**Step 6: Commit**

```bash
git add backend/recipes/schemas.py frontend/src/api/types.ts
git commit -m "feat: expose leftover_days in recipe API and frontend types"
```

---

### Task 3: Add `default_leftover_days` to generate endpoint

**Files:**
- Modify: `backend/planner/schemas.py:34-38` (GeneratePlanIn)
- Modify: `backend/planner/api.py:16-26` (generate_plan view)
- Modify: `backend/planner/services.py:9` (generate_meal_plan signature)

**Step 1: Write the failing test**

Add to `backend/planner/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_generate_plan_accepts_default_leftover_days(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({
            "start_date": "2026-03-01",
            "days": 7,
            "servings": 2,
            "default_leftover_days": 2,
        }),
        content_type="application/json",
    )
    assert response.status_code == 201
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/planner/tests/test_api.py::test_generate_plan_accepts_default_leftover_days -v`
Expected: FAIL — 422 validation error, unknown field

**Step 3: Update schema and API**

In `backend/planner/schemas.py` `GeneratePlanIn`, add:

```python
default_leftover_days: int = 1
```

In `backend/planner/api.py` `generate_plan`, pass the new param:

```python
plan = generate_meal_plan(
    household=request.user.active_household,
    start_date=payload.start_date,
    days=payload.days,
    servings=payload.servings,
    known_ratio=payload.known_ratio,
    default_leftover_days=payload.default_leftover_days,
)
```

In `backend/planner/services.py` `generate_meal_plan` signature, add:

```python
def generate_meal_plan(household, start_date, days=7, servings=2, known_ratio=0.7, default_leftover_days=1):
```

(The parameter is accepted but not yet used — that comes in Task 4.)

**Step 4: Run test to verify it passes**

Run: `pytest backend/planner/tests/test_api.py::test_generate_plan_accepts_default_leftover_days -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/planner/schemas.py backend/planner/api.py backend/planner/services.py
git commit -m "feat: accept default_leftover_days in generate endpoint"
```

---

### Task 4: Rework generation algorithm — lunch-only with spaced leftovers

**Files:**
- Modify: `backend/planner/services.py:9-167` (full rewrite of generate + _assign_schedule)

**Step 1: Write failing tests for new behavior**

Replace the existing tests in `backend/planner/tests/test_generator.py` with updated ones. Add these new tests:

```python
@pytest.mark.django_db
def test_generate_plan_lunch_only():
    """Plan should only create LUNCH entries, no DINNER."""
    household = Household.objects.create(name="Home")
    _create_recipes(household)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=7,
        servings=2,
    )
    entries = plan.entries.all()
    meal_types = {e.meal_type for e in entries}
    assert meal_types == {"LUNCH"}


@pytest.mark.django_db
def test_generate_plan_leftovers_not_consecutive():
    """Leftover of a recipe should not appear on the day immediately after cooking."""
    household = Household.objects.create(name="Home")
    _create_recipes(household, known=10, to_try=5)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=14,
        servings=2,
    )
    leftover_entries = plan.entries.filter(is_leftover=True)
    for entry in leftover_entries:
        source = entry.source_entry
        assert source is not None
        day_gap = (entry.date - source.date).days
        assert day_gap >= 2, f"Leftover on {entry.date} is only {day_gap} day(s) after cooking on {source.date}"


@pytest.mark.django_db
def test_generate_plan_uses_recipe_leftover_days():
    """Recipes with leftover_days=0 should produce no leftover entries."""
    household = Household.objects.create(name="Home")
    recipes = _create_recipes(household, known=5, to_try=3)
    # Set all recipes to 0 leftover days
    for r in recipes:
        r.leftover_days = 0
        r.save()
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=7,
        servings=2,
    )
    leftover_entries = plan.entries.filter(is_leftover=True)
    assert leftover_entries.count() == 0


@pytest.mark.django_db
def test_generate_plan_default_leftover_days_override():
    """default_leftover_days should apply to recipes without explicit leftover_days."""
    household = Household.objects.create(name="Home")
    recipes = _create_recipes(household, known=5, to_try=3)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=14,
        servings=2,
        default_leftover_days=2,
    )
    # With default_leftover_days=2, each recipe produces 2 leftover entries
    cooking_entries = plan.entries.filter(is_leftover=False)
    leftover_entries = plan.entries.filter(is_leftover=True)
    # Each cooking entry should have up to 2 leftovers
    for ce in cooking_entries:
        lo_count = leftover_entries.filter(source_entry=ce).count()
        assert lo_count <= 2
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/planner/tests/test_generator.py -v`
Expected: Multiple failures — DINNER entries exist, leftovers may be consecutive

**Step 3: Rewrite the generation algorithm**

Replace the full content of `backend/planner/services.py`:

```python
import random
from collections import Counter
from datetime import timedelta

from planner.models import MealPlan, MealPlanEntry
from recipes.models import Recipe


def generate_meal_plan(
    household, start_date, days=7, servings=2, known_ratio=0.7, default_leftover_days=1
):
    # Calculate how many unique recipes we need
    # Each recipe fills 1 cooking slot + leftover_days leftover slots
    avg_leftover = default_leftover_days  # approximate for slot calculation
    slots_per_recipe = 1 + avg_leftover
    total_lunch_slots = days
    cooking_sessions = max(total_lunch_slots // slots_per_recipe, 1)

    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    known_recipes = list(Recipe.objects.filter(household=household, list_type="KNOWN"))
    try_recipes = list(Recipe.objects.filter(household=household, list_type="TO_TRY"))

    best_set = _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)

    plan = MealPlan.objects.create(
        household=household,
        start_date=start_date,
        end_date=start_date + timedelta(days=days - 1),
    )
    _assign_schedule_lunch_only(plan, best_set, start_date, days, servings, default_leftover_days)
    return plan


def _select_recipes_with_overlap(known, try_list, known_count, try_count, candidates=50):
    best_score = -1
    best_set = None
    for _ in range(candidates):
        selected_known = random.sample(known, min(known_count, len(known)))
        selected_try = random.sample(try_list, min(try_count, len(try_list)))
        selected = selected_known + selected_try
        score = _ingredient_overlap_score(selected)
        if score > best_score:
            best_score = score
            best_set = selected
    return best_set or []


def _ingredient_overlap_score(recipes):
    ingredient_counts: Counter[int] = Counter()
    for recipe in recipes:
        ingredient_ids = set(recipe.ingredients.values_list("ingredient_id", flat=True))
        for ing_id in ingredient_ids:
            ingredient_counts[ing_id] += 1
    return sum(count for count in ingredient_counts.values() if count > 1)


def _assign_schedule_lunch_only(plan, recipes, start_date, days, servings, default_leftover_days):
    """Assign recipes to lunch slots only. Spread leftovers non-consecutively."""
    # Build list of available dates (lunch only)
    dates = [start_date + timedelta(days=i) for i in range(days)]
    assigned = {}  # date -> (recipe, is_leftover, source_entry)

    random.shuffle(recipes)

    for recipe in recipes:
        leftover_count = recipe.leftover_days if recipe.leftover_days is not None else default_leftover_days

        # Find first free date for cooking
        cook_date = None
        for d in dates:
            if d not in assigned:
                cook_date = d
                break
        if cook_date is None:
            break

        # Assign cooking entry
        cooking_entry = MealPlanEntry.objects.create(
            meal_plan=plan,
            date=cook_date,
            meal_type="LUNCH",
            recipe=recipe,
            servings=servings,
            is_leftover=False,
        )
        assigned[cook_date] = cooking_entry

        # Assign leftover entries: skip at least 1 day after cooking, then non-consecutive
        placed_leftovers = 0
        last_placed_date = cook_date
        for d in dates:
            if placed_leftovers >= leftover_count:
                break
            if d in assigned:
                continue
            # Must be at least 2 days after cooking and at least 2 days after last placed leftover
            if (d - cook_date).days < 2:
                continue
            if (d - last_placed_date).days < 2:
                continue
            MealPlanEntry.objects.create(
                meal_plan=plan,
                date=d,
                meal_type="LUNCH",
                recipe=recipe,
                servings=servings,
                is_leftover=True,
                source_entry=cooking_entry,
            )
            assigned[d] = True
            last_placed_date = d
            placed_leftovers += 1

    # Fill any remaining empty dates with additional recipes
    empty_dates = [d for d in dates if d not in assigned]
    if empty_dates:
        all_recipes = list(
            Recipe.objects.filter(household=plan.household).exclude(
                id__in=[r.id for r in recipes]
            )
        )
        if not all_recipes:
            all_recipes = list(Recipe.objects.filter(household=plan.household))
        random.shuffle(all_recipes)
        recipe_cycle = all_recipes * ((len(empty_dates) // max(len(all_recipes), 1)) + 1)
        for i, d in enumerate(empty_dates):
            if i < len(recipe_cycle):
                MealPlanEntry.objects.create(
                    meal_plan=plan,
                    date=d,
                    meal_type="LUNCH",
                    recipe=recipe_cycle[i],
                    servings=servings,
                    is_leftover=False,
                )


def regenerate_meal_plan(plan, servings=None, known_ratio=0.7, default_leftover_days=1):
    """Regenerate a meal plan: delete all entries, recreate with lunch-only."""
    if servings is None:
        locked_entries = plan.entries.all()
        if locked_entries.exists():
            servings = locked_entries.order_by("-servings").first().servings
        else:
            servings = 2

    days = (plan.end_date - plan.start_date).days + 1

    # Delete all entries and regenerate
    plan.entries.all().delete()

    known_recipes = list(Recipe.objects.filter(household=plan.household, list_type="KNOWN"))
    try_recipes = list(Recipe.objects.filter(household=plan.household, list_type="TO_TRY"))

    avg_leftover = default_leftover_days
    slots_per_recipe = 1 + avg_leftover
    cooking_sessions = max(days // slots_per_recipe, 1)
    known_count = round(cooking_sessions * known_ratio)
    try_count = cooking_sessions - known_count

    recipes = _select_recipes_with_overlap(known_recipes, try_recipes, known_count, try_count)
    _assign_schedule_lunch_only(plan, recipes, plan.start_date, days, servings, default_leftover_days)
    return plan
```

**Step 4: Update existing tests that expect DINNER entries**

In `backend/planner/tests/test_generator.py`, update `test_generate_plan_fills_all_days`:

```python
@pytest.mark.django_db
def test_generate_plan_fills_all_days():
    household = Household.objects.create(name="Home")
    _create_recipes(household)
    plan = generate_meal_plan(
        household=household,
        start_date=date(2026, 3, 1),
        days=7,
        servings=2,
        known_ratio=0.7,
    )
    entries = plan.entries.all()
    dates_covered = {e.date for e in entries}
    assert len(dates_covered) == 7
    # All entries should be LUNCH only
    assert all(e.meal_type == "LUNCH" for e in entries)
```

In `backend/planner/tests/test_api.py`, update `test_regenerate_keeps_locked_entries` — the total entry count assertion `assert len(data["entries"]) == 14` needs to change to `== 7` (lunch only, 7 days). Also remove the lock-based regeneration test since we now delete all entries on regenerate. Update to:

```python
@pytest.mark.django_db
def test_regenerate_plan(auth_client):
    client, household = auth_client
    _create_recipes(household)
    gen_response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    plan_id = gen_response.json()["id"]

    response = client.post(f"/api/v1/meal-plans/{plan_id}/regenerate/")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == plan_id
    assert data["start_date"] == "2026-03-01"
    assert len(data["entries"]) == 7  # lunch only
    assert all(e["meal_type"] == "LUNCH" for e in data["entries"])
    assert MealPlan.objects.filter(household=household).count() == 1
```

Remove `test_regenerate_keeps_locked_entries` since we no longer support locked entries in the new design.

**Step 5: Run all planner tests**

Run: `pytest backend/planner/tests/ -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/planner/services.py backend/planner/tests/
git commit -m "feat: rework generation algorithm for lunch-only with spaced leftovers"
```

---

### Task 5: Delete old plan on new generation

**Files:**
- Modify: `backend/planner/services.py` (add delete in generate_meal_plan)

**Step 1: Write failing test**

Add to `backend/planner/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_generate_plan_replaces_old(auth_client):
    client, household = auth_client
    _create_recipes(household)
    # Generate first plan
    client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    assert MealPlan.objects.filter(household=household).count() == 1
    # Generate second plan
    client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-08", "days": 7}),
        content_type="application/json",
    )
    # Old plan should be deleted
    assert MealPlan.objects.filter(household=household).count() == 1
    plan = MealPlan.objects.get(household=household)
    assert str(plan.start_date) == "2026-03-08"
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/planner/tests/test_api.py::test_generate_plan_replaces_old -v`
Expected: FAIL — count is 2

**Step 3: Add deletion to generate_meal_plan**

In `backend/planner/services.py` `generate_meal_plan`, add before creating the new plan:

```python
# Delete existing plans for this household
MealPlan.objects.filter(household=household).delete()
```

**Step 4: Run test to verify it passes**

Run: `pytest backend/planner/tests/test_api.py::test_generate_plan_replaces_old -v`
Expected: PASS

**Step 5: Fix test_list_meal_plans**

The existing `test_list_meal_plans` creates two plans and expects both to exist. Update it since old plans are now deleted:

```python
@pytest.mark.django_db
def test_list_meal_plans(auth_client):
    client, household = auth_client
    _create_recipes(household)
    client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    response = client.get("/api/v1/meal-plans/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["start_date"] == "2026-03-01"
```

**Step 6: Run all tests**

Run: `pytest backend/planner/tests/ -v`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/planner/services.py backend/planner/tests/
git commit -m "feat: delete old plan when generating new one"
```

---

### Task 6: Refactor MealPlanPage — merge buttons, remove regenerate

**Files:**
- Modify: `frontend/src/pages/MealPlanPage.tsx:1-77`
- Modify: `frontend/src/i18n/de.json:96-115` (plan section)
- Modify: `frontend/src/i18n/en.json` (plan section)

**Step 1: Add i18n keys**

In `frontend/src/i18n/de.json`, add to the `plan` section:

```json
"newPlan": "Neu erstellen",
"coldDish": "Kaltes Essen",
"shoppingPreview": "{{count}} Artikel",
"leftovers": "Reste"
```

Add matching keys to `frontend/src/i18n/en.json`.

**Step 2: Rewrite MealPlanPage**

```typescript
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMealPlans } from "../hooks/useMealPlan";
import PlanGrid from "../components/PlanGrid";
import GenerateDrawer from "../components/GenerateDrawer";

export default function MealPlanPage() {
  const { t } = useTranslation();
  const { data: plans, isLoading } = useMealPlans();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentPlan = plans?.[0] ?? null;

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("plan.title")}</h1>
        {currentPlan && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {t("plan.newPlan")}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("common.loading")}</p>}

      {!isLoading && !currentPlan && (
        <div className="mt-12 text-center">
          <p className="text-gray-500">{t("plan.noPlan")}</p>
          <button
            onClick={() => setDrawerOpen(true)}
            className="mt-4 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {t("plan.generate")}
          </button>
        </div>
      )}

      {currentPlan && <PlanGrid plan={currentPlan} />}

      <GenerateDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
```

Key changes:
- Removed `useRegeneratePlan` import and usage
- Single "Neu erstellen" button in header (only when plan exists)
- Empty state keeps "Plan erstellen" button
- Removed `currentPlanId` prop from GenerateDrawer (no longer needed for shopping list button)
- Removed "week of" date line

**Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds (may have type errors from PlanGrid changes coming in next task)

**Step 4: Commit**

```bash
git add frontend/src/pages/MealPlanPage.tsx frontend/src/i18n/de.json frontend/src/i18n/en.json
git commit -m "feat: merge plan buttons into single Neu erstellen button"
```

---

### Task 7: Refactor GenerateDrawer — add default_leftover_days, remove shopping list button

**Files:**
- Modify: `frontend/src/components/GenerateDrawer.tsx:1-155`
- Modify: `frontend/src/hooks/useMealPlan.ts:5-10` (GeneratePlanPayload)

**Step 1: Update GeneratePlanPayload type**

In `frontend/src/hooks/useMealPlan.ts`, add to `GeneratePlanPayload`:

```typescript
interface GeneratePlanPayload {
  start_date: string;
  days: number;
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
}
```

**Step 2: Rewrite GenerateDrawer**

```typescript
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useGeneratePlan } from "../hooks/useMealPlan";

interface GenerateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function GenerateDrawer({ isOpen, onClose }: GenerateDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const generatePlan = useGeneratePlan();

  const defaults = user?.settings;
  const [days, setDays] = useState(defaults?.plan_days ?? 7);
  const [servings, setServings] = useState(defaults?.default_servings ?? 2);
  const [knownRatio, setKnownRatio] = useState(defaults?.known_new_ratio ?? 0.7);
  const [defaultLeftoverDays, setDefaultLeftoverDays] = useState(1);

  function handleGenerate() {
    generatePlan.mutate(
      {
        start_date: todayISO(),
        days,
        servings,
        known_ratio: knownRatio,
        default_leftover_days: defaultLeftoverDays,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-50 transform rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto max-w-lg px-6 pb-8 pt-4">
          <div className="mb-4 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          <h2 className="mb-6 text-lg font-semibold text-gray-900">{t("plan.newPlan")}</h2>

          {/* Days */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.days")}
            </label>
            <div className="flex gap-2">
              {[7, 14].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    days === d
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Servings */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.servings")}
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={servings}
              onChange={(e) => setServings(Number(e.target.value))}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Known/New Ratio */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.knownRatio")} — {Math.round(knownRatio * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={knownRatio}
              onChange={(e) => setKnownRatio(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>{t("recipes.toTry")}</span>
              <span>{t("recipes.known")}</span>
            </div>
          </div>

          {/* Default Leftover Days */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("plan.defaultLeftoverDays")}
            </label>
            <input
              type="number"
              min={0}
              max={3}
              value={defaultLeftoverDays}
              onChange={(e) => setDefaultLeftoverDays(Number(e.target.value))}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={generatePlan.isPending}
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {generatePlan.isPending ? t("common.loading") : t("plan.newPlan")}
          </button>
        </div>
      </div>
    </>
  );
}
```

Key changes:
- Removed `currentPlanId` prop, `useNavigate`, `useCreateShoppingList`
- Removed "Einkaufsliste erstellen" button
- Added `defaultLeftoverDays` state + input
- Title changed to "Neu erstellen"

**Step 3: Add i18n key**

In `frontend/src/i18n/de.json` plan section, add:

```json
"defaultLeftoverDays": "Standard-Reste (Tage)"
```

Add matching key to `frontend/src/i18n/en.json`.

**Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/GenerateDrawer.tsx frontend/src/hooks/useMealPlan.ts frontend/src/i18n/
git commit -m "feat: add default leftover days to generate drawer, remove shopping list button"
```

---

### Task 8: Refactor PlanGrid — clickable day cards, shopping preview, static dinner

**Files:**
- Modify: `frontend/src/components/PlanGrid.tsx:1-191`
- Modify: `frontend/src/hooks/useShoppingList.ts` (import in PlanGrid)

**Step 1: Rewrite PlanGrid**

```typescript
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { MealPlan, MealPlanEntry, Recipe } from "../api/types";
import { useRecipes } from "../hooks/useRecipes";
import { useShoppingLists } from "../hooks/useShoppingList";

interface PlanGridProps {
  plan: MealPlan;
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function getDates(plan: MealPlan): string[] {
  const dates: string[] = [];
  const start = new Date(plan.start_date + "T00:00:00");
  const end = new Date(plan.end_date + "T00:00:00");
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

export default function PlanGrid({ plan }: PlanGridProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: recipes } = useRecipes();
  const { data: shoppingLists } = useShoppingLists();

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>();
    if (recipes) {
      for (const recipe of recipes) {
        map.set(recipe.id, recipe);
      }
    }
    return map;
  }, [recipes]);

  const entryMap = useMemo(() => {
    const map = new Map<string, MealPlanEntry>();
    for (const entry of plan.entries) {
      if (entry.meal_type === "LUNCH") {
        map.set(entry.date, entry);
      }
    }
    return map;
  }, [plan.entries]);

  const dates = useMemo(() => getDates(plan), [plan]);

  // Find the shopping list linked to this plan
  const shoppingList = shoppingLists?.find((sl) => sl.meal_plan === plan.id);
  const shoppingItemCount = shoppingList?.items.length ?? 0;

  return (
    <div className="space-y-3">
      {dates.map((date) => {
        const entry = entryMap.get(date);
        const recipe = entry ? recipeMap.get(entry.recipe) : null;
        const recipeName = recipe?.title ?? "...";
        const today = isToday(date);

        return (
          <div key={date} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-700">
                {formatDate(date, i18n.language)}
              </h3>
            </div>

            <div className="divide-y divide-gray-50">
              {/* Shopping list preview on day 1 */}
              {today && shoppingList && (
                <button
                  onClick={() => navigate(`/shopping/${shoppingList.id}`)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-orange-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-orange-500"
                  >
                    <path d="M1 1.75A.75.75 0 0 1 1.75 1h1.628a1.75 1.75 0 0 1 1.734 1.51L5.18 3h10.07A1.75 1.75 0 0 1 17 5.018l-1.14 7.584A1.75 1.75 0 0 1 14.128 14H6.872a1.75 1.75 0 0 1-1.732-1.398L3.395 2.253a.25.25 0 0 0-.248-.216H1.75A.75.75 0 0 1 1 1.75ZM6 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM15.5 17.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
                  </svg>
                  <span className="text-sm font-medium text-orange-500">
                    {t("plan.shoppingPreview", { count: shoppingItemCount })}
                  </span>
                </button>
              )}

              {/* Lunch entry */}
              {entry && (
                <button
                  onClick={() => recipe && navigate(`/recipes/${recipe.id}`)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span className="w-14 shrink-0 text-xs font-medium uppercase text-gray-400">
                    {t("plan.lunch")}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      entry.is_leftover
                        ? "italic text-gray-400"
                        : "font-medium text-gray-900"
                    }`}
                  >
                    {recipeName}
                    {entry.is_leftover && (
                      <span className="ml-1.5 text-xs font-normal not-italic text-gray-400">
                        ({t("plan.leftover")})
                      </span>
                    )}
                  </span>
                </button>
              )}

              {/* Static dinner label */}
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="w-14 shrink-0 text-xs font-medium uppercase text-gray-400">
                  {t("plan.dinner")}
                </span>
                <span className="text-sm text-gray-400">
                  {t("plan.coldDish")}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Key changes:
- Removed lock/swap controls, `useUpdateEntry`, `swappingEntryId` state
- Entry map keyed by date only (lunch entries only)
- Day 1 (today) shows shopping list preview with cart icon, navigates to `/shopping/{id}`
- Lunch entry is a clickable button navigating to `/recipes/{id}`
- Dinner is always "Kaltes Essen" static label
- `useShoppingLists` imported to find linked shopping list

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/PlanGrid.tsx
git commit -m "feat: refactor PlanGrid with clickable cards, shopping preview, static dinner"
```

---

### Task 9: Auto-generate shopping list on plan creation

**Files:**
- Modify: `backend/planner/api.py:16-26` (generate_plan view)
- Modify: `backend/shopping/services.py` (if needed, check import)

**Step 1: Write failing test**

Add to `backend/planner/tests/test_api.py`:

```python
from shopping.models import ShoppingList as ShoppingListModel


@pytest.mark.django_db
def test_generate_plan_auto_creates_shopping_list(auth_client):
    client, household = auth_client
    _create_recipes(household)
    response = client.post(
        "/api/v1/meal-plans/generate/",
        json.dumps({"start_date": "2026-03-01", "days": 7}),
        content_type="application/json",
    )
    assert response.status_code == 201
    plan_id = response.json()["id"]
    # Shopping list should be auto-created
    assert ShoppingListModel.objects.filter(meal_plan_id=plan_id).count() == 1
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/planner/tests/test_api.py::test_generate_plan_auto_creates_shopping_list -v`
Expected: FAIL — count is 0

**Step 3: Add auto-generation in API view**

In `backend/planner/api.py`, import and call the shopping list generator:

```python
from shopping.services import generate_shopping_list
```

In `generate_plan` view, after creating the plan:

```python
@router.post("/meal-plans/generate/", response={201: MealPlanOut}, tags=["meal-plans"])
def generate_plan(request, payload: GeneratePlanIn):
    require_household_member(request)
    plan = generate_meal_plan(
        household=request.user.active_household,
        start_date=payload.start_date,
        days=payload.days,
        servings=payload.servings,
        known_ratio=payload.known_ratio,
        default_leftover_days=payload.default_leftover_days,
    )
    generate_shopping_list(plan)
    return plan
```

**Step 4: Run test to verify it passes**

Run: `pytest backend/planner/tests/test_api.py::test_generate_plan_auto_creates_shopping_list -v`
Expected: PASS

**Step 5: Run all tests**

Run: `pytest`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/planner/api.py
git commit -m "feat: auto-generate shopping list when creating a meal plan"
```

---

### Task 10: Clean up unused code

**Files:**
- Modify: `frontend/src/hooks/useMealPlan.ts` — remove `useRegeneratePlan` and `useCreateShoppingList` (no longer used)
- Modify: `frontend/src/hooks/useMealPlan.ts` — remove `UpdateEntryPayload` and `useUpdateEntry` if no longer referenced

**Step 1: Remove dead code**

In `frontend/src/hooks/useMealPlan.ts`:
- Remove `useRegeneratePlan` function (lines 60-69)
- Remove `useCreateShoppingList` function (lines 72-82)
- Remove `UpdateEntryPayload` interface and `useUpdateEntry` function (lines 12-57) — verify nothing else imports these first by searching for `useUpdateEntry` and `useCreateShoppingList` in the codebase

**Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All PASS (or no failures related to our changes)

**Step 4: Commit**

```bash
git add frontend/src/hooks/useMealPlan.ts
git commit -m "chore: remove unused meal plan hooks"
```

---

### Task 11: Run full test suite and lint

**Step 1: Run all backend tests**

Run: `pytest`
Expected: All PASS

**Step 2: Run linter**

Run: `ruff check . --fix && ruff format .`
Expected: No errors

**Step 3: Run mypy**

Run: `cd backend && mypy --config-file=../pypy.toml .`
Expected: No new errors

**Step 4: Run frontend build + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Clean build, no lint errors

**Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes"
```
