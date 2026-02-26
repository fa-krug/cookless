# Machine Step Programs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured program support to machine cooking steps so users can select a program type (e.g. Manual Cooking, Chopping, Steaming) with typed parameters (temperature, time, speed, direction, weight) instead of free text.

**Architecture:** 6 new nullable fields on the existing `CookingStep` model. Program catalog hardcoded in the frontend. A step is either a structured program (`program_type` set) or free text (`program_type` null). Frontend renders program steps with icon-based parameter display.

**Tech Stack:** Django 6.0, Django Ninja, React 19, TypeScript, Tailwind CSS 4, Lucide icons, Vitest

---

### Task 1: Backend Model — Add program fields to CookingStep

**Files:**
- Modify: `backend/recipes/models.py:117-129`

**Step 1: Add new fields to CookingStep model**

```python
class CookingStep(models.Model):
    METHOD_CHOICES = [("MANUAL", "Manual"), ("MACHINE", "Machine")]
    PROGRAM_CHOICES = [
        ("MANUAL_COOKING", "Manual Cooking"),
        ("CHOPPING", "Chopping"),
        ("KNEADING", "Kneading"),
        ("STEAMING", "Steaming"),
        ("BLENDING", "Blending"),
        ("SEARING", "Searing"),
        ("SLOW_COOKING", "Slow Cooking"),
        ("SOUS_VIDE", "Sous Vide"),
        ("WEIGHING", "Weighing"),
        ("TURBO", "Turbo"),
        ("EGG_COOKING", "Egg Cooking"),
        ("FERMENTATION", "Fermentation"),
        ("PRE_CLEANING", "Pre-Cleaning"),
    ]
    DIRECTION_CHOICES = [("LEFT", "Left"), ("RIGHT", "Right")]

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="steps")
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    step_number = models.PositiveIntegerField()
    instruction = models.TextField(blank=True, default="")

    # Program fields (all nullable — only populated for program steps)
    program_type = models.CharField(max_length=20, choices=PROGRAM_CHOICES, null=True, blank=True)
    temperature = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    speed = models.PositiveIntegerField(null=True, blank=True)
    turbo = models.BooleanField(default=False)
    direction = models.CharField(max_length=5, choices=DIRECTION_CHOICES, null=True, blank=True)
    weight_grams = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["method", "step_number"]

    def __str__(self) -> str:
        return f"{self.recipe.title} - {self.method} step {self.step_number}"
```

**Step 2: Generate and run migration**

Run: `cd backend && python3 manage.py makemigrations recipes && python3 manage.py migrate`

**Step 3: Commit**

```
feat(backend): add program fields to CookingStep model
```

---

### Task 2: Backend Validation — Program parameter validation helper

**Files:**
- Create: `backend/recipes/programs.py`
- Test: `backend/recipes/tests/test_programs.py`

**Step 1: Write failing tests for validation**

Create `backend/recipes/tests/test_programs.py`:

```python
import pytest

from recipes.programs import validate_program_step


class TestValidateProgramStep:
    def test_manual_cooking_valid(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=100,
            duration_seconds=300,
            speed=5,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert errors == []

    def test_manual_cooking_missing_temperature(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=None,
            duration_seconds=300,
            speed=5,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert any("temperature" in e for e in errors)

    def test_manual_cooking_missing_all_required(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 4  # temperature, duration, speed, direction

    def test_chopping_valid(self):
        errors = validate_program_step(
            "CHOPPING",
            temperature=None,
            duration_seconds=30,
            speed=8,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert errors == []

    def test_weighing_valid(self):
        errors = validate_program_step(
            "WEIGHING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=200,
        )
        assert errors == []

    def test_weighing_missing_weight(self):
        errors = validate_program_step(
            "WEIGHING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert any("weight_grams" in e for e in errors)

    def test_pre_cleaning_no_params_needed(self):
        errors = validate_program_step(
            "PRE_CLEANING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert errors == []

    def test_temperature_out_of_range(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=200,
            duration_seconds=300,
            speed=5,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert any("temperature" in e for e in errors)

    def test_speed_out_of_range(self):
        errors = validate_program_step(
            "CHOPPING",
            temperature=None,
            duration_seconds=30,
            speed=15,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert any("speed" in e for e in errors)

    def test_invalid_program_type(self):
        errors = validate_program_step(
            "INVALID",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert any("program_type" in e for e in errors)

    def test_fermentation_temperature_max_60(self):
        errors = validate_program_step(
            "FERMENTATION",
            temperature=80,
            duration_seconds=3600,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert any("temperature" in e for e in errors)

    def test_slow_cooking_long_duration_valid(self):
        errors = validate_program_step(
            "SLOW_COOKING",
            temperature=80,
            duration_seconds=43200,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert errors == []

    def test_turbo_max_60_seconds(self):
        errors = validate_program_step(
            "TURBO",
            temperature=None,
            duration_seconds=120,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert any("duration" in e for e in errors)

    def test_invalid_direction(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=100,
            duration_seconds=300,
            speed=5,
            direction="UP",
            turbo=False,
            weight_grams=None,
        )
        assert any("direction" in e for e in errors)
```

**Step 2: Run tests to verify they fail**

Run: `python3 -m pytest backend/recipes/tests/test_programs.py -v`
Expected: FAIL (module not found)

**Step 3: Implement validation module**

Create `backend/recipes/programs.py`:

