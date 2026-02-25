# Iteration-Based Meal Plan Design

## Overview

Rework the meal plan from a single disposable plan into a rolling iteration-based system. Each iteration is a 1-3 week block of meals. When one iteration ends, the user generates the next. Old iterations are archived, not deleted. Recipe selection avoids duplicates from the immediately previous iteration.

## Data Model

### MealPlan (reworked — long-lived config container)

One per household. Stores configuration, no longer stores date ranges.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| household | FK(Household) | CASCADE, unique |
| iteration_weeks | int (1-3) | Duration of each iteration |
| shopping_days | JSONField (list of ints) | 0=Mon..6=Sun, 1-2 entries |
| servings | int | Default servings |
| known_ratio | float | KNOWN vs TO_TRY ratio |
| default_leftover_days | int | Leftover day count |
| created_at | datetime | |

Removed: `start_date`, `end_date` (moved to PlanIteration).

### PlanIteration (new)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| meal_plan | FK(MealPlan) | CASCADE, related_name="iterations" |
| start_date | date | Always a shopping day weekday |
| end_date | date | |
| status | str | ACTIVE or ARCHIVED |
| created_at | datetime | |

Ordering: `-start_date`.

### MealPlanEntry (re-pointed)

- FK changes from `meal_plan` → `iteration` (FK to PlanIteration)
- All other fields unchanged

### ShoppingList (re-pointed + extended)

- FK changes from `meal_plan` → `iteration` (FK to PlanIteration)
- New field: `shopping_date` (date) — the specific day this list covers
- Each list covers entries from `shopping_date` to the day before the next shopping date (or iteration end)

## Shopping Day Rules

- 1-2 shopping days per week
- If 2 days: must be at least 3 days apart
- Iteration start date aligns with a shopping day
  - 1 shopping day: iteration starts on that weekday
  - 2 shopping days: iteration starts on the first one
- First-time start_date snaps forward to nearest shopping day
- No shopping day on the last day of an iteration (enforced by alignment)

### Shopping Segment Calculation

Within an iteration, lay out all shopping day occurrences. Each segment covers from its shopping date to the day before the next shopping date (or iteration end).

Example: 2-week iteration (Sat Feb 28 – Fri Mar 13), shopping on Wed + Sat:
- Wed Mar 4: covers Feb 28 – Mar 6 (iteration start through Fri)
- Sat Mar 7: covers Mar 7 – Mar 10 (Sat–Tue)
- Wed Mar 11: covers Mar 11 – Mar 13 (Wed–Fri, iteration end)

The first shopping list always covers from `iteration.start_date`.

## API Endpoints

### `POST /api/v1/meal-plans/setup/`

Create or update household's MealPlan config and generate the first iteration.

Request:
```json
{
  "iteration_weeks": 2,
  "shopping_days": [5],
  "servings": 2,
  "known_ratio": 0.7,
  "default_leftover_days": 1,
  "start_date": "2026-02-28"
}
```

Returns: MealPlan with first iteration.

### `GET /api/v1/meal-plans/`

Returns household's MealPlan config with all iterations (active first, then archived descending).

### `POST /api/v1/meal-plans/iterations/{iteration_id}/renew/`

Re-generate recipes for a specific iteration. Deletes entries + shopping lists, re-runs generation. Considers previous iteration to avoid duplicates.

### `POST /api/v1/meal-plans/iterations/next/`

Generate the next iteration. `start_date` = previous iteration's `end_date + 1`. Archives the previous iteration. Uses saved config.

### `GET /api/v1/meal-plans/iterations/{iteration_id}/`

Get a single iteration with entries.

### Removed

`POST /api/v1/meal-plans/generate/` — replaced by `setup` and `next`.

## Generation Logic

### Recipe Selection — Duplicate Avoidance

When generating an iteration:
1. Fetch all recipe IDs from the immediately previous iteration (by start_date)
2. Pass as `exclude_ids` to `_select_recipes_with_overlap()`
3. If recipe pool minus exclusions is too small, allow repeats as fallback

### Shopping List Generation

Per iteration, compute shopping segments and generate one ShoppingList per segment. Each list aggregates ingredients only for entries within its date range.

### Renew

Delete all entries + shopping lists for the iteration. Re-run recipe selection + scheduling. Same duplicate avoidance from previous iteration.

### Next Iteration

1. Compute `start_date` = previous `end_date + 1`
2. `end_date` = `start_date + (iteration_weeks * 7) - 1`
3. Archive previous iteration (status = ARCHIVED)
4. Generate entries + shopping lists

## Frontend Layout

### Plan Page (top to bottom)

1. **Header:** "Essensplan" + config button (gear icon → opens GenerateDrawer)
2. **Next iteration prompt** (if active iteration has ended): empty card with generate button
3. **Active iteration:** section header with date range + renew button, day cards with entries
4. **Archived iterations:** collapsed accordion, most recent first, click to expand (read-only)

### Day Card Visual Markers

- **Today:** orange border + ring + "Heute" badge
- **Shopping day:** shopping cart icon in date header, distinct visual marker
- **Iteration boundary:** section separator with date range header

### GenerateDrawer (reworked)

- Iteration length: toggle (1 / 2 / 3 weeks)
- Shopping days: weekday picker (tap to select 1-2, validation for 3-day gap)
- Servings: number input (1-12)
- Known/New ratio: range slider
- Default leftover days: number input (0-3)
- Start date: date picker (snaps to nearest shopping day)
- Accessible from plan page via config button

## Migration Strategy

### Database

1. Create `PlanIteration` model
2. Modify `MealPlan`: remove `start_date`/`end_date`, add config fields
3. Data migration: for each existing MealPlan, create a PlanIteration with the plan's dates, move entries + shopping lists
4. Alter FKs on MealPlanEntry and ShoppingList

### Frontend

- Split PlanGrid into IterationCard + orchestrating PlanPage
- Rework GenerateDrawer with new config fields
- Update types, hooks, API calls

### No breaking changes for users — existing plans migrate into the new structure.
