# Plan 8b — Cook-Mode Parity (design)

**Date:** 2026-06-28
**Branch:** `design/nextjs-migration`
**Part of:** Next.js migration, Plan 8 Section B (parity follow-ons). See `docs/superpowers/specs/2026-06-27-nextjs-migration-design.md` and the Plan 8 cutover plan.

## Problem

The Plan-6 cook-mode page (`web/components/cooking/cooking-view.tsx`) is functional but lost five features the old React/Vite cook view (`frontend/src/pages/CookingViewPage.tsx`) had. The migration parity audit (2026-06-27) flagged these as M3/M4/M5 plus two adjacent regressions:

1. **Wake-lock (M3)** — the old view kept the screen awake while cooking via the Screen Wake Lock API and re-acquired it on tab re-focus. The new view does nothing, so the phone sleeps mid-recipe.
2. **Program/machine step parameters (M4)** — for machine steps the new cook view shows only the program name + instruction. Temperature, duration, speed, direction, turbo, and weight are never shown during cooking, even though `recipe-detail.tsx` renders them and the data is already in the DTO.
3. **Swipe navigation (M5)** — the old view advanced/retreated steps on horizontal touch swipe; the new view is buttons-only.
4. **Progress bar + jump-to-step** — the old view showed a clickable progress bar (one dot per step) that doubled as a jump-to-step control; the new view shows only "Step X of Y" text.
5. **Live servings adjustment** — the old view kept a −/＋ servings control on the cooking screen so quantities rescaled mid-cook; the new view locks servings once cooking starts.

All required data already flows through `CookingStepDto` (`web/lib/queries/recipes.ts`): `temperature`, `durationSeconds`, `speed`, `turbo`, `direction`, `weightGrams`. **No schema, query, or server-action changes** — this is client UI plus one browser-API hook.

## Scope

**In scope (full parity):** all five items above.

**Out of scope (YAGNI — absent in *both* apps):** ingredient checklist / "mark prepared", step timers. The unused `cooking.timerRunning` key stays unused; no new i18n keys are added.

## Design decisions (locked via AskUserQuestion 2026-06-28)

- **Scope:** full parity (all 5), no net-new features.
- **Param display style:** reuse the existing **text + label-chip** style from `recipe-detail.tsx` (the `formatDuration` helper + `steps.params.*` / `steps.directions.*` / `steps.units.*` keys), **not** the old icon-based `ProgramStepDisplay`. Keeps the new app visually consistent and avoids a new icon component.
- **Param renderer sharing:** **extract** the inline chip block from `recipe-detail.tsx` into a shared `StepParams` component reused by both recipe-detail and the cook view (render-equivalent refactor of recipe-detail).

## Units of work

Each unit is independently understandable and testable.

### 1. `useWakeLock` hook — `web/lib/hooks/use-wake-lock.ts`

Port the old `frontend/src/hooks/useWakeLock.ts`:
- On enable, call `navigator.wakeLock.request("screen")`, store the `WakeLockSentinel`, set `active = true`.
- Re-acquire on `document` `visibilitychange` when the page becomes visible again (the sentinel auto-releases when the tab is hidden).
- Release the sentinel and remove the listener on unmount / disable.
- Feature-detect: if `navigator.wakeLock` is undefined or the request rejects, no-op and leave `active = false` — never throw.
- Signature: `useWakeLock(enabled: boolean): { active: boolean }`. Cook view passes `enabled = started`.

**Interface:** depends only on browser globals. Consumers read `active` for the status dot.

**Testing:** the hook is imperative browser-API glue; behavior is verified by the deferred manual browser smoke (consistent with prior plans). No bespoke jsdom navigator mock — keep the hook thin enough that there is no pure logic worth unit-testing inside it.

### 2. Shared `StepParams` component — `web/components/recipes/step-params.tsx`