```python
from __future__ import annotations

# Program definitions: program_type -> list of (field_name, required)
# Range overrides per program are encoded in RANGE_OVERRIDES
PROGRAM_PARAMS: dict[str, list[tuple[str, bool]]] = {
    "MANUAL_COOKING": [
        ("temperature", True),
        ("duration_seconds", True),
        ("speed", True),
        ("direction", True),
        ("turbo", False),
    ],
    "CHOPPING": [("duration_seconds", True), ("speed", True)],
    "KNEADING": [("duration_seconds", True)],
    "STEAMING": [("temperature", True), ("duration_seconds", True)],
    "BLENDING": [("duration_seconds", True)],
    "SEARING": [("temperature", True), ("duration_seconds", True), ("speed", True)],
    "SLOW_COOKING": [("temperature", True), ("duration_seconds", True)],
    "SOUS_VIDE": [("temperature", True), ("duration_seconds", True)],
    "WEIGHING": [("weight_grams", True)],
    "TURBO": [("duration_seconds", True)],
    "EGG_COOKING": [("duration_seconds", True)],
    "FERMENTATION": [("temperature", True), ("duration_seconds", True)],
    "PRE_CLEANING": [],
}

# Default ranges
DEFAULT_RANGES: dict[str, tuple[int, int]] = {
    "temperature": (37, 130),
    "duration_seconds": (1, 5940),
    "speed": (1, 10),
    "weight_grams": (1, 5000),
}

# Per-program range overrides
RANGE_OVERRIDES: dict[str, dict[str, tuple[int, int]]] = {
    "SLOW_COOKING": {"duration_seconds": (1, 43200)},
    "SOUS_VIDE": {"duration_seconds": (1, 43200)},
    "FERMENTATION": {"temperature": (37, 60), "duration_seconds": (1, 43200)},
    "TURBO": {"duration_seconds": (1, 60)},
}

VALID_DIRECTIONS = {"LEFT", "RIGHT"}


def validate_program_step(
    program_type: str,
    *,
    temperature: int | None,
    duration_seconds: int | None,
    speed: int | None,
    direction: str | None,
    turbo: bool,
    weight_grams: int | None,
) -> list[str]:
    """Validate program step parameters. Returns list of error messages (empty = valid)."""
    errors: list[str] = []

    if program_type not in PROGRAM_PARAMS:
        return [f"Invalid program_type: {program_type}"]

    params = PROGRAM_PARAMS[program_type]
    overrides = RANGE_OVERRIDES.get(program_type, {})

    values = {
        "temperature": temperature,
        "duration_seconds": duration_seconds,
        "speed": speed,
        "direction": direction,
        "weight_grams": weight_grams,
    }

    for field, required in params:
        value = values.get(field)

        if field == "turbo":
            continue  # turbo is a bool, always valid

        if required and value is None:
            errors.append(f"{field} is required for {program_type}")
            continue

        if value is None:
            continue

        if field == "direction":
            if value not in VALID_DIRECTIONS:
                errors.append(f"direction must be one of {VALID_DIRECTIONS}, got {value}")
            continue

        # Numeric range check
        range_min, range_max = overrides.get(field, DEFAULT_RANGES.get(field, (0, 999999)))
        if not (range_min <= value <= range_max):
            errors.append(f"{field} must be between {range_min} and {range_max}, got {value}")

    return errors
```

**Step 4: Run tests to verify they pass**

Run: `python3 -m pytest backend/recipes/tests/test_programs.py -v`
Expected: All PASS

**Step 5: Commit**

```
feat(backend): add program parameter validation module
```

---

### Task 3: Backend API — Update schemas and save logic

**Files:**
- Modify: `backend/recipes/schemas.py:72-76, 113-115`
- Modify: `backend/recipes/api.py:108-120`
- Test: `backend/recipes/tests/test_program_steps_api.py`

**Step 1: Write failing API tests**

Create `backend/recipes/tests/test_program_steps_api.py`:

