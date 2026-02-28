# shad6 — Navigation & Layout

**Goal:** Modernize the sidebar/bottom-nav and add dropdown menus.

## Scope

- Add shadcn: **DropdownMenu**, **Tooltip**, **ScrollArea**
- Redesign `BottomNav.tsx`:
  - Mobile: bottom nav stays (4 icons), styled with shadcn patterns
  - Desktop: sidebar uses shadcn-styled nav items with Tooltip on collapsed state
- Add DropdownMenu for user/household actions in sidebar
- Add Tooltip to icon-only buttons across the app (delete, edit, sort, etc.)
- Add ScrollArea to long scrollable areas (recipe lists, shopping lists, ingredient forms)
- Update `Layout.tsx` structure

## New Dependencies

- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-tooltip`
- `@radix-ui/react-scroll-area`

## Files Changed

- New `src/components/ui/dropdown-menu.tsx` (shadcn)
- New `src/components/ui/tooltip.tsx` (shadcn)
- New `src/components/ui/scroll-area.tsx` (shadcn)
- `src/components/BottomNav.tsx` (redesign)
- `src/components/Layout.tsx` (structure updates)
- Various pages/components where Tooltip and ScrollArea are added

## Files Removed

None — BottomNav is refactored, not removed.

## Tests

Update navigation tests, layout tests.
