# Recipe Image Support — Design

## Overview

Add image support for recipes with both manual upload and AI generation via Gemini. Images appear as thumbnails on recipe cards and as hero images on the detail page. AI features are gated by household settings.

## Decisions

- **Separate image endpoints** — Recipe CRUD stays JSON-only. Image upload/generate/delete are independent endpoints.
- **AI + manual upload** — Users can upload their own photo or generate one with AI.
- **Explicit generate button** — No auto-suggest. User clicks "Generate with AI" when they want it.
- **Title + ingredients prompt** — AI prompt includes recipe title and up to 10 ingredient names for accuracy.
- **Placeholder when no image** — Both list and detail views show a muted placeholder icon (not empty space).
- **WebP output** — All images (uploaded and generated) are resized to max 1024px and saved as WebP.

## Backend API

### New endpoints (recipe router)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/recipes/{id}/image/upload/` | Upload image (multipart, field: `image`) |
| POST | `/recipes/{id}/image/generate/` | AI-generate image from title + ingredients |
| DELETE | `/recipes/{id}/image/` | Remove image and delete file |

### Upload

- Accepts JPEG/PNG/WebP
- Max 5MB file size
- Resize to max 1024px on longest side (Pillow)
- Convert and save as WebP (quality 85)
- File naming: `recipes/{recipe_id}_{timestamp}.webp`

### AI Generate

1. Verify `household.ai_enabled` is True (else 403)
2. Verify `household.gemini_api_key` is non-empty (else 400)
3. Fetch recipe with prefetched ingredient names
4. Build prompt (see below)
5. Call Gemini `imagen-3.0-generate-002` via HTTP (urllib, no SDK)
6. Decode base64 response, resize, save as WebP
7. Delete old image file if one existed
8. Return updated RecipeOut

### AI Prompt

```
You are a professional food photographer. Generate a photorealistic,
appetizing overhead shot of the following dish on a clean, modern table
setting with natural lighting.

Dish: {title}
Key ingredients: {ingredient_names, comma-separated, max 10}

Style: Top-down food photography, shallow depth of field, warm natural
light, minimalist plating on a white or neutral ceramic plate. No text,
no watermarks, no people.
```

System instructions stay in English. Title and ingredient names use the recipe's language.

### Error handling

- Gemini error → 502 "Image generation failed"
- Gemini timeout (30s) → 504 "Image generation timed out"
- Invalid file type → 400
- File too large → 400

### Schema changes

- Add `image: str | None` to `RecipeListOut` and `RecipeOut`
- Resolve to full URL via `request.build_absolute_uri()`
- No changes to `RecipeCreateIn`

## Media Serving

- **Development:** `+ static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)` in urlpatterns (DEBUG only)
- **Production:** Django serves `/media/` directly (low volume, no CDN needed)
- **SPA catch-all fix:** Update regex from `^(?!api/).*$` to `^(?!api/|media/).*$`

## Frontend

### API client

Add `uploadFile(url, file)` helper in `api/client.ts` — uses FormData, includes CSRF token, no explicit Content-Type header.

### Types

Add `image: string | null` to `RecipeSummary` and `Recipe`.

### RecipeCard (list view)

- Image exists: square thumbnail (~64x64, object-cover)
- No image: muted placeholder icon (UtensilsCrossed)

### RecipeDetailPage (detail view)

- Hero image at top (rounded, max-height ~200px, object-cover)
- No image: placeholder with muted icon
- Action buttons below image (edit mode only):
  - **Upload** — opens file picker, uploads immediately
  - **Generate with AI** — calls generate endpoint, shows spinner
  - **Remove** (trash icon) — shown when image exists

### AI visibility rules

- `household.ai_enabled === false` → hide Generate button entirely
- `household.ai_enabled === true` but `gemini_api_key === ""` → Generate button navigates to `/settings` (AI config section)
- Both configured → Generate button works normally

### Loading states

- Upload: spinner on upload button
- Generate: spinner on generate button + pulse on placeholder
- Both buttons disabled while either is in progress

## i18n Keys

New `recipeImage` namespace:
- `upload`, `generate`, `remove`, `generating`, `uploadFailed`, `generateFailed`, `noImage`
