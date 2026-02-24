# Responsive Layout Design

## Goal

Improve space usage on tablets and desktops while keeping the mobile-first PWA experience intact.

## Decisions

- **Breakpoint:** `md` (768px) — sidebar kicks in at tablets in landscape and up
- **Navigation:** Bottom bar on mobile, fixed left sidebar (icon + label, `w-56` / 224px) on `md+`
- **Content:** Centered single column capped at `max-w-3xl` (768px) with `mx-auto`
- **Page components:** No changes — existing `p-4` padding works inside the capped container

## Layout Structure

### Mobile (< 768px) — unchanged

```
┌─────────────────────┐
│    InstallBanner     │
├─────────────────────┤
│                     │
│    Page content     │
│    (full width)     │
│                     │
├─────────────────────┤
│  BottomNav (fixed)  │
└─────────────────────┘
```

### Tablet/Desktop (>= 768px)

```
┌──────────┬──────────────────────────────┐
│          │                              │
│  Sidebar │    ┌── max-w-3xl ──┐         │
│  (w-56)  │    │               │         │
│          │    │ Page content  │         │
│  Brand   │    │ (centered)    │         │
│  ------  │    │               │         │
│  Recipes │    └───────────────┘         │
│  Plan    │                              │
│  Shop    │                              │
│  Settings│                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

## Files to Change

### `Layout.tsx`

- Wrap `<main>` content area: add `max-w-3xl mx-auto` and `md:ml-56` (offset for sidebar)
- Remove `pb-16` on `md+` (no bottom nav clearance needed)
- Keep `pb-16` on mobile via `pb-16 md:pb-0`

### `BottomNav.tsx` (rename consideration: `Navigation.tsx`)

Renders two modes from the same component:

- **Mobile (`md:hidden`):** Current horizontal fixed-bottom bar, unchanged
- **Desktop (`hidden md:flex`):** Fixed left sidebar, `w-56 h-screen`, vertical nav items with icon + label side-by-side, brand/logo at top
- Active state: orange highlight (same as current)
- Shared `navItems` array used by both renders

## What Stays the Same

- All page components (`RecipeListPage`, `MealPlanPage`, etc.) — no changes
- `LoginPage` / `InvitePage` — outside Layout, already centered
- `GenerateDrawer` — already has `max-w-lg` cap
- Routing, auth, data fetching — untouched
- `InstallBanner` — stays above main content
