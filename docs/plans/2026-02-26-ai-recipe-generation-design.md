# AI Recipe Generation Design

**Goal:** Let users generate batches of recipes via Gemini AI, with tag selection, free-text guidance, optional image generation, and a preview/review step before saving.

## Data Flow & API

### Generate endpoint: `POST /api/v1/recipes/generate/`

Request schema:
- `count: int` (1-20, default 10)
- `tag_ids: list[UUID]` (desired tags for generated recipes)
- `free_text: str` (additional guidance, e.g., "comfort food for cold weather")
- `generate_images: bool` (default true)

Response: NDJSON stream. Each line is a JSON object:
- `{"type": "recipe", "index": 0, "data": {...}}` -- a generated recipe with title, ingredients, steps, tags, servings, times
- `{"type": "image", "index": 0, "data": {"image_url": "..."}}` -- image URL for a recipe
- `{"type": "done"}` -- stream complete

Flow:
1. Fetch up to 10 existing household recipes as style reference (random sample, prioritizing tag-matching ones).
2. Build prompt with recipe structure, ingredient catalog, unit catalog, and style examples.
3. Call Gemini text model, parse structured JSON response.
4. Stream each parsed recipe to frontend immediately.
5. If `generate_images` is true, generate images sequentially using the existing IMAGE_PROMPT_TEMPLATE pattern, streaming each image URL as it completes.

### Save endpoint: `POST /api/v1/recipes/bulk-create/`

Request: list of recipe objects (same shape as RecipeCreateIn). All land in TO_TRY list.

Creates all recipes in a single transaction, reusing `_save_ingredients`, `_save_steps`, and tag-setting logic. Creates new ingredients if Gemini invents ones not in the catalog.

## Prompt Engineering

The generation prompt has layered sections:

1. **System context:** Professional recipe creator, output structured JSON.
2. **Style reference:** 5-10 existing recipes serialized (title, ingredients with quantities/units, steps, tags) so Gemini matches writing style, complexity, and ingredient naming.
3. **Ingredient/unit catalog:** Full lists so Gemini uses exact existing names. New ingredients allowed but must follow naming pattern (lowercase, singular, bilingual en/de).
4. **Tag context:** Selected tags with names so Gemini understands what each tag means.
5. **Output schema:** Strict JSON schema -- title, default_servings, prep/cook times, leftover_days, ingredients, manual_steps, machine_steps, tag names.
6. **Variety instruction:** Ensure distinct recipes across the batch -- vary cooking methods, main ingredients, complexity.
7. **Free-text guidance:** User's additional constraints appended.
8. **Language:** Recipes generated in user's preferred language (en/de).

If zero existing recipes, skip style reference section.

## Frontend UX

### Recipe List Page
- "Generate with AI" button (Sparkles icon) next to "+" button.
- Hidden when `ai_enabled` is false.
- If `ai_enabled` but no `gemini_api_key`, navigates to `/settings` (AI config section).

### Generation Panel (Drawer)
- Bottom Drawer (matching existing GenerateDrawer pattern).
- Fields: count slider/input (1-20, default 10), tag dropdowns grouped by category (reusing RecipeListPage filter pattern), free-text textarea, "Generate images" checkbox (default on).
- "Generate" button at bottom.

### Preview/Review Panel
- After Generate, transitions to review screen.
- Recipes appear one by one as they stream in -- each as a card with title, ingredient count, tag chips, checkbox (default selected).
- Images load into cards progressively.
- Loading skeleton for recipes still generating.
- "Save X recipes" button at bottom (count updates with checkbox toggles).
- "Cancel" discards everything.

## Error Handling

- **AI not configured:** Button hidden when `ai_enabled` is false. Redirects to settings when `gemini_api_key` is empty.
- **Text generation failure:** Error toast, close preview panel.
- **Image failure for one recipe:** Skip silently, show placeholder. Don't block remaining images.
- **Timeouts:** 60s for text generation, 30s per image.
- **No existing recipes:** Prompt works without style reference section.
- **Duplicate titles:** No dedup. User can see and deselect duplicates in preview.
- **Count cap:** 20 max per batch.
