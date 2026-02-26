# Recipe Tagging System Design

## Summary

Add a household-scoped tagging system for recipes with 4 fixed categories (Dietary, Protein, Cuisine, Meal Type). Tags are used for browsing/filtering recipes and for excluding recipe types from meal plan generation.

## Data Model

### New model: `Tag` (recipes app)

- `id`: UUID primary key
- `household`: FK to Household (CASCADE)
- `category`: CharField choices — DIETARY, PROTEIN, CUISINE, MEAL_TYPE
- `name_en`: CharField(60)
- `name_de`: CharField(60)
- `is_default`: BooleanField — tracks if seeded from defaults
- Unique constraint: (household, category, name_en)
- Ordering: category, name_en

### Recipe changes

- Add M2M field `tags` to Recipe → Tag

### MealPlan changes

- Add M2M field `excluded_tags` to MealPlan → Tag

### Default tag seeding

On household creation, seed ~37 default tags:

- **Dietary (10):** Vegan, Vegetarian, Kosher, Halal, Gluten-Free, Dairy-Free, Low-Carb, Nut-Free, Whole30, Paleo
- **Protein (9):** Pork, Beef, Chicken, Duck, Turkey, Fish, Seafood, Tofu, Egg
- **Cuisine (10):** Italian, Asian, Mexican, Indian, Mediterranean, German, American, French, Middle Eastern, Thai
- **Meal Type (8):** Quick Weeknight, One-Pot, Meal-Prep, Comfort Food, Simple, Elaborate, Grilling, Salad

All tags include both `name_en` and `name_de` translations. `is_default=True`.

## API Endpoints

### Tag CRUD — `/api/v1/tags/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tags/` | List all tags for active household, grouped by category |
| POST | `/tags/` | Create a custom tag (category, name_en, name_de) |
| PUT | `/tags/{id}/` | Update tag names |
| DELETE | `/tags/{id}/` | Delete tag (removes from all recipes) |

GET response grouped by category:

```json
{
  "DIETARY": [{"id": "...", "name_en": "Vegan", "name_de": "Vegan", "is_default": true}],
  "PROTEIN": [...],
  "CUISINE": [...],
  "MEAL_TYPE": [...]
}
```

### Recipe endpoint changes

- `RecipeListOut` and `RecipeOut` gain `tags: list[TagOut]`
- `RecipeCreateIn` and `RecipeUpdatePayload` gain `tag_ids: list[UUID]`
- GET `/recipes/` gains query param `?tags=uuid1,uuid2` — filters to recipes matching any of the given tags

### MealPlan endpoint changes

- MealPlan schema gains `excluded_tag_ids: list[UUID]`
- POST `/meal-plans/setup/` accepts `excluded_tag_ids`
- PUT/PATCH on meal plan to update excluded tags

## Plan Generation Logic

In `services.py`, before the existing known_ratio split and 50-sample optimization:

1. Read `meal_plan.excluded_tags.all()`
2. Filter: `recipes.exclude(tags__in=excluded_tags)`
3. Excluded recipes are removed from the candidate pool entirely

Edge case: if exclusions reduce the pool too much, generate what's possible and show a UI warning about gaps.

## Frontend

### Recipe List Page

- Filter bar below search: 4 multi-select dropdowns (Dietary, Protein, Cuisine, Meal Type)
- Active filters shown as dismissible chips below dropdowns
- Filters passed as query params to API

### Recipe Cards

- Tags displayed as small colored chips at bottom of card
- Color-coded by category: Dietary=green, Protein=red, Cuisine=blue, Meal Type=amber

### Recipe Create/Edit Form

- "Tags" section with 4 multi-select dropdowns (one per category)
- Each lists existing tags for that category
- "+ Add" button per dropdown to create a new tag inline (popover with name_en/name_de)

### Plan Creation/Edit (GenerateDrawer)

- "Tags" section: 4 groups of checkboxes, all checked by default
- Unchecking a tag excludes recipes with that tag from generation
- Hint text: "Uncheck tags to exclude them from this plan"

### Settings Page

- "Manage Tags" section with 4 collapsible groups
- Edit names, delete tags, add new ones
- Default tags marked with subtle indicator
- Delete warns if tag is in use ("Used on X recipes — remove from all?")

### New hooks

- `useTags()` — fetches grouped tags
- `useCreateTag()`, `useUpdateTag()`, `useDeleteTag()` — mutations with cache invalidation
