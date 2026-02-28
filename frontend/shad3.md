# shad3 — Overlay Components

**Goal:** Replace all native `<dialog>` usage with Radix-based overlays.

## Scope

- Add shadcn: **Dialog**, **AlertDialog**, **Drawer** (vaul), **Sheet**
- Replace `ui/Modal.tsx` → shadcn Dialog (DialogContent, DialogHeader, DialogTitle, etc.)
- Replace `ui/Drawer.tsx` → shadcn Drawer (vaul — keeps swipe-to-close)
- Replace `ui/ResponsiveOverlay.tsx` → new wrapper using shadcn Dialog (desktop) + Drawer (mobile)
- Replace `ui/ConfirmDialog.tsx` → shadcn AlertDialog
- Replace `useConfirm` hook → AlertDialog-based pattern
- Remove `useDialog` hook entirely
- Update all consumers:
  - `RecipePreviewModal`
  - `GenerateDrawer`
  - `GenerateRecipesDrawer`
  - `TagFilterDrawer`
  - `StepEditor` overlays
  - Confirm dialogs on every page

## New Dependencies

- `@radix-ui/react-dialog`
- `@radix-ui/react-alert-dialog`
- `vaul`

## Files Changed

- New `src/components/ui/dialog.tsx` (shadcn)
- New `src/components/ui/alert-dialog.tsx` (shadcn)
- New `src/components/ui/drawer.tsx` (shadcn/vaul)
- New `src/components/ui/sheet.tsx` (shadcn)
- Updated `src/components/ui/ResponsiveOverlay.tsx` (uses Dialog + Drawer)
- All components using Modal, Drawer, ConfirmDialog, or useConfirm

## Files Removed

- Old `src/components/ui/Modal.tsx`
- Old `src/components/ui/Drawer.tsx`
- Old `src/components/ui/ConfirmDialog.tsx`
- `src/hooks/useDialog.ts`
- `src/hooks/useConfirm.ts`

## Tests

Update all tests that open/close modals, drawers, or confirm dialogs — new Radix portal rendering, different DOM structure.
