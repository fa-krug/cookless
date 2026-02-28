# shad8 — Specialized & Polish Components

**Goal:** Add remaining shadcn components for polish and consistency.

## Scope

- Add shadcn: **Popover**, **Command** (cmdk), **Toggle**, **ToggleGroup**, **Avatar**, **Collapsible**
- Replace tag filter UI → Popover with checkboxes (or keep drawer, styled with shadcn)
- Consider Command for recipe search (typeahead with fuzzy matching — optional)
- Add Avatar for household members on HouseholdPage
- Use Collapsible for shopping categories (expand/collapse)
- Use ToggleGroup for any multi-option selectors

## New Dependencies

- `@radix-ui/react-popover`
- `cmdk` (optional)
- `@radix-ui/react-toggle`
- `@radix-ui/react-collapsible`
- `@radix-ui/react-avatar`

## Files Changed

- New `src/components/ui/popover.tsx` (shadcn)
- New `src/components/ui/command.tsx` (shadcn, optional)
- New `src/components/ui/toggle.tsx` (shadcn)
- New `src/components/ui/toggle-group.tsx` (shadcn)
- New `src/components/ui/avatar.tsx` (shadcn)
- New `src/components/ui/collapsible.tsx` (shadcn)
- `src/components/TagFilterDrawer.tsx` (Popover refactor)
- `src/pages/HouseholdPage.tsx` (Avatar for members)
- `src/components/ShoppingCategory.tsx` (Collapsible)

## Files Removed

None — existing components are refactored.

## Tests

Update affected component tests.
