# PX5: Bulk Create for Recipe Saves Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce database round-trips when saving recipe ingredients and steps from N individual `INSERT` statements to 1 `bulk_create` call each.

**Architecture:** Replace the `for` loops in `_save_ingredients` and `_save_steps` helpers with `bulk_create`. No schema or API changes needed — this is purely an internal optimization.

**Tech Stack:** Django ORM `bulk_create`

---

### Task 1: Add test proving bulk save works correctly

**Files:**
- Modify: `backend/recipes/tests/test_api.py`

**Step 1: Write a test for update with ingredients and steps**

The existing `test_create_and_read_recipe_with_nested_data` already covers the create path. Add an update test:

```python
@pytest.mark.django_db
def test_update_recipe_replaces_ingredients_and_steps(auth_client):
    """Updating a recipe should replace all ingredients and steps."""
    client, household = auth_client
    flour = Ingredient.objects.create(name_en="Flour", name_de="Mehl", category="PANTRY")
    sugar = Ingredient.objects.create(name_en="Sugar", name_de="Zucker", category="PANTRY")
    gram = Unit.objects.create(name_en="gram", name_de="Gramm", abbreviation="g")

    # Create with flour
    create_resp = client.post(
        "/api/v1/recipes/",
        json.dumps({
            "title": "Cake",
            "list_type": "KNOWN",
            "default_servings": 4,
            "ingredients": [{"ingredient": flour.pk, "quantity": "200.00", "unit": gram.pk, "order": 1}],
            "manual_steps": [{"step_number": 1, "instruction": "Mix"}],
            "machine_steps": [],
        }),
        content_type="application/json",
    )
    recipe_id = create_resp.json()["id"]

    # Update: replace flour with sugar, add a second manual step and a machine step
    update_resp = client.put(
        f"/api/v1/recipes/{recipe_id}/",
        json.dumps({
            "title": "Cake v2",
            "list_type": "KNOWN",
            "default_servings": 8,
            "ingredients": [
                {"ingredient": sugar.pk, "quantity": "150.00", "unit": gram.pk, "order": 1},
                {"ingredient": flour.pk, "quantity": "300.00", "unit": gram.pk, "order": 2},
            ],
            "manual_steps": [
                {"step_number": 1, "instruction": "Sift"},
                {"step_number": 2, "instruction": "Fold"},
            ],
            "machine_steps": [{"step_number": 1, "instruction": "Blend"}],
        }),
        content_type="application/json",
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["title"] == "Cake v2"
    assert len(data["ingredients"]) == 2
    assert len(data["manual_steps"]) == 2
    assert len(data["machine_steps"]) == 1

    # Verify old data is gone
    from recipes.models import RecipeIngredient, CookingStep
    assert RecipeIngredient.objects.filter(recipe_id=recipe_id).count() == 2
    assert CookingStep.objects.filter(recipe_id=recipe_id, method="MANUAL").count() == 2
    assert CookingStep.objects.filter(recipe_id=recipe_id, method="MACHINE").count() == 1
```

**Step 2: Run test to verify it passes (baseline)**

Run: `pytest backend/recipes/tests/test_api.py::test_update_recipe_replaces_ingredients_and_steps -v`
Expected: PASS (this test verifies current behavior before refactor)

**Step 3: Commit**

```bash
git add backend/recipes/tests/test_api.py
git commit -m "test(px5): add test for recipe update with ingredient/step replacement"
```

---

### Task 2: Refactor helpers to use `bulk_create`

**Files:**
- Modify: `backend/recipes/api.py:25-45`

**Step 1: Replace `_save_ingredients` loop with `bulk_create`**

```python
# OLD (lines 25-34)
def _save_ingredients(recipe: Recipe, ingredients_data: list) -> None:
    recipe.ingredients.all().delete()
    for item in ingredients_data:
        RecipeIngredient.objects.create(
            recipe=recipe,
            ingredient_id=item.ingredient,
            quantity=item.quantity,
            unit_id=item.unit,
            order=item.order,
        )

# NEW
def _save_ingredients(recipe: Recipe, ingredients_data: list) -> None:
    recipe.ingredients.all().delete()
    RecipeIngredient.objects.bulk_create([
        RecipeIngredient(
            recipe=recipe,
            ingredient_id=item.ingredient,
            quantity=item.quantity,
            unit_id=item.unit,
            order=item.order,
        )
        for item in ingredients_data
    ])
```

**Step 2: Replace `_save_steps` loop with `bulk_create`**

```python
# OLD (lines 37-45)
def _save_steps(recipe: Recipe, steps_data: list, method: str) -> None:
    recipe.steps.filter(method=method).delete()
    for item in steps_data:
        CookingStep.objects.create(
            recipe=recipe,
            method=method,
            step_number=item.step_number,
            instruction=item.instruction,
        )

# NEW
def _save_steps(recipe: Recipe, steps_data: list, method: str) -> None:
    recipe.steps.filter(method=method).delete()
    CookingStep.objects.bulk_create([
        CookingStep(
            recipe=recipe,
            method=method,
            step_number=item.step_number,
            instruction=item.instruction,
        )
        for item in steps_data
    ])
```

**Step 3: Run all recipe tests**

Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: All pass

**Step 4: Run full test suite**

Run: `pytest`
Expected: All pass (ensure no other code depends on the individual create behavior)

**Step 5: Commit**

```bash
git add backend/recipes/api.py
git commit -m "perf(px5): use bulk_create for recipe ingredients and steps"
```
