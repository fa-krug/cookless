# shad7 — Forms Migration (RHF + Zod)

**Goal:** Migrate all forms from useState to react-hook-form + zod schemas.

## Scope (per-form, done sequentially)

1. **LoginPage** — email + password form → zod schema, RHF `useForm`, shadcn `<Form>` wrapper
2. **RecipeCreatePage / RecipeDetailPage** — recipe form (name, times, servings, tags, ingredients, steps) → zod schema with nested arrays, RHF `useFieldArray` for ingredients/steps
3. **IngredientForm** — array of ingredients → RHF `useFieldArray`
4. **SetupWizardPage** — multi-step wizard → zod schemas per step, RHF per step
5. **SettingsPage** — language, AI config, password change → individual zod schemas
6. **HouseholdPage** — invite form, rename form → zod schemas
7. **GenerateDrawer / GenerateRecipesDrawer** — configuration forms → zod schemas
8. Remove `useRecipeForm` hook → replaced by RHF

## New Dependencies

None — all deps installed in shad2.

## Files Changed

- `src/pages/LoginPage.tsx`
- `src/pages/RecipeCreatePage.tsx`
- `src/pages/RecipeDetailPage.tsx`
- `src/components/IngredientForm.tsx`
- `src/pages/SetupWizardPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/HouseholdPage.tsx`
- `src/components/GenerateDrawer.tsx`
- `src/components/GenerateRecipesDrawer.tsx`
- New `src/lib/schemas/` directory with zod schemas per form

## Files Removed

- `src/hooks/useRecipeForm.ts` (if exists as separate file, replaced by RHF)

## Tests

Update per form — test via rendered form interactions (submit, validation errors, field changes).
