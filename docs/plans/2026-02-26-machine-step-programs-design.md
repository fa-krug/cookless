# Machine Step Programs — Design

## Summary

Add structured program support to machine cooking steps. Instead of free text only, machine steps can now be a **program** with a type and typed parameters (temperature, time, speed, direction, weight). Modeled after Monsieur Cuisine / Thermomix kitchen robots but kept generic.

## Decisions

| Decision | Choice |
|----------|--------|
| Machine scope | Generic kitchen robot (Monsieur Cuisine as reference) |
| Step type | Either program OR free text (not both) |
| Cooking view display | Icon-based compact layout |
| Programs | 13 types |
| Parameter validation | Enforced ranges (server + client) |
| AI integration | Structured programs via prompt, editable after generation |
| Storage | Dedicated nullable columns on CookingStep |
| Program catalog | Hardcoded frontend constants |

## Data Model

6 new nullable fields on `CookingStep`:

```python
program_type = CharField(max_length=20, null=True, blank=True)
temperature = PositiveIntegerField(null=True, blank=True)       # °C
duration_seconds = PositiveIntegerField(null=True, blank=True)  # seconds
speed = PositiveIntegerField(null=True, blank=True)             # 1-10
turbo = BooleanField(default=False)
direction = CharField(max_length=5, null=True, blank=True)      # LEFT / RIGHT
weight_grams = PositiveIntegerField(null=True, blank=True)      # grams
```

`instruction` becomes `TextField(blank=True, default="")`.

**Step type logic:**
- `program_type` is set → structured program step (instruction ignored)
- `program_type` is null → free text step (instruction used, as today)

## Program Catalog

13 program types with their required parameters:

| Program | Params |
|---------|--------|
| MANUAL_COOKING | temperature, duration, speed, direction (+ optional turbo) |
| CHOPPING | duration, speed |
| KNEADING | duration |
| STEAMING | temperature, duration |
| BLENDING | duration |
| SEARING | temperature, duration, speed |
| SLOW_COOKING | temperature, duration (up to 12h) |
| SOUS_VIDE | temperature, duration (up to 12h) |
| WEIGHING | weight_grams |
| TURBO | duration (up to 60s) |
| EGG_COOKING | duration |
| FERMENTATION | temperature (37-60°C), duration (up to 12h) |
| PRE_CLEANING | (none) |

## Parameter Ranges

| Param | Range |
|-------|-------|
| temperature | 37–130 °C (fermentation: 37–60 °C) |
| duration_seconds | 1–5,940 (99 min), slow cook/sous vide/ferment: up to 43,200 (12h) |
| speed | 1–10 |
| direction | LEFT, RIGHT |
| weight_grams | 1–5,000 |

## API Schema

`CookingStepIn` and `CookingStepOut` gain the 6 new optional fields. Validation in `_save_steps()`:
- If `program_type` set: validate required params present and in range
- If `program_type` null: validate `instruction` non-empty
- Reject `program_type` on MANUAL method steps

Fully backward compatible — existing steps have `program_type=null`.

## Frontend — Program Definitions

Hardcoded in `src/constants/machinePrograms.ts`. Each program defines:
- `type` (string matching backend choices)
- `icon` (Lucide icon)
- `params` (list of fields with required flag, min/max, options)

i18n keys: `steps.programs.MANUAL_COOKING`, `steps.params.temperature`, etc.

## Frontend — Step Editor

Machine step rows offer a choice:
- **Free text** — textarea (existing behavior)
- **Program** — select a program type, then fill structured parameter inputs

Program step form shows:
1. Program badge (icon + name)
2. Parameter inputs (only fields for that program type)
3. Change-program button
4. Drag handle (same as today)

Program steps get a subtle background tint for visual distinction.

**Parameter inputs:**
- Temperature → number input with °C suffix
- Duration → minutes + seconds input (stored as total seconds)
- Speed → number stepper (1–10)
- Direction → two toggle buttons (Left / Right)
- Weight → number input with "g" suffix
- Turbo → checkbox

## Frontend — Cooking View

Program steps display:
1. Program name as main label
2. Compact icon row: `🌡 100°C  ⏱ 5:00  ⚡ 8  ↺ Left`

Duration formatting:
- Under 60s → "30s"
- 1–99 min → "5:00" (min:sec)
- Over 99 min → "2h 30min"

Free text steps unchanged.

## AI Generation

Extend the recipe generation prompt with the program catalog — types, parameters, and ranges. AI returns structured `program_type` + params for machine steps. These arrive as editable program cards in the recipe editor, same as manually created ones. Same validation applies.

## Testing

**Backend:**
- Program step CRUD with correct parameters
- Reject invalid program types
- Reject missing required params per program
- Reject out-of-range values
- Reject program_type on MANUAL method steps
- Backward compat: existing free text steps work
- API round-trip: create → read back all fields

**Frontend:**
- StepEditor: free text ↔ program mode switching
- StepEditor: correct fields rendered per program type
- CookingViewPage: icon-based program display
- CookingViewPage: free text still renders as text
- Duration formatting (seconds, minutes, hours)