```python
import json

from django.contrib.auth import get_user_model
from django.test import Client

import pytest

from recipes.models import CookingStep, Recipe
from users.models import Household, HouseholdMember

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(email="test@example.com")
    household = Household.objects.create(name="Home")
    HouseholdMember.objects.create(household=household, user=user, role="OWNER")
    user.active_household = household
    user.save()
    client = Client()
    client.force_login(user)
    return client, household


@pytest.mark.django_db
def test_create_recipe_with_program_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "MANUAL_COOKING",
                "temperature": 100,
                "duration_seconds": 300,
                "speed": 5,
                "direction": "LEFT",
                "turbo": False,
            }
        ],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    step = data["machine_steps"][0]
    assert step["program_type"] == "MANUAL_COOKING"
    assert step["temperature"] == 100
    assert step["duration_seconds"] == 300
    assert step["speed"] == 5
    assert step["direction"] == "LEFT"
    assert step["turbo"] is False


@pytest.mark.django_db
def test_create_recipe_with_free_text_machine_step(auth_client):
    """Existing free text steps still work."""
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {"step_number": 1, "instruction": "Add to machine"}
        ],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] is None
    assert step["instruction"] == "Add to machine"


@pytest.mark.django_db
def test_create_recipe_program_step_missing_required_param(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "MANUAL_COOKING",
                "temperature": 100,
                # missing duration_seconds, speed, direction
            }
        ],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 422


@pytest.mark.django_db
def test_create_recipe_program_step_out_of_range(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "MANUAL_COOKING",
                "temperature": 200,  # out of range
                "duration_seconds": 300,
                "speed": 5,
                "direction": "LEFT",
            }
        ],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 422


@pytest.mark.django_db
def test_reject_program_type_on_manual_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "manual_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "CHOPPING",
                "duration_seconds": 30,
                "speed": 8,
            }
        ],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 422


@pytest.mark.django_db
def test_reject_free_text_step_empty_instruction(auth_client):
    """Free text step (no program_type) must have non-empty instruction."""
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [{"step_number": 1, "instruction": ""}],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 422


@pytest.mark.django_db
def test_weighing_program_step(auth_client):
    client, household = auth_client
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "WEIGHING",
                "weight_grams": 200,
            }
        ],
    }
    resp = client.post(
        "/api/v1/recipes/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] == "WEIGHING"
    assert step["weight_grams"] == 200


@pytest.mark.django_db
def test_recipe_detail_returns_program_fields(auth_client):
    """GET recipe returns all program fields."""
    client, household = auth_client
    recipe = Recipe.objects.create(
        household=household, title="Soup", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(
        recipe=recipe,
        method="MACHINE",
        step_number=1,
        instruction="",
        program_type="STEAMING",
        temperature=100,
        duration_seconds=600,
    )
    resp = client.get(f"/api/v1/recipes/{recipe.id}/")
    assert resp.status_code == 200
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] == "STEAMING"
    assert step["temperature"] == 100
    assert step["duration_seconds"] == 600
    assert step["speed"] is None
    assert step["direction"] is None
    assert step["turbo"] is False
    assert step["weight_grams"] is None


@pytest.mark.django_db
def test_update_recipe_replaces_program_steps(auth_client):
    """PUT replaces steps including program fields."""
    client, household = auth_client
    recipe = Recipe.objects.create(
        household=household, title="Soup", list_type="KNOWN", default_servings=2
    )
    CookingStep.objects.create(
        recipe=recipe, method="MACHINE", step_number=1, instruction="Old step"
    )
    payload = {
        "title": "Soup",
        "list_type": "KNOWN",
        "default_servings": 2,
        "machine_steps": [
            {
                "step_number": 1,
                "instruction": "",
                "program_type": "CHOPPING",
                "duration_seconds": 30,
                "speed": 8,
            }
        ],
    }
    resp = client.put(
        f"/api/v1/recipes/{recipe.id}/",
        json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200
    step = resp.json()["machine_steps"][0]
    assert step["program_type"] == "CHOPPING"
    assert step["instruction"] == ""
```

**Step 2: Run tests to verify they fail**

Run: `python3 -m pytest backend/recipes/tests/test_program_steps_api.py -v`
Expected: FAIL (schema fields missing)

**Step 3: Update schemas**

In `backend/recipes/schemas.py`, update `CookingStepOut` and `CookingStepIn`:

```python
class CookingStepOut(Schema):
    id: int
    step_number: int
    instruction: str
    program_type: str | None = None
    temperature: int | None = None
    duration_seconds: int | None = None
    speed: int | None = None
    turbo: bool = False
    direction: str | None = None
    weight_grams: int | None = None


class CookingStepIn(Schema):
    step_number: int
    instruction: str = ""
    program_type: str | None = None
    temperature: int | None = None
    duration_seconds: int | None = None
    speed: int | None = None
    turbo: bool = False
    direction: str | None = None
    weight_grams: int | None = None
```

Also update `GeneratedRecipeIn` — its `machine_steps` field already uses `CookingStepIn`, so it inherits the new fields automatically.

**Step 4: Update `_save_steps()` in `backend/recipes/api.py`**

Replace the `_save_steps` function (line 108-120):

```python
def _save_steps(recipe: Recipe, steps_data: list, method: str) -> None:
    from recipes.programs import validate_program_step

    recipe.steps.filter(method=method).delete()
    step_objects = []
    for item in steps_data:
        program_type = getattr(item, "program_type", None)

        if method == "MANUAL" and program_type:
            raise HttpError(422, "program_type is not allowed on manual steps")

        if program_type:
            errors = validate_program_step(
                program_type,
                temperature=getattr(item, "temperature", None),
                duration_seconds=getattr(item, "duration_seconds", None),
                speed=getattr(item, "speed", None),
                direction=getattr(item, "direction", None),
                turbo=getattr(item, "turbo", False),
                weight_grams=getattr(item, "weight_grams", None),
            )
            if errors:
                raise HttpError(422, "; ".join(errors))
        elif not item.instruction.strip():
            raise HttpError(422, "Free text steps must have a non-empty instruction")

        step_objects.append(
            CookingStep(
                recipe=recipe,
                method=method,
                step_number=item.step_number,
                instruction=item.instruction if not program_type else "",
                program_type=program_type,
                temperature=getattr(item, "temperature", None),
                duration_seconds=getattr(item, "duration_seconds", None),
                speed=getattr(item, "speed", None),
                turbo=getattr(item, "turbo", False),
                direction=getattr(item, "direction", None),
                weight_grams=getattr(item, "weight_grams", None),
            )
        )
    CookingStep.objects.bulk_create(step_objects)
```

**Step 5: Run tests to verify they pass**

Run: `python3 -m pytest backend/recipes/tests/test_program_steps_api.py backend/recipes/tests/test_steps_api.py -v`
Expected: All PASS (including existing step tests)

**Step 6: Run full backend test suite**

Run: `python3 -m pytest backend/ -v`
Expected: All PASS

**Step 7: Commit**

```
feat(backend): add program fields to step schemas and validation
```

---

### Task 4: Frontend Types — Update TypeScript types and program constants

**Files:**
- Modify: `frontend/src/api/types.ts:75-79, 119-122`
- Create: `frontend/src/constants/machinePrograms.ts`

**Step 1: Update TypeScript types**

In `frontend/src/api/types.ts`, update `CookingStep` and `CookingStepPayload`:

