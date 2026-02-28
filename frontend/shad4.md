# shad4 — Toast System (Sonner)

**Goal:** Replace custom toast context with Sonner.

## Scope

- Install `sonner`
- Add shadcn **Sonner** component (themed wrapper)
- Add `<Toaster />` to `AppProviders.tsx`
- Replace all `useToast()` → `toast()` / `toast.success()` / `toast.error()` from sonner
- Migrate undo pattern (soft-delete with action) → `toast()` with `action` option
- Update global mutation error handler in `AppProviders` → `toast.error()`
- Remove custom toast context and provider

## New Dependencies

- `sonner`

## Files Changed

- New `src/components/ui/sonner.tsx` (shadcn themed wrapper)
- `src/components/AppProviders.tsx` (add `<Toaster />`, update error handler)
- Every file that calls `useToast()` or `addToast()` (replace with `toast()`)

## Files Removed

- `src/contexts/ToastContext.tsx` (or combined toast context/provider file)
- Any `useToast` hook file

## Tests

Update tests that mock/assert toasts — replace `useToast` mocks with `sonner` mocks or spies.