- Extract the param-chip block (temperature, duration via `formatDuration`, speed, direction, weight, turbo) and the `formatDuration` helper out of `recipe-detail.tsx` into `StepParams`.
- Props: the `CookingStepDto`-shaped step (the fields it reads) — `{ step }`. It calls `useT()` itself (client component, no function props across boundaries — matches the migration's island convention).
- Refactor `recipe-detail.tsx` to render `<StepParams step={step} />` in place of the inline block. **No visual change** in recipe-detail.
- Render `<StepParams>` in the cook view's current-step card (below the instruction).

**Interface:** one prop (`step`); self-contained i18n. Reused by two call sites.

**`formatDuration` home:** move it from `recipe-detail.tsx` into the pure module `web/lib/display/format.ts` and export it; `StepParams` imports it. Add a TDD test (`<60s → "Ns"`, whole minutes → "Nm", mixed → "Nm Ns"). Visual equivalence in recipe-detail is confirmed by `tsc` + `next build` and review (render-equivalent extraction).

### 3. Pure swipe helper — `web/lib/cooking/swipe.ts`

- `resolveSwipe(dx: number, dy: number, threshold = 50): "next" | "prev" | null`
  - Returns `null` if `|dx| < threshold` or the gesture is vertical-dominant (`|dy| >= |dx|`).
  - `dx < 0` (leftward) → `"next"`; `dx > 0` (rightward) → `"prev"`.
  - `dx = endX − startX` (matches old delta sign convention).
- Cook view adds `onTouchStart`/`onTouchEnd` on the step card that capture coordinates and call `resolveSwipe`, then advance/retreat `stepIdx` (clamped). Show the existing `cooking.swipeHint` line on mobile (`sm:hidden`).

**Interface:** pure function, no DOM. **Testing:** TDD — left/right/short/vertical/exactly-threshold cases.

### 4. Progress bar + jump-to-step — in `cooking-view.tsx`

- Replace the lone "Step X of Y" line with the old progress UI: keep the `cooking.stepOf` counter, add a row of `steps.length` button "dots" (flex-1 bars). Dots at index `<= stepIdx` are filled (`bg-primary`), the rest muted.
- Clicking a dot sets `stepIdx` to that index (jump-to-step), clamped to valid range.

**Testing:** rendering/interaction verified by review + build; no new pure logic.

### 5. Live servings adjustment — in `cooking-view.tsx`

- Surface the existing −/＋ servings control (currently only on the pre-start screen) on the cooking screen header/area, bound to the same `servings` state. Ingredient quantities already rescale via `scaleQuantity(...)` against `servings`, so this is wiring an existing control into the cooking layout.
- Keep the 1–12 clamp already used pre-start.

**Testing:** review + build; quantity scaling logic already tested in the domain layer.

## Data flow

`cook/[id]/page.tsx` (RSC, unchanged) → `getRecipe`/ingredient/unit queries → `<CookingView>` (client). All five features operate entirely inside `CookingView` and its two new helpers/components. No server round-trips, no new routes, no new queries.

## Error handling

- Wake-lock: feature-detect + swallow rejection (older/desktop browsers, denied permission) → `active = false`, no UI error.
- Swipe: pure math, no failure mode; ignored when no horizontal intent.
- Jump-to-step / servings / progress: bounded by clamps already in the component.

## i18n

**Zero new keys.** Verified present in `web/lib/i18n/locales/{en,de}.json`: `cooking.swipeHint`, `cooking.stepOf`, `cooking.start/done/prevStep/nextStep`, `steps.params.*`, `steps.directions.*`, `steps.units.*`, `steps.programs.*`, `steps.manual/machineSteps`, `recipes.servings`.

## Verification

- TDD for the pure pieces: `resolveSwipe`, and `formatDuration` if not already covered.
- `tsc --noEmit` clean; `next build` OK (no new routes expected); Vitest green.
- i18n en/de parity unchanged (no added keys).
- Manual browser smoke (wake-lock acquisition + tab-refocus re-acquire, touch swipe) **deferred** to the on-host/manual pass, consistent with Plans 4–8.
- Subagent-driven execution; per-task review; final whole-branch review for the 8b range.

## Files

| Path | Change |
| --- | --- |
| `web/lib/hooks/use-wake-lock.ts` | NEW — wake-lock hook |
| `web/lib/cooking/swipe.ts` | NEW — `resolveSwipe` pure helper |
| `web/lib/cooking/swipe.test.ts` | NEW — TDD tests |
| `web/components/recipes/step-params.tsx` | NEW — shared param-chip renderer (+ `formatDuration`) |
| `web/components/recipes/recipe-detail.tsx` | EDIT — consume `StepParams` (render-equivalent) |
| `web/components/cooking/cooking-view.tsx` | EDIT — wake-lock dot, `StepParams`, swipe, progress/jump, live servings |
| `web/lib/display/format.ts` | EDIT — add testable `formatDuration` (moved from recipe-detail) |
| `web/lib/display/format.test.ts` | NEW/EDIT — `formatDuration` test |