```typescript
export type ProgramType =
  | "MANUAL_COOKING"
  | "CHOPPING"
  | "KNEADING"
  | "STEAMING"
  | "BLENDING"
  | "SEARING"
  | "SLOW_COOKING"
  | "SOUS_VIDE"
  | "WEIGHING"
  | "TURBO"
  | "EGG_COOKING"
  | "FERMENTATION"
  | "PRE_CLEANING";

export type Direction = "LEFT" | "RIGHT";

export interface CookingStep {
  id: number;
  step_number: number;
  instruction: string;
  program_type: ProgramType | null;
  temperature: number | null;
  duration_seconds: number | null;
  speed: number | null;
  turbo: boolean;
  direction: Direction | null;
  weight_grams: number | null;
}

export interface CookingStepPayload {
  step_number: number;
  instruction: string;
  program_type?: ProgramType | null;
  temperature?: number | null;
  duration_seconds?: number | null;
  speed?: number | null;
  turbo?: boolean;
  direction?: Direction | null;
  weight_grams?: number | null;
}
```

**Step 2: Create program constants file**

Create `frontend/src/constants/machinePrograms.ts`:

```typescript
import {
  ChefHat,
  Clock,
  Droplets,
  Egg,
  Flame,
  Gauge,
  Hand,
  type LucideIcon,
  Scissors,
  Sparkles,
  Sprout,
  Thermometer,
  Weight,
  Wind,
  Zap,
} from "lucide-react";
import type { Direction, ProgramType } from "../api/types";

export type ParamField =
  | "temperature"
  | "duration_seconds"
  | "speed"
  | "direction"
  | "weight_grams"
  | "turbo";

export interface ProgramParam {
  field: ParamField;
  required: boolean;
  min?: number;
  max?: number;
  options?: Direction[];
}

export interface MachineProgram {
  type: ProgramType;
  icon: LucideIcon;
  params: ProgramParam[];
}

const temp = (min = 37, max = 130): ProgramParam => ({
  field: "temperature",
  required: true,
  min,
  max,
});
const duration = (max = 5940): ProgramParam => ({
  field: "duration_seconds",
  required: true,
  min: 1,
  max,
});
const speed: ProgramParam = { field: "speed", required: true, min: 1, max: 10 };
const dir: ProgramParam = {
  field: "direction",
  required: true,
  options: ["LEFT", "RIGHT"],
};
const turboParam: ProgramParam = { field: "turbo", required: false };
const weight: ProgramParam = {
  field: "weight_grams",
  required: true,
  min: 1,
  max: 5000,
};

export const MACHINE_PROGRAMS: MachineProgram[] = [
  {
    type: "MANUAL_COOKING",
    icon: ChefHat,
    params: [temp(), duration(), speed, dir, turboParam],
  },
  { type: "CHOPPING", icon: Scissors, params: [duration(), speed] },
  { type: "KNEADING", icon: Hand, params: [duration()] },
  { type: "STEAMING", icon: Droplets, params: [temp(), duration()] },
  { type: "BLENDING", icon: Wind, params: [duration()] },
  { type: "SEARING", icon: Flame, params: [temp(), duration(), speed] },
  {
    type: "SLOW_COOKING",
    icon: Clock,
    params: [temp(), duration(43200)],
  },
  {
    type: "SOUS_VIDE",
    icon: Thermometer,
    params: [temp(), duration(43200)],
  },
  { type: "WEIGHING", icon: Weight, params: [weight] },
  { type: "TURBO", icon: Zap, params: [duration(60)] },
  { type: "EGG_COOKING", icon: Egg, params: [duration()] },
  {
    type: "FERMENTATION",
    icon: Sprout,
    params: [temp(37, 60), duration(43200)],
  },
  { type: "PRE_CLEANING", icon: Sparkles, params: [] },
];

export function getProgramDef(type: ProgramType): MachineProgram | undefined {
  return MACHINE_PROGRAMS.find((p) => p.type === type);
}
```

**Step 3: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```
feat(frontend): add program types and machine program constants
```

---

### Task 5: Frontend i18n — Add program and parameter translations

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add English translations**

Add inside the `"steps"` object in `en.json`:

```json
"freeText": "Free text",
"selectProgram": "Select program",
"changeProgram": "Change",
"programs": {
  "MANUAL_COOKING": "Manual Cooking",
  "CHOPPING": "Chopping",
  "KNEADING": "Kneading",
  "STEAMING": "Steaming",
  "BLENDING": "Blending",
  "SEARING": "Searing",
  "SLOW_COOKING": "Slow Cooking",
  "SOUS_VIDE": "Sous Vide",
  "WEIGHING": "Weighing",
  "TURBO": "Turbo",
  "EGG_COOKING": "Egg Cooking",
  "FERMENTATION": "Fermentation",
  "PRE_CLEANING": "Pre-Cleaning"
},
"params": {
  "temperature": "Temp",
  "duration": "Time",
  "speed": "Speed",
  "direction": "Direction",
  "weight": "Weight",
  "turbo": "Turbo"
},
"directions": {
  "LEFT": "Left",
  "RIGHT": "Right"
},
"units": {
  "celsius": "°C",
  "grams": "g",
  "seconds": "s",
  "minutes": "min",
  "hours": "h"
}
```

**Step 2: Add German translations**

Add inside the `"steps"` object in `de.json`:

