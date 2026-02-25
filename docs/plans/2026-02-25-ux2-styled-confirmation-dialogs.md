# UX2: Styled Confirmation Dialogs

## Problem

Destructive actions use `window.confirm()` and `window.prompt()`, which render as unstyled browser-native dialogs. They feel out of place in a PWA, can't be themed, and offer no undo.

## Goal

Replace all native browser dialogs with in-app confirmation modals that match the app's design system, and where appropriate, use optimistic delete with an undo toast instead.

## Design

### Confirmation Modal Component

A reusable `ConfirmDialog` component using the native `<dialog>` element:

```
Props:
  open: boolean
  title: string
  message: string
  confirmLabel: string (default: "Confirm")
  confirmVariant: "danger" | "primary" (default: "danger")
  cancelLabel: string (default: "Cancel")
  onConfirm: () => void
  onCancel: () => void
  requireTypedConfirmation?: string  // for high-risk actions (e.g., delete household)
```

Behavior:
- Uses `<dialog>` element with `showModal()` for native backdrop, focus trap, and Escape-to-close.
- Centered on screen, `max-w-sm`, rounded-lg, consistent with card styling.
- Cancel button is secondary (gray outline), confirm button matches `confirmVariant`.
- When `requireTypedConfirmation` is set, the confirm button stays disabled until the user types the exact string.

### useConfirm Hook

A hook that manages dialog state to keep usage ergonomic:

```tsx
const { confirm, ConfirmDialog } = useConfirm();

// Usage:
const confirmed = await confirm({
  title: "Delete recipe?",
  message: "This can't be undone.",
  confirmLabel: "Delete",
  confirmVariant: "danger",
});
if (confirmed) { /* proceed */ }
```

Returns a promise that resolves to `true`/`false`. The `ConfirmDialog` component is rendered by the hook and must be placed in the JSX tree.

### Undo Toast Pattern (for recipe delete)

Instead of confirming before delete, optimistically remove the recipe from the list and show an undo toast:

1. Remove recipe from React Query cache immediately.
2. Show toast: "[Recipe name] deleted" with an "Undo" button, 5-second timer.
3. After 5 seconds (or on toast dismiss), fire the actual DELETE request.
4. If "Undo" is clicked, restore the cache entry and cancel the delete.

This only applies to recipe deletion — other destructive actions (leave household, delete household, remove member) remain confirm-first because they affect shared state.

### Migration Map

| Location | Current | Replacement |
|----------|---------|-------------|
| `RecipeCard` delete | `window.confirm` | Undo toast |
| `RecipeDetailPage` delete | `window.confirm` | Undo toast (navigate back, with undo toast on list page) |
| `SettingsPage` logout | `window.confirm` | `ConfirmDialog` |
| `SettingsPage` remove password | `window.confirm` | `ConfirmDialog` |
| `HouseholdPage` delete household | `window.prompt` (type name) | `ConfirmDialog` with `requireTypedConfirmation` |
| `HouseholdPage` remove member | `window.confirm` | `ConfirmDialog` |
| `HouseholdPage` leave household | `window.confirm` | `ConfirmDialog` |
| `HouseholdPage` transfer ownership | `window.confirm` | `ConfirmDialog` |

### File Structure

```
frontend/src/components/ui/
  ConfirmDialog.tsx
frontend/src/hooks/
  useConfirm.ts
```

Toast system (`useToast`) already exists — extend it to support an action button (undo).

## Out of Scope

- Redesigning the toast visual style.
- Adding undo to non-recipe deletions (household operations are too complex to reverse client-side).

## Testing

- Unit test `ConfirmDialog`: renders, calls onConfirm/onCancel, typed confirmation gates the button.
- Unit test `useConfirm`: resolves promise correctly.
- Integration test: recipe delete shows undo toast, undo restores recipe.

## i18n

All dialog strings (title, message, button labels) must use `t()` translation keys. Add keys to both `en.json` and `de.json`.
