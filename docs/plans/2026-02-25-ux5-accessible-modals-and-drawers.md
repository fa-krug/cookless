# UX5: Accessible Modals and Drawers

## Problem

`GenerateDrawer`, `RecipePreviewModal`, and other overlay components are built with `<div>` elements. They lack focus trapping, Escape-to-close, proper ARIA roles, and screen reader announcements. Keyboard and assistive technology users cannot interact with them reliably.

## Goal

Migrate all modal/drawer overlays to use the native `<dialog>` element with proper focus management, keyboard support, and ARIA attributes.

## Design

### Base Components

Create two base components that encapsulate accessible overlay behavior:

**`Modal`** — centered overlay for content that requires attention:
```
Props:
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: "sm" | "md" | "lg" (default: "md")
```

**`Drawer`** — bottom sheet overlay for forms and secondary content:
```
Props:
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxHeight?: string (default: "85vh")
```

Both built on `<dialog>`:
- Use `dialogRef.showModal()` when `open` becomes true, `.close()` when false.
- Native `<dialog>` provides: focus trap, Escape-to-close, `::backdrop` styling, top-layer rendering.
- `aria-labelledby` points to the title element.
- On close, focus returns to the previously focused element (store `document.activeElement` before opening).
- Backdrop click calls `onClose` (detect clicks on the `<dialog>` element itself vs children).

### Drawer-Specific Behavior

- Slide-up animation via CSS: `dialog[open]` gets `translate-y-0`, default is `translate-y-full`. Use `transition: transform 300ms` (same as current).
- Positioned at viewport bottom: `align-items: flex-end` on the dialog, `max-height` constraint, internal scroll.
- Drag handle visual (decorative gray bar) at top, same as current.
- No drag-to-dismiss (complex touch handling, low value — Escape and backdrop click suffice).

### Migration Map

| Component | Current | Replacement |
|-----------|---------|-------------|
| `GenerateDrawer` | `<div>` overlay with backdrop | `<Drawer>` wrapping existing form content |
| `RecipePreviewModal` | `<div>` overlay, responsive (sheet on mobile, centered on desktop) | `<Modal>` on desktop, `<Drawer>` on mobile (use media query or a `ResponsiveOverlay` wrapper) |
| `ConfirmDialog` (from UX2) | new component | Built on `<dialog>` from the start |

### ResponsiveOverlay

For `RecipePreviewModal` which currently switches between bottom-sheet (mobile) and centered modal (desktop):

```
Props: same as Modal + Drawer combined
```

Renders `<Drawer>` when viewport < `sm` breakpoint, `<Modal>` otherwise. Uses `window.matchMedia` listener (or a `useMediaQuery` hook) to switch at runtime.

### CSS

```css
dialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

dialog {
  border: none;
  padding: 0;
  max-width: 100%;
}
```

Drawer-specific positioning uses `margin: auto 0 0 0` to anchor to bottom.

### File Structure

```
frontend/src/components/ui/
  Modal.tsx
  Drawer.tsx
  ResponsiveOverlay.tsx
  useMediaQuery.ts
```

## Out of Scope

- Drag-to-dismiss on drawers (complex, low priority).
- Animation on close (requires `dialog` close event handling with delays — deferred).
- Nested dialogs (no current use case).

## Accessibility Verification

- Focus moves into dialog on open, returns to trigger on close.
- Tab key cycles within dialog (native `<dialog>` behavior).
- Escape closes the dialog.
- Screen reader announces dialog title on open.
- Backdrop click closes dialog.

## Testing

- Unit test: Modal/Drawer open/close lifecycle, focus management.
- Unit test: Escape key triggers onClose.
- Unit test: backdrop click triggers onClose.
- Integration test: `GenerateDrawer` and `RecipePreviewModal` function correctly after migration.

## i18n

Add key `common.close` → "Close" / "Schliessen" for the close button `aria-label`.