```json
"freeText": "Freitext",
"selectProgram": "Programm wählen",
"changeProgram": "Ändern",
"programs": {
  "MANUAL_COOKING": "Manuelles Kochen",
  "CHOPPING": "Zerkleinern",
  "KNEADING": "Kneten",
  "STEAMING": "Dampfgaren",
  "BLENDING": "Mixen",
  "SEARING": "Anbraten",
  "SLOW_COOKING": "Schmoren",
  "SOUS_VIDE": "Sous Vide",
  "WEIGHING": "Waage",
  "TURBO": "Turbo",
  "EGG_COOKING": "Eier kochen",
  "FERMENTATION": "Fermentieren",
  "PRE_CLEANING": "Vorreinigen"
},
"params": {
  "temperature": "Temp",
  "duration": "Zeit",
  "speed": "Stufe",
  "direction": "Richtung",
  "weight": "Gewicht",
  "turbo": "Turbo"
},
"directions": {
  "LEFT": "Links",
  "RIGHT": "Rechts"
},
"units": {
  "celsius": "°C",
  "grams": "g",
  "seconds": "Sek.",
  "minutes": "Min.",
  "hours": "Std."
}
```

**Step 3: Commit**

```
feat(i18n): add program and parameter translations for en/de
```

---

### Task 6: Frontend Utility — Duration formatting helper

**Files:**
- Create: `frontend/src/utils/formatDuration.ts`
- Test: `frontend/src/__tests__/formatDuration.test.ts`

**Step 1: Write failing tests**

Create `frontend/src/__tests__/formatDuration.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatDuration } from "../utils/formatDuration";

describe("formatDuration", () => {
  it("formats seconds under 60", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(1)).toBe("1s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats exact minutes", () => {
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(300)).toBe("5:00");
    expect(formatDuration(5940)).toBe("99:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(125)).toBe("2:05");
  });

  it("formats hours for long durations", () => {
    expect(formatDuration(5941)).toBe("1h 39min");
    expect(formatDuration(7200)).toBe("2h 0min");
    expect(formatDuration(9000)).toBe("2h 30min");
    expect(formatDuration(43200)).toBe("12h 0min");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/formatDuration.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement formatDuration**

Create `frontend/src/utils/formatDuration.ts`:

```typescript
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  // Over 99 minutes → show hours
  if (totalMinutes > 99) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}min`;
  }

  // 1–99 minutes → show mm:ss
  const secs = remainingSeconds.toString().padStart(2, "0");
  return `${totalMinutes}:${secs}`;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/formatDuration.test.ts`
Expected: All PASS

**Step 5: Commit**

```
feat(frontend): add duration formatting utility
```

---

### Task 7: Frontend Component — ProgramStepDisplay for cooking view

**Files:**
- Create: `frontend/src/components/ProgramStepDisplay.tsx`

This component renders the icon-based compact display of a program step's parameters, used in the CookingViewPage.

**Step 1: Create ProgramStepDisplay component**

Create `frontend/src/components/ProgramStepDisplay.tsx`:

```tsx
import {
  Gauge,
  RotateCcw,
  RotateCw,
  Scale,
  Thermometer,
  Timer,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CookingStep } from "../api/types";
import { getProgramDef } from "../constants/machinePrograms";
import { formatDuration } from "../utils/formatDuration";

interface ProgramStepDisplayProps {
  step: CookingStep;
  isCurrent: boolean;
}

export default function ProgramStepDisplay({ step, isCurrent }: ProgramStepDisplayProps) {
  const { t } = useTranslation();
  const program = step.program_type ? getProgramDef(step.program_type) : null;

  if (!program) return null;

  const iconSize = isCurrent ? 18 : 14;
  const textClass = isCurrent ? "text-sm" : "text-xs";

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <program.icon size={iconSize} className="text-orange-500" />
        <span className={`font-medium ${isCurrent ? "text-base text-gray-900" : "text-sm text-gray-700"}`}>
          {t(`steps.programs.${step.program_type}`)}
        </span>
      </div>
      <div className={`mt-1.5 flex flex-wrap items-center gap-3 ${textClass} text-gray-600`}>
        {step.temperature != null && (
          <span className="flex items-center gap-1">
            <Thermometer size={iconSize} />
            {step.temperature}°C
          </span>
        )}
        {step.duration_seconds != null && (
          <span className="flex items-center gap-1">
            <Timer size={iconSize} />
            {formatDuration(step.duration_seconds)}
          </span>
        )}
        {step.speed != null && (
          <span className="flex items-center gap-1">
            <Gauge size={iconSize} />
            {step.speed}
          </span>
        )}
        {step.direction != null && (
          <span className="flex items-center gap-1">
            {step.direction === "LEFT" ? (
              <RotateCcw size={iconSize} />
            ) : (
              <RotateCw size={iconSize} />
            )}
            {t(`steps.directions.${step.direction}`)}
          </span>
        )}
        {step.turbo && (
          <span className="flex items-center gap-1">
            <Zap size={iconSize} />
            {t("steps.params.turbo")}
          </span>
        )}
        {step.weight_grams != null && (
          <span className="flex items-center gap-1">
            <Scale size={iconSize} />
            {step.weight_grams}g
          </span>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat(frontend): add ProgramStepDisplay component for cooking view
```

---

### Task 8: Frontend — Update CookingViewPage to render program steps

**Files:**
- Modify: `frontend/src/pages/CookingViewPage.tsx:124-145`

**Step 1: Update step rendering in CookingViewPage**

Import `ProgramStepDisplay` and update the step list rendering. Replace the inner content of the step button (lines 137-143) with conditional rendering:

```tsx
// Add import at top of file:
import ProgramStepDisplay from "../components/ProgramStepDisplay";

// Replace the step content inside the <button> (lines 137-143):
{step.program_type ? (
  <div className="ml-2">
    <ProgramStepDisplay step={step} isCurrent={isCurrent} />
  </div>
) : (
  <>
    <span
      className={`font-semibold ${isCurrent ? "text-lg text-orange-600" : "text-sm text-gray-500"}`}
    >
      {step.step_number}.
    </span>
    <span className={`ml-2 ${isCurrent ? "text-lg text-gray-900" : "text-sm text-gray-700"}`}>
      {step.instruction}
    </span>
  </>
)}
```

For program steps, prepend the step number above the program display:

```tsx
{step.program_type ? (
  <div className="flex items-start gap-2">
    <span
      className={`shrink-0 font-semibold ${isCurrent ? "text-lg text-orange-600" : "text-sm text-gray-500"}`}
    >
      {step.step_number}.
    </span>
    <ProgramStepDisplay step={step} isCurrent={isCurrent} />
  </div>
) : (
  <>
    <span
      className={`font-semibold ${isCurrent ? "text-lg text-orange-600" : "text-sm text-gray-500"}`}
    >
      {step.step_number}.
    </span>
    <span className={`ml-2 ${isCurrent ? "text-lg text-gray-900" : "text-sm text-gray-700"}`}>
      {step.instruction}
    </span>
  </>
)}
```

**Step 2: Run type check and build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat(frontend): render program steps in cooking view
```

---

### Task 9: Frontend Component — ProgramStepForm for step editor

**Files:**
- Create: `frontend/src/components/ProgramStepForm.tsx`

This is the form that appears when editing a program step — shows the relevant parameter inputs for the selected program type.

**Step 1: Create ProgramStepForm component**

Create `frontend/src/components/ProgramStepForm.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import type { CookingStepPayload, Direction, ProgramType } from "../api/types";
import { MACHINE_PROGRAMS, getProgramDef } from "../constants/machinePrograms";

interface ProgramStepFormProps {
  step: CookingStepPayload;
  onChange: (step: CookingStepPayload) => void;
}

