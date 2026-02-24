# Cookless Phase 3: Recipe Models & API

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 3: Recipe Models & API

### Task 12: Ingredient and Unit models

**Files:**
- Create: `backend/recipes/__init__.py`
- Create: `backend/recipes/models.py`
- Create: `backend/recipes/tests/__init__.py`
- Create: `backend/recipes/tests/test_models.py`

**Step 1: Write failing tests**

```python
# backend/recipes/tests/test_models.py
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
    g = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g", base_unit=kg, conversion_factor=0.001)
    assert g.to_base(500) == 0.5  # 500g = 0.5kg
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest recipes/tests/test_models.py -v`
Expected: FAIL

**Step 3: Implement models**

```python
# backend/recipes/models.py
from decimal import Decimal
from django.db import models

class Ingredient(models.Model):
    CATEGORY_CHOICES = [
        ("PRODUCE", "Produce"), ("DAIRY", "Dairy"), ("MEAT", "Meat"),
        ("PANTRY", "Pantry"), ("FROZEN", "Frozen"), ("OTHER", "Other"),
    ]
    name_de = models.CharField(max_length=255)
    name_en = models.CharField(max_length=255)
    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES, default="OTHER")

    class Meta:
        ordering = ["name_en"]

    def __str__(self):
        return self.name_en

class Unit(models.Model):
    name_de = models.CharField(max_length=50)
    name_en = models.CharField(max_length=50)
    abbreviation = models.CharField(max_length=10)
    base_unit = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="derived_units")
    conversion_factor = models.DecimalField(max_digits=10, decimal_places=6, default=Decimal("1"))

    def to_base(self, quantity):
        if self.base_unit:
            return Decimal(str(quantity)) * self.conversion_factor
        return Decimal(str(quantity))

    def __str__(self):
        return self.abbreviation
```

**Step 4: Migrate and run tests**

```bash
cd backend && python manage.py startapp recipes
python manage.py makemigrations recipes && python manage.py migrate
pytest recipes/tests/test_models.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add backend/recipes/
git commit -m "feat: add Ingredient and Unit models with conversion"
```

---

### Task 13: Recipe and CookingStep models

**Files:**
- Create: `backend/recipes/tests/test_recipe_model.py`
- Modify: `backend/recipes/models.py`

**Step 1: Write failing tests**

```python
# backend/recipes/tests/test_recipe_model.py
import pytest
from django.contrib.auth import get_user_model
from users.models import Household
from recipes.models import Recipe, RecipeIngredient, CookingStep, Ingredient, Unit

User = get_user_model()

@pytest.mark.django_db
def test_create_recipe_with_ingredients_and_steps():
    household = Household.objects.create(name="Home")
    flour = Ingredient.objects.create(name_de="Mehl", name_en="flour", category="PANTRY")
    gram = Unit.objects.create(name_de="Gramm", name_en="gram", abbreviation="g")

    recipe = Recipe.objects.create(
        household=household, title="Pancakes",
        list_type="KNOWN", default_servings=2,
    )
    RecipeIngredient.objects.create(recipe=recipe, ingredient=flour, quantity=200, unit=gram, order=1)
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix flour")
    CookingStep.objects.create(recipe=recipe, method="MACHINE", step_number=1, instruction="Add flour to MC")

    assert recipe.ingredients.count() == 1
    assert recipe.steps.filter(method="MANUAL").count() == 1
    assert recipe.steps.filter(method="MACHINE").count() == 1
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest recipes/tests/test_recipe_model.py -v`
Expected: FAIL

**Step 3: Implement Recipe, RecipeIngredient, CookingStep**

```python
# Add to backend/recipes/models.py
import uuid

class Recipe(models.Model):
    LIST_TYPE_CHOICES = [("KNOWN", "Known"), ("TO_TRY", "To Try")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey("users.Household", on_delete=models.CASCADE, related_name="recipes")
    title = models.CharField(max_length=255)
    list_type = models.CharField(max_length=10, choices=LIST_TYPE_CHOICES)
    default_servings = models.PositiveIntegerField(default=2)
    prep_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    cook_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    image = models.ImageField(upload_to="recipes/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

class CookingStep(models.Model):
    METHOD_CHOICES = [("MANUAL", "Manual"), ("MACHINE", "Machine")]
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="steps")
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    step_number = models.PositiveIntegerField()
    instruction = models.TextField()

    class Meta:
        ordering = ["method", "step_number"]
```

**Step 4: Migrate and run tests**

```bash
cd backend && python manage.py makemigrations && python manage.py migrate
pytest recipes/tests/test_recipe_model.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add backend/recipes/
git commit -m "feat: add Recipe, RecipeIngredient, and CookingStep models"
```

---

### Task 14: Recipe API endpoints

