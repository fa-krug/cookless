# Toast & Error Handling Design

## Problem

The frontend silently swallows backend errors. The API client (`client.ts`) correctly throws `ApiError`, but no mutation has error handling and there's no global error handler. Users see no feedback when actions fail.

## Solution

Custom toast notification system (no new dependencies) + global QueryClient error handler as safety net + per-mutation specific error messages where useful.

## Architecture

### Toast System Core

- **`ToastContext`** — React context providing `addToast(message, type)` where type is `"error" | "success"`
- **`ToastContainer`** — Fixed position at top of screen, z-50. Auto-dismiss after 4s. Fade-in/slide-down entry, fade-out exit. Max 3 stacked. Red for errors, green for success. Tap to dismiss.
- **Placement:** Wraps `<App />` in `main.tsx` alongside existing providers

### Global Error Safety Net

- QueryClient `defaultOptions.mutations.onError` calls `addToast(t("common.error"), "error")`
- Catches any mutation that doesn't provide its own `onError`

### Per-Mutation Specific Errors

Override global handler at call sites with specific messages:

- **RecipeListPage** — create/delete recipe
- **RecipeDetailPage** — update/move/delete recipe
- **HouseholdPage** — create/join/switch household, remove member
- **MealPlanPage** — generate plan
- **ShoppingListPage** — toggle/bulk-toggle items
- **SettingsPage** — save settings

All messages under `"errors"` i18n key in `en.json`/`de.json`.

### Success Toasts

Only where action navigates away and user loses page context:

- **RecipeDetailPage** — after save + navigate → "Recipe saved"
- **HouseholdPage** — after joining household → "Joined household"

Existing inline success indicators (settings saved, code copied) remain as-is.

## Non-Goals

- No toast library dependency
- No conversion of existing inline success messages
- No retry buttons in toasts (keep it simple)