export default function ProgramStepForm({ step, onChange }: ProgramStepFormProps) {
  const { t } = useTranslation();
  const program = step.program_type ? getProgramDef(step.program_type) : null;

  function selectProgram(type: ProgramType) {
    onChange({
      ...step,
      program_type: type,
      instruction: "",
      temperature: null,
      duration_seconds: null,
      speed: null,
      turbo: false,
      direction: null,
      weight_grams: null,
    });
  }

  function clearProgram() {
    onChange({
      ...step,
      program_type: null,
      instruction: "",
      temperature: null,
      duration_seconds: null,
      speed: null,
      turbo: false,
      direction: null,
      weight_grams: null,
    });
  }

  // Program selection grid
  if (!program) {
    return (
      <div>
        <div className="grid grid-cols-3 gap-1.5">
          {MACHINE_PROGRAMS.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => selectProgram(p.type)}
              className="flex flex-col items-center gap-1 rounded-md border border-gray-200 px-2 py-2 text-xs hover:border-orange-400 hover:bg-orange-50"
            >
              <p.icon size={18} className="text-gray-600" />
              <span className="text-center leading-tight">
                {t(`steps.programs.${p.type}`)}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={clearProgram}
          className="mt-2 text-xs text-gray-500 hover:text-gray-700"
        >
          {t("steps.freeText")}
        </button>
      </div>
    );
  }

  // Helpers for duration input (minutes + seconds)
  const durationMinutes = step.duration_seconds != null ? Math.floor(step.duration_seconds / 60) : 0;
  const durationSecs = step.duration_seconds != null ? step.duration_seconds % 60 : 0;

  function setDuration(minutes: number, seconds: number) {
    const total = Math.max(0, minutes * 60 + seconds);
    onChange({ ...step, duration_seconds: total || null });
  }

  return (
    <div className="space-y-2">
      {/* Program badge + change button */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1">
          <program.icon size={16} className="text-orange-600" />
          <span className="text-sm font-medium text-orange-800">
            {t(`steps.programs.${step.program_type}`)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...step, program_type: null })}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {t("steps.changeProgram")}
        </button>
      </div>

      {/* Parameter inputs */}
      <div className="flex flex-wrap gap-2">
        {program.params.map((param) => {
          if (param.field === "temperature") {
            return (
              <label key="temperature" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.temperature")}</span>
                <input
                  type="number"
                  min={param.min}
                  max={param.max}
                  value={step.temperature ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      temperature: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-16 rounded border border-gray-300 px-1.5 py-1 text-sm"
                />
                <span className="text-gray-400">°C</span>
              </label>
            );
          }

          if (param.field === "duration_seconds") {
            return (
              <div key="duration" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.duration")}</span>
                <input
                  type="number"
                  min={0}
                  value={durationMinutes || ""}
                  onChange={(e) =>
                    setDuration(e.target.value === "" ? 0 : Number(e.target.value), durationSecs)
                  }
                  className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm"
                  placeholder="min"
                />
                <span className="text-gray-400">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={durationSecs || ""}
                  onChange={(e) =>
                    setDuration(durationMinutes, e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm"
                  placeholder="sec"
                />
              </div>
            );
          }

          if (param.field === "speed") {
            return (
              <label key="speed" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.speed")}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={step.speed ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      speed: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm"
                />
              </label>
            );
          }

          if (param.field === "direction") {
            return (
              <div key="direction" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.direction")}</span>
                <div className="flex overflow-hidden rounded border border-gray-300">
                  {(["LEFT", "RIGHT"] as Direction[]).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => onChange({ ...step, direction: dir })}
                      className={`px-2.5 py-1 text-xs ${
                        step.direction === dir
                          ? "bg-orange-500 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t(`steps.directions.${dir}`)}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          if (param.field === "turbo") {
            return (
              <label key="turbo" className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={step.turbo ?? false}
                  onChange={(e) => onChange({ ...step, turbo: e.target.checked })}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-gray-500">{t("steps.params.turbo")}</span>
              </label>
            );
          }

          if (param.field === "weight_grams") {
            return (
              <label key="weight" className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">{t("steps.params.weight")}</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={step.weight_grams ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      weight_grams: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-20 rounded border border-gray-300 px-1.5 py-1 text-sm"
                />
                <span className="text-gray-400">g</span>
              </label>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
```

**Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```
feat(frontend): add ProgramStepForm component for step editor
```

---

### Task 10: Frontend — Update StepEditor and SortableStep for machine programs

**Files:**
- Modify: `frontend/src/components/StepEditor.tsx`
- Modify: `frontend/src/components/SortableStep.tsx`

**Step 1: Update StepRow type in StepEditor.tsx**

The `StepRow` type needs to support program fields. Update `StepEditor.tsx`:

```typescript
import type { CookingStepPayload } from "../api/types";

// StepRow is now an alias for CookingStepPayload
export type StepRow = CookingStepPayload;
```

Update `addStep()` to keep backward compatibility:

```typescript
function addStep() {
  onChange([...steps, { step_number: steps.length + 1, instruction: "" }]);
}
```

The `updateInstruction` function stays. Add a new `updateStep` function:

```typescript
function updateStep(index: number, updated: StepRow) {
  onChange(steps.map((step, i) => (i === index ? { ...updated, step_number: step.step_number } : step)));
}
```

Pass `isMachine` prop (boolean) to control whether program selection is available. Also pass `step` object and `onStepChange` to `SortableStep`:

```typescript
interface StepEditorProps {
  steps: StepRow[];
  onChange: (steps: StepRow[]) => void;
  label: string;
  isMachine?: boolean;
}
```

In the `SortableStep` rendering, pass additional props:

```tsx
<SortableStep
  key={stepIds[index]}
  id={stepIds[index]}
  step={step}
  onStepChange={(updated) => updateStep(index, updated)}
  onRemove={() => removeStep(index)}
  isMachine={isMachine}
/>
```

**Step 2: Update SortableStep.tsx**

Update the interface and component to handle both free text and program modes:

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CookingStepPayload } from "../api/types";
import ProgramStepForm from "./ProgramStepForm";

interface SortableStepProps {
  id: string;
  step: CookingStepPayload;
  onStepChange: (step: CookingStepPayload) => void;
  onRemove: () => void;
  isMachine?: boolean;
}

export default function SortableStep({
  id,
  step,
  onStepChange,
  onRemove,
  isMachine,
}: SortableStepProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isProgram = isMachine && step.program_type != null;
  const showProgramSelector = isMachine && step.program_type === undefined;
  // When user explicitly set program_type to null, it means "free text mode for machine step"

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 ${isProgram ? "rounded-md bg-orange-50 p-2" : ""} ${isDragging ? "z-10 scale-105 rounded-md bg-white shadow-lg" : ""}`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none pt-1.5 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        aria-label={t("steps.reorder")}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span className="shrink-0 pt-1.5 text-sm font-medium text-gray-500">
        {t("steps.stepNumber", { number: step.step_number })}
      </span>
      <div className="min-w-0 flex-1">
        {isMachine && step.program_type != null ? (
          <ProgramStepForm step={step} onChange={onStepChange} />
        ) : isMachine && !step.instruction && step.program_type === undefined ? (
          <ProgramStepForm step={step} onChange={onStepChange} />
        ) : (
          <div>
            <textarea
              value={step.instruction}
              onChange={(e) => onStepChange({ ...step, instruction: e.target.value })}
              placeholder={t("steps.instruction")}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            {isMachine && (
              <button
                type="button"
                onClick={() => onStepChange({ ...step, program_type: null })}
                className="mt-1 text-xs text-orange-500 hover:text-orange-700"
              >
                {t("steps.selectProgram")}
              </button>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md p-1.5 text-red-600 hover:bg-red-50"
        aria-label={t("common.remove")}
      >
        <X size={18} />
      </button>
    </div>
  );
}
```

Note: The logic for "new step" vs "free text" vs "program" for machine steps:
- New step added: `{ step_number, instruction: "" }` — `program_type` is `undefined` → show program selector
- User picks a program → `program_type` is set → show program form
- User clicks "Free text" in selector → set `program_type` to `null` explicitly → show textarea
- For non-machine steps: always show textarea (never show program selector)

**Step 3: Update RecipeCreatePage and RecipeDetailPage**

In both pages, pass `isMachine` to the machine StepEditor:

```tsx
<StepEditor
  steps={machineSteps}
  onChange={setMachineSteps}
  label={t("steps.machineSteps")}
  isMachine
/>
```

And update the machine steps serialization in the save payload (both pages). Replace the machine_steps filter/map:

```typescript
machine_steps: machineSteps
  .filter((s) => s.instruction.trim() || s.program_type)
  .map((s, i) => ({
    step_number: i + 1,
    instruction: s.instruction,
    ...(s.program_type != null && {
      program_type: s.program_type,
      temperature: s.temperature ?? null,
      duration_seconds: s.duration_seconds ?? null,
      speed: s.speed ?? null,
      turbo: s.turbo ?? false,
      direction: s.direction ?? null,
      weight_grams: s.weight_grams ?? null,
    }),
  })),
```

In RecipeDetailPage, also update the initial state loading for machine steps. Where it reads recipe data into state, map the existing steps to include program fields:

```typescript
const [machineSteps, setMachineSteps] = useState<StepRow[]>(
  recipe.machine_steps.map((s) => ({
    step_number: s.step_number,
    instruction: s.instruction,
    ...(s.program_type != null && {
      program_type: s.program_type,
      temperature: s.temperature,
      duration_seconds: s.duration_seconds,
      speed: s.speed,
      turbo: s.turbo,
      direction: s.direction,
      weight_grams: s.weight_grams,
    }),
  })),
);
```

**Step 4: Run type check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: No errors

**Step 5: Commit**

```
feat(frontend): wire up program step editing in StepEditor
```

---

### Task 11: Frontend Tests — Update StepEditor tests and add program step tests

**Files:**
- Modify: `frontend/src/__tests__/StepEditor.test.tsx`

**Step 1: Update existing tests for new StepRow type**

The existing `StepRow` type now includes optional program fields. Existing tests should still pass since they only use `step_number` and `instruction`. Verify:

Run: `cd frontend && npx vitest run src/__tests__/StepEditor.test.tsx`
Expected: All PASS (existing tests unchanged)

**Step 2: Add program step tests**

Add to the existing test file:

```typescript
it("renders program selector for machine steps", () => {
  const steps: StepRow[] = [{ step_number: 1, instruction: "" }];
  render(
    <StepEditor steps={steps} onChange={vi.fn()} label="Machine" isMachine />,
  );

  // Should show program selection grid
  expect(screen.getByText("steps.programs.MANUAL_COOKING")).toBeInTheDocument();
  expect(screen.getByText("steps.programs.CHOPPING")).toBeInTheDocument();
});

it("does not show program selector for non-machine steps", () => {
  const steps: StepRow[] = [{ step_number: 1, instruction: "" }];
  render(
    <StepEditor steps={steps} onChange={vi.fn()} label="By Hand" />,
  );

  expect(screen.queryByText("steps.programs.MANUAL_COOKING")).not.toBeInTheDocument();
});
```

**Step 3: Run tests**

Run: `cd frontend && npx vitest run src/__tests__/StepEditor.test.tsx`
Expected: All PASS

**Step 4: Commit**

```
test(frontend): add program step editor tests
```

---

### Task 12: Backend — Update AI generation prompt with program catalog

**Files:**
- Modify: `backend/recipes/generation.py:36-54`
- Modify: `backend/recipes/schemas.py` (if `GeneratedRecipeIn.machine_steps` needs updating)

**Step 1: Update the output schema section in the generation prompt**

In `backend/recipes/generation.py`, update the machine_steps description in `build_generation_prompt()` (around line 51-53):

Replace the machine_steps line with:

```python
f"- machine_steps (array of step objects for Thermomix or similar kitchen machines; can be empty.\n"
f"  Each step is EITHER free text OR a structured program:\n"
f"  Free text: {{\"step_number\": 1, \"instruction\": \"Add ingredients\"}}\n"
f"  Program: {{\"step_number\": 1, \"instruction\": \"\", \"program_type\": \"MANUAL_COOKING\", "
f"\"temperature\": 100, \"duration_seconds\": 300, \"speed\": 5, \"direction\": \"LEFT\", \"turbo\": false}}\n"
f"  Available programs:\n"
f"  - MANUAL_COOKING: temperature (37-130°C), duration_seconds (1-5940), speed (1-10), direction (LEFT/RIGHT), turbo (bool, optional)\n"
f"  - CHOPPING: duration_seconds (1-5940), speed (1-10)\n"
f"  - KNEADING: duration_seconds (1-5940)\n"
f"  - STEAMING: temperature (37-130°C), duration_seconds (1-5940)\n"
f"  - BLENDING: duration_seconds (1-5940)\n"
f"  - SEARING: temperature (37-130°C), duration_seconds (1-5940), speed (1-10)\n"
f"  - SLOW_COOKING: temperature (37-130°C), duration_seconds (1-43200)\n"
f"  - SOUS_VIDE: temperature (37-130°C), duration_seconds (1-43200)\n"
f"  - WEIGHING: weight_grams (1-5000)\n"
f"  - TURBO: duration_seconds (1-60)\n"
f"  - EGG_COOKING: duration_seconds (1-5940)\n"
f"  - FERMENTATION: temperature (37-60°C), duration_seconds (1-43200)\n"
f"  - PRE_CLEANING: (no parameters)\n"
f"  Prefer structured programs over free text when the step is a machine operation.)\n"
```

**Step 2: Verify `GeneratedRecipeIn` schema**

The `GeneratedRecipeIn` schema at `backend/recipes/schemas.py:154-164` uses `machine_steps: list[CookingStepIn]`. Since we already updated `CookingStepIn` in Task 3 to include the program fields, this automatically works for AI-generated recipes too.

**Step 3: Run backend tests**

Run: `python3 -m pytest backend/ -v`
Expected: All PASS

**Step 4: Commit**

```
feat(backend): add machine program catalog to AI generation prompt
```

---

### Task 13: Full Integration Test — End-to-end verification

**Step 1: Run full backend test suite**

Run: `python3 -m pytest backend/ -v`
Expected: All PASS

**Step 2: Run full frontend test suite**

Run: `cd frontend && npm test`
Expected: All PASS

**Step 3: Run linters**

Run: `ruff check backend/ --fix && ruff format backend/`
Run: `cd frontend && npm run lint`
Expected: Clean

**Step 4: Run type checks**

Run: `cd backend && mypy --config-file=../pyproject.toml .`
Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Build production frontend**

Run: `cd frontend && npm run build`
Expected: Builds successfully

**Step 6: Final commit if any lint fixes were needed**

```
chore: lint fixes
```