**Files:**
- Create: `backend/recipes/serializers.py`
- Create: `backend/recipes/views.py`
- Create: `backend/recipes/urls.py`
- Create: `backend/recipes/tests/test_api.py`
- Modify: `backend/cookless/urls.py`

**Step 1: Write failing API tests**

Test CRUD for recipes, filtering by list_type, move endpoint, nested ingredients and steps creation. All scoped to household.

```python
# backend/recipes/tests/test_api.py
import pytest
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from users.models import Household, HouseholdMember
from recipes.models import Recipe

User = get_user_model()

@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com", apple_id="a1")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = APIClient()
    client.force_authenticate(user=user)
    return client, household

@pytest.mark.django_db
def test_create_recipe(auth_client):
    client, household = auth_client
    response = client.post("/api/v1/recipes/", {
        "title": "Pancakes",
        "list_type": "KNOWN",
        "default_servings": 2,
        "ingredients": [],
        "manual_steps": [],
        "machine_steps": [],
    }, format="json")
    assert response.status_code == 201
    assert Recipe.objects.filter(household=household).count() == 1

@pytest.mark.django_db
def test_list_recipes_filtered(auth_client):
    client, household = auth_client
    Recipe.objects.create(household=household, title="Known1", list_type="KNOWN", default_servings=2)
    Recipe.objects.create(household=household, title="Try1", list_type="TO_TRY", default_servings=2)
    response = client.get("/api/v1/recipes/?list_type=KNOWN")
    assert response.status_code == 200
    assert len(response.data) == 1

@pytest.mark.django_db
def test_other_household_recipes_not_visible(auth_client):
    client, household = auth_client
    other_household = Household.objects.create(name="Other")
    Recipe.objects.create(household=other_household, title="Secret", list_type="KNOWN", default_servings=2)
    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    assert len(response.data) == 0

@pytest.mark.django_db
def test_move_recipe(auth_client):
    client, household = auth_client
    recipe = Recipe.objects.create(household=household, title="Pancakes", list_type="KNOWN", default_servings=2)
    response = client.post(f"/api/v1/recipes/{recipe.id}/move/")
    assert response.status_code == 200
    recipe.refresh_from_db()
    assert recipe.list_type == "TO_TRY"
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && pytest recipes/tests/test_api.py -v`
Expected: FAIL

**Step 3: Implement serializers**

- `RecipeSerializer` with nested writable `RecipeIngredientSerializer` and step lists
- `IngredientSerializer` (for autocomplete endpoint)
- `UnitSerializer`

**Step 4: Implement views**

- `RecipeViewSet` (ModelViewSet, queryset filtered by active_household)
- `RecipeMoveView` (toggles KNOWN <-> TO_TRY)
- `IngredientListCreateView`
- `UnitListView`

**Step 5: Wire up URLs**

```python
# backend/recipes/urls.py
from django.urls import path
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register("recipes", RecipeViewSet, basename="recipe")

urlpatterns = router.urls + [
    path("recipes/<uuid:pk>/move/", RecipeMoveView.as_view()),
    path("ingredients/", IngredientListCreateView.as_view()),
    path("units/", UnitListView.as_view()),
]
```

**Step 6: Run tests**

Run: `cd backend && pytest recipes/tests/test_api.py -v`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/recipes/ backend/cookless/urls.py
git commit -m "feat: add Recipe CRUD API with household scoping"
```

---

### Task 15: Cooking steps API endpoint

**Files:**
- Create: `backend/recipes/tests/test_steps_api.py`
- Modify: `backend/recipes/views.py`
- Modify: `backend/recipes/urls.py`

**Step 1: Write failing test**

```python
# backend/recipes/tests/test_steps_api.py
import pytest
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from users.models import Household, HouseholdMember
from recipes.models import Recipe, CookingStep

User = get_user_model()

@pytest.mark.django_db
def test_get_manual_steps(auth_client_fixture):
    client, household = auth_client_fixture
    recipe = Recipe.objects.create(household=household, title="Pancakes", list_type="KNOWN", default_servings=2)
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=1, instruction="Mix")
    CookingStep.objects.create(recipe=recipe, method="MANUAL", step_number=2, instruction="Cook")
    CookingStep.objects.create(recipe=recipe, method="MACHINE", step_number=1, instruction="Add to MC")

    response = client.get(f"/api/v1/recipes/{recipe.id}/steps/?method=MANUAL")
    assert response.status_code == 200
    assert len(response.data) == 2
```

**Step 2: Implement RecipeStepsView**

GET endpoint filtering steps by `method` query param.

**Step 3: Run tests and commit**

```bash
cd backend && pytest recipes/tests/test_steps_api.py -v
git add backend/recipes/
git commit -m "feat: add cooking steps API endpoint with method filter"
```
