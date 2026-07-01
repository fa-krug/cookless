# App shell: card surfaces + vertical fill for empty states

**Date:** 2026-07-01
**Branch:** `design/nextjs-migration`
**Status:** Approved for planning

## Problem

On sparse screens (e.g. Recipes with no recipes) the content clusters at the top
of the viewport with a large empty background below it — it looks unfinished.
Two distinct causes:

1. **Content floats too high.** `main` in `web/app/(app)/layout.tsx` is `flex-1`
   (fills the viewport), but the page body is a plain `space-y-4` block that
   stacks from the top. Nothing grows to fill the leftover height, so an empty
   state hugs the top.
2. **The page looks flat.** Several surfaces float directly on the dark
   background with no containment: the Recipes filter toolbar, every empty
   state, and all of the Settings sections.

## Goal

Across all five main app routes, ground floating content on card surfaces and
let sole-content empty states center vertically in the available space — without
redesigning any page's information architecture.

## Non-goals

- No IA/layout redesign of Settings (only wrap existing sections in cards).
- Do **not** card the Recipes title header, the Plan config-button row, or the
  Shopping meta row — those would read as over-boxed.
- Recipe list items and Shopping category groups are already cards — untouched.

## Theme note

Dark mode `--card` is `oklch(0.21 …)` vs `--background` `oklch(0.141 …)`, so
card surfaces read as gentle elevation. Light mode `--card` and `--background`
are both white, so cards rely on their `border` for definition (same as the
existing `Card` primitive and `ShoppingCategory`).

## Mechanisms

### Mechanism 1 — Vertical fill for sole-content empty states

- `web/app/(app)/layout.tsx`: the `<main>` element gains `flex flex-col min-h-0`
  in addition to its current classes. `min-h-0` keeps `overflow-y-auto` working
  when content is tall.
- `EmptyState` (`web/components/ui/empty-state.tsx`) gains a `fill?: boolean`
  prop (default `false`).
  - When `fill` is `true`, the component renders a growing wrapper
    (`flex flex-1 items-center justify-center`) around the card so the card is
    centered in the leftover space. The wrapper — not the card — takes `flex-1`,
    so the card keeps its natural height rather than stretching tall.
  - When `fill` is `false`, the card renders inline at natural height (current
    behavior, minus the fixed `py-16` which moves onto the card itself).
- For `fill` to resolve, a page's root container must be a flex column that
  grows. Pages that use a fill empty state switch their root container from
  `space-y-4` (block) to `flex flex-1 flex-col gap-4`.

### Mechanism 2 — `EmptyState` renders as a card

`EmptyState` gains a card surface by default: `rounded-xl border bg-card
shadow-sm`, `max-w-md`, centered content (`flex flex-col items-center gap-3
text-center`) with generous internal padding (e.g. `px-6 py-12`). This is the
only globally-shared visual change; it grounds every empty/placeholder state at
once. All existing `EmptyState` callers keep working — `icon`, `title`,
`subtitle`, `action` props are unchanged.

## Per-page application

| Route | File | Fill empty state | Card treatment |
|-------|------|------------------|----------------|
| Home | `web/app/(app)/page.tsx` | `fill` on the single `EmptyState` | via EmptyState card |
| Recipes | `web/app/(app)/recipes/page.tsx` | no-recipes **and** no-results → `fill` | wrap `<RecipeFilters>` in a padded `Card` |
| Plan | `web/app/(app)/plan/page.tsx` | "no plan" branch → `fill`; "no active iteration" → inline card (no fill) | content already carded; no toolbar |
| Shopping | `web/components/shopping/shopping-list-view.tsx` | empty **and** all-done → `fill` | categories already cards; leave meta row |
| Settings | `web/app/(app)/settings/settings-client.tsx` + `account-section.tsx` | n/a (content fills) | wrap each `<section>` and `AccountSection` in a `Card` |

### Recipes

- Wrap `<RecipeFilters …/>` in `<Card className="p-3">` (or equivalent padding).
- Root `<div className="space-y-4">` → `flex flex-1 flex-col gap-4`.
- Both empty-state branches (no recipes, no search results) pass `fill`.
- The `RecipeList` branch is unchanged; with content present the list flows from
  the top naturally (root growing does not stretch the list).

### Plan

- Only the early-return "no plan" branch needs fill: its root
  `space-y-4` → `flex flex-1 flex-col gap-4`, and its `EmptyState` gets `fill`.
- The main return (has plan) is unchanged. The inline "no active iteration"
  `EmptyState` renders as a card at natural size (no `fill`) so it sits among
  the iteration cards.

### Shopping

- The empty and all-done early-return branches: root `space-y-4` →
  `flex flex-1 flex-col gap-4`, `EmptyState` gets `fill`.
- The populated return (meta row + category list) is unchanged; category groups
  are already cards, and the single-line meta row is intentionally not carded.

### Settings

- In `settings-client.tsx`, wrap each of the five `<section>` blocks in a `Card`
  with consistent padding (e.g. `Card` + `p-4`, keeping the existing
  `space-y-2` inside).
- In `account-section.tsx`, wrap the returned `<section>` in a matching `Card`
  so the account block is consistent with the others. The `{dialog}` element
  stays rendered (outside or inside the card is fine; keep current position).
- The `space-y-8` outer spacing between cards is preserved.

## Testing / verification

This is a presentational change with no logic. Verify via the dev server preview:

1. Recipes with zero recipes → empty state is a centered card, not top-hugging;
   filter toolbar sits in a card.
2. Recipes with a search that returns nothing → centered card.
3. Plan with no plan → centered card.
4. Shopping with no list and with an all-checked list → centered card.
5. Settings → each section is a distinct card; page fills naturally.
6. A populated Recipes list and populated Shopping list still flow from the top
   (content-present layouts unchanged).
7. Light and dark mode both read correctly (border visible in light mode).
8. Mobile viewport (`preview_resize` mobile): cards are full-width and readable;
   nothing overflows horizontally.

No unit tests are added — there is no behavioral logic. Existing tests must still
pass (`cd web && npm test`) since `EmptyState`'s public props are unchanged.

## Risks

- `flex-1` on a page root requires the flex-column chain (`main` → page root) to
  be intact; if a page root is missed, its empty state simply won't fill (falls
  back to top — no breakage).
- `min-h-0` on `main` is needed so a tall populated page still scrolls rather
  than clipping. Verify populated Recipes list scrolls.
