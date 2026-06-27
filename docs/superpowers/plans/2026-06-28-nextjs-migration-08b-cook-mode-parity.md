# Cook-Mode Parity (Plan 8b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Next.js cook-mode view to feature parity with the old React/Vite cook view by restoring wake-lock, machine-step parameter display, swipe navigation, a clickable progress bar (jump-to-step), and live servings adjustment.

**Architecture:** Pure client-side work inside `web/components/cooking/cooking-view.tsx` plus four small new units (a wake-lock hook, a pure swipe helper, a shared `StepParams` renderer, and a moved-and-tested `formatDuration`). All required data already flows through `CookingStepDto`; no schema, query, server-action, route, or i18n-key changes.

**Tech Stack:** Next.js (App Router) · React 19 client components · TypeScript · Vitest · Tailwind 4 · Screen Wake Lock API · existing `useT()` i18n + `scaleQuantity` domain helper.

## Global Constraints

- All commands run from the `web/` directory unless stated otherwise.
- Verification toolchain (no ESLint in this app): `npm test` (vitest run), `npm run typecheck` (`tsc --noEmit`), `npm run build` (`next build`).
- **Zero new i18n keys.** Every key used here already exists in `web/lib/i18n/locales/{en,de}.json`: `cooking.swipeHint`, `cooking.stepOf`, `cooking.start`, `cooking.done`, `cooking.prevStep`, `cooking.nextStep`, `steps.params.*`, `steps.directions.*`, `steps.units.*`, `steps.programs.*`, `steps.manualSteps`, `steps.machineSteps`, `recipes.servings`.
- Client components call `useT()` themselves — never pass functions across the RSC boundary (migration island convention).
- Quantities are scaled with the existing `scaleQuantity(quantity, servings, defaultServings)` from `@/lib/domain/recipes/scaling`; never introduce float math.
- Follow existing file conventions; new pure logic is TDD'd vs Vitest. Browser-API behavior (wake-lock, touch) is verified by the deferred manual smoke pass, consistent with Plans 4–8.
- Commit after each task with a `feat(web):` / `refactor(web):` / `test(web):` prefix referencing "Plan 8b".

---

### Task 1: Move `formatDuration` into the pure display module (TDD)

`formatDuration` currently lives inline in `recipe-detail.tsx` (lines 22-27). Move it to `web/lib/display/format.ts` so it is unit-testable and reusable by the new `StepParams` component.

**Files:**
- Modify: `web/lib/display/format.ts`
- Modify (test): `web/lib/display/format.test.ts`
- Modify: `web/components/recipes/recipe-detail.tsx` (remove the local copy, import the moved one)

**Interfaces:**
- Produces: `export function formatDuration(seconds: number): string` — `<60s → "Ns"`, whole minutes → `"Nm"`, mixed → `"Nm Ns"`.

- [ ] **Step 1: Write the failing test**

Append to `web/lib/display/format.test.ts`:

```ts
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("shows whole minutes with no trailing seconds", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(120)).toBe("2m");
  });

  it("shows minutes and seconds when mixed", () => {
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(125)).toBe("2m 5s");
  });
});
```

(Add `formatDuration` to the existing import line if you prefer a single import; a second `import` from `./format` is also fine.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/display/format.test.ts`
Expected: FAIL — `formatDuration` is not exported from `./format`.

- [ ] **Step 3: Add the function to `format.ts`**

Append to `web/lib/display/format.ts`:

```ts
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
```

- [ ] **Step 4: Remove the inline copy from `recipe-detail.tsx`**

Delete the local `formatDuration` definition (lines 22-27) and import it instead. Add to the imports near the top of `web/components/recipes/recipe-detail.tsx`:

```ts
import { formatDuration } from "@/lib/display/format";
```

(If `recipe-detail.tsx` already imports other names from `@/lib/display/format`, add `formatDuration` to that existing import line instead of adding a new one.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run lib/display/format.test.ts && npm run typecheck`
Expected: PASS; tsc clean (no remaining references to a local `formatDuration`).

- [ ] **Step 6: Commit**

```bash
git add web/lib/display/format.ts web/lib/display/format.test.ts web/components/recipes/recipe-detail.tsx
git commit -m "refactor(web): move formatDuration to display module + test (Plan 8b Task 1)"
```

---

### Task 2: Shared `StepParams` component + refactor recipe-detail to consume it

Extract the machine-step parameter chip block out of `recipe-detail.tsx` into a reusable client component so the cook view can render the same parameters. Render-equivalent in recipe-detail (no visual change).

**Files:**
- Create: `web/components/recipes/step-params.tsx`
- Modify: `web/components/recipes/recipe-detail.tsx` (replace inline chip block, ~lines 182-218, with `<StepParams step={step} />`)

**Interfaces:**
- Consumes: `formatDuration` from `@/lib/display/format` (Task 1); `useT` from `@/lib/i18n/provider`.
- Produces: `export function StepParams({ step }: { step: StepParamFields }): JSX.Element | null` where `StepParamFields` is the structural shape `{ temperature: number | null; durationSeconds: number | null; speed: number | null; direction: string; weightGrams: number | null; turbo: boolean }` — accepted by both `RecipeDetailDto` machine steps and `CookingStepDto`.

- [ ] **Step 1: Create the component**

Create `web/components/recipes/step-params.tsx`:

```tsx
"use client";

import { useT } from "@/lib/i18n/provider";
import { formatDuration } from "@/lib/display/format";

interface StepParamFields {
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  direction: string;
  weightGrams: number | null;
  turbo: boolean;
}

export function StepParams({ step }: { step: StepParamFields }) {
  const { t } = useT();
  const hasAny =
    step.temperature != null ||
    step.durationSeconds != null ||
    step.speed != null ||
    !!step.direction ||
    step.weightGrams != null ||
    step.turbo;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
      {step.temperature != null && (
        <span>
          {t("steps.params.temperature")}: {step.temperature}
          {t("steps.units.celsius")}
        </span>
      )}
      {step.durationSeconds != null && (
        <span>
          {t("steps.params.duration")}: {formatDuration(step.durationSeconds)}
        </span>
      )}
      {step.speed != null && (
        <span>
          {t("steps.params.speed")}: {step.speed}
        </span>
      )}
      {step.direction && (
        <span>
          {t("steps.params.direction")}: {t(`steps.directions.${step.direction}`)}
        </span>
      )}
      {step.weightGrams != null && (
        <span>
          {t("steps.params.weight")}: {step.weightGrams}
          {t("steps.units.grams")}
        </span>
      )}
      {step.turbo && <span className="font-medium">{t("steps.params.turbo")}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `recipe-detail.tsx` to use it**

Add the import:

```ts
import { StepParams } from "@/components/recipes/step-params";
```

Replace the inline param block (the `{/* Step params */}` comment plus the `<div className="flex flex-wrap gap-x-4 gap-y-0.5 ...">...</div>` that renders temperature/duration/speed/direction/weight/turbo, currently ~lines 182-218) with:

```tsx
<StepParams step={step} />
```

Leave the surrounding `programType` heading and `instruction` paragraph untouched.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: tsc clean; `next build` OK (no route changes). The recipe-detail machine-step section renders the same params as before.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS (no behavior regressions).

- [ ] **Step 5: Commit**

```bash
git add web/components/recipes/step-params.tsx web/components/recipes/recipe-detail.tsx
git commit -m "refactor(web): extract shared StepParams component (Plan 8b Task 2)"
```

---

### Task 3: Pure swipe helper (TDD)

**Files:**
- Create: `web/lib/cooking/swipe.ts`
- Create (test): `web/lib/cooking/swipe.test.ts`

**Interfaces:**
- Produces: `export function resolveSwipe(dx: number, dy: number, threshold?: number): "next" | "prev" | null`. `dx = endX - startX`, `dy = endY - startY`. Returns `null` when the movement is below `threshold` (default `50`) or vertical-dominant (`|dy| >= |dx|`); leftward (`dx < 0`) → `"next"`, rightward (`dx > 0`) → `"prev"`. A movement exactly at the threshold counts as a swipe.

- [ ] **Step 1: Write the failing test**

Create `web/lib/cooking/swipe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSwipe } from "./swipe";

describe("resolveSwipe", () => {
  it("returns next on a clear leftward swipe", () => {
    expect(resolveSwipe(-80, 10)).toBe("next");
  });

  it("returns prev on a clear rightward swipe", () => {
    expect(resolveSwipe(80, -10)).toBe("prev");
  });

  it("returns null when below the threshold", () => {
    expect(resolveSwipe(-30, 5)).toBeNull();
    expect(resolveSwipe(49, 0)).toBeNull();
  });

  it("returns null when the gesture is vertical-dominant", () => {
    expect(resolveSwipe(-80, 100)).toBeNull();
    expect(resolveSwipe(60, -60)).toBeNull();
  });

  it("treats movement exactly at the threshold as a swipe", () => {
    expect(resolveSwipe(-50, 0)).toBe("next");
    expect(resolveSwipe(50, 0)).toBe("prev");
  });

  it("respects a custom threshold", () => {
    expect(resolveSwipe(-60, 0, 100)).toBeNull();
    expect(resolveSwipe(-120, 0, 100)).toBe("next");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/cooking/swipe.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement the helper**

Create `web/lib/cooking/swipe.ts`:

```ts
export function resolveSwipe(
  dx: number,
  dy: number,
  threshold = 50,
): "next" | "prev" | null {
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dy) >= Math.abs(dx)) return null;
  return dx < 0 ? "next" : "prev";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/cooking/swipe.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add web/lib/cooking/swipe.ts web/lib/cooking/swipe.test.ts
git commit -m "feat(web): resolveSwipe helper for cook-mode swipe nav (Plan 8b Task 3)"
```

---

### Task 4: `useWakeLock` hook

Port the old `frontend/src/hooks/useWakeLock.ts`, adding an `enabled` flag so the lock is held only while cooking.

**Files:**
- Create: `web/lib/hooks/use-wake-lock.ts`

**Interfaces:**
- Produces: `export function useWakeLock(enabled: boolean): { active: boolean }`. When `enabled` and the Screen Wake Lock API exists, requests a screen lock, re-acquires on `visibilitychange → visible`, releases on disable/unmount. Feature-detects and swallows rejections (`active` stays `false`, never throws).

- [ ] **Step 1: Create the hook**

Create `web/lib/hooks/use-wake-lock.ts`:

```ts
import { useEffect, useRef, useState } from "react";

export function useWakeLock(enabled: boolean): { active: boolean } {
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let released = false;

    async function request() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (released) {
          sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener("release", () => {
          setActive(false);
          sentinelRef.current = null;
        });
      } catch {
        setActive(false);
      }
    }

    request();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !released) {
        request();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinelRef.current) {
        sentinelRef.current.release();
        sentinelRef.current = null;
      }
      setActive(false);
    };
  }, [enabled]);

  return { active };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: tsc clean. (`WakeLockSentinel` / `navigator.wakeLock` are in the DOM lib types shipped with TS; if tsc reports them missing, that indicates a `lib` config gap — confirm `lib` includes `dom` in `tsconfig.json` before adding any cast.)

- [ ] **Step 3: Commit**

```bash
git add web/lib/hooks/use-wake-lock.ts
git commit -m "feat(web): useWakeLock hook for cook mode (Plan 8b Task 4)"
```

---

### Task 5: Cook-view display additions — params, wake-lock dot, live servings

Wire the param renderer, wake-lock status dot, and a live servings control into the cooking screen of `web/components/cooking/cooking-view.tsx`. (Navigation — progress bar/swipe — is Task 6.)

**Files:**
- Modify: `web/components/cooking/cooking-view.tsx`

**Interfaces:**
- Consumes: `StepParams` (Task 2), `useWakeLock` (Task 4). The component already has `servings`/`setServings` state, the `−/＋` control markup (pre-start screen), `scaleQuantity`, and `started`.

- [ ] **Step 1: Add imports**

In `web/components/cooking/cooking-view.tsx`, add:

```ts
import { StepParams } from "@/components/recipes/step-params";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
```

- [ ] **Step 2: Acquire the wake lock while cooking**

After the existing state declarations (e.g. just below `const [stepIdx, setStepIdx] = useState(0);`), add:

```ts
const { active: wakeLockActive } = useWakeLock(started);
```

- [ ] **Step 3: Render the param block in the current step card**

In the cooking-screen return (the `<div className="rounded-xl border bg-card p-6">` block), insert `<StepParams>` between the program-name `<p>` and the instruction `<p>` (or directly after the instruction — place it after the instruction paragraph, before the ingredients `<ul>`):

```tsx
{step?.programType && (
  <p className="mb-2 text-sm font-medium text-primary">{t(`steps.programs.${step.programType}`)}</p>
)}
<p className="text-lg leading-relaxed">{step?.instruction}</p>
{step && <StepParams step={step} />}
```

(Add `mt-2` spacing if needed; `StepParams` already returns `null` when the step has no params, so manual steps render unchanged.)

- [ ] **Step 4: Add the wake-lock status dot + live servings to the cooking header**

Replace the cooking-screen header row (the `<div className="flex items-center justify-between">` containing the back button and the `cooking.stepOf` span — note Task 6 will further change the step counter) so it also shows a wake-lock dot and a compact servings control. Use this header:

```tsx
<div className="flex items-center justify-between gap-3">
  <button type="button" className="text-sm text-muted-foreground" onClick={() => setStarted(false)}>
    <ChevronLeft size={16} className="inline" /> {recipe.title}
  </button>
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => setServings((s) => Math.max(1, s - 1))}>
        <Minus size={16} />
      </Button>
      <span className="w-6 text-center text-sm font-semibold">{servings}</span>
      <Button variant="outline" size="icon" onClick={() => setServings((s) => Math.min(12, s + 1))}>
        <Plus size={16} />
      </Button>
    </div>
    <span
      className={`inline-block h-2 w-2 rounded-full ${wakeLockActive ? "bg-green-500" : "bg-border"}`}
      aria-hidden="true"
    />
  </div>
</div>
```

The `cooking.stepOf` counter that previously lived in this row moves into the progress bar added in Task 6. (`Minus`/`Plus`/`ChevronLeft` are already imported; `servings` rescales the ingredient `<li>` quantities via the existing `scaleQuantity` call — no other change needed.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: tsc clean; `next build` OK.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/components/cooking/cooking-view.tsx
git commit -m "feat(web): cook-mode params, wake-lock dot, live servings (Plan 8b Task 5)"
```

---

### Task 6: Cook-view navigation — progress bar, jump-to-step, swipe

Add the clickable progress bar (with the moved `cooking.stepOf` counter), jump-to-step, and touch-swipe navigation to the cooking screen.

**Files:**
- Modify: `web/components/cooking/cooking-view.tsx`

**Interfaces:**
- Consumes: `resolveSwipe` (Task 3). Uses existing `stepIdx`/`setStepIdx`, `steps`, `t`.

- [ ] **Step 1: Add the import and touch refs**

Add the import:

```ts
import { resolveSwipe } from "@/lib/cooking/swipe";
```

The component currently imports `useEffect, useMemo, useState` from React — add `useRef`:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

Inside the component, add touch-tracking refs (near the other state):

```ts
const touchStartX = useRef(0);
const touchStartY = useRef(0);
```

- [ ] **Step 2: Add touch handlers**

Add these handlers inside the component (above the `return`):

```ts
function handleTouchStart(e: React.TouchEvent) {
  touchStartX.current = e.changedTouches[0].clientX;
  touchStartY.current = e.changedTouches[0].clientY;
}

function handleTouchEnd(e: React.TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX.current;
  const dy = e.changedTouches[0].clientY - touchStartY.current;
  const action = resolveSwipe(dx, dy);
  if (action === "next") setStepIdx((i) => Math.min(steps.length - 1, i + 1));
  else if (action === "prev") setStepIdx((i) => Math.max(0, i - 1));
}
```

- [ ] **Step 3: Attach handlers to the step card**

Add `onTouchStart`/`onTouchEnd` to the current-step card `<div className="rounded-xl border bg-card p-6">`:

```tsx
<div
  className="rounded-xl border bg-card p-6"
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
>
```

- [ ] **Step 4: Add the progress bar + jump-to-step + swipe hint**

Insert this block immediately after the header row (from Task 5) and before the step card:

```tsx
<div className="space-y-1.5">
  <p className="text-center text-sm text-muted-foreground">
    {t("cooking.stepOf", { current: stepIdx + 1, total: steps.length })}
  </p>
  <div className="flex gap-1">
    {steps.map((s, index) => (
      <button
        key={s.id}
        type="button"
        aria-label={t("cooking.stepOf", { current: index + 1, total: steps.length })}
        onClick={() => setStepIdx(index)}
        className={`h-1.5 flex-1 rounded-full transition-colors ${
          index <= stepIdx ? "bg-primary" : "bg-muted"
        }`}
      />
    ))}
  </div>
  <p className="text-center text-xs text-muted-foreground sm:hidden">{t("cooking.swipeHint")}</p>
</div>
```

(`key={s.id}` uses the stable step id from `CookingStepDto`. This block owns the `cooking.stepOf` counter now removed from the header in Task 5.)

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: tsc clean; `next build` OK.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/components/cooking/cooking-view.tsx
git commit -m "feat(web): cook-mode progress bar, jump-to-step, swipe (Plan 8b Task 6)"
```

---

### Task 7: Integration verification

Confirm the whole plan is coherent: tests, types, build, and i18n parity. No code unless a check fails.

**Files:** none (verification only).

- [ ] **Step 1: Full Vitest suite**

Run: `npm test`
Expected: PASS — includes the new `swipe.test.ts` and the new `formatDuration` cases in `format.test.ts`; total count increased vs the pre-8b baseline (324) by the new tests.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: tsc clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `next build` OK; route count unchanged (no new routes).

- [ ] **Step 4: i18n parity (zero new keys)**

Run (from repo root), where `<8b-base>` is the spec commit made just before Task 1 (find it: `git log --oneline | grep "Plan 8b cook-mode parity design spec"`): `git diff --name-only <8b-base> -- web/lib/i18n/locales/`
Expected: **no output** — the locale files were not modified by Plan 8b.

- [ ] **Step 5: Record completion**

Note the final test count, the 8b commit range, and that manual browser smoke (wake-lock acquire + tab-refocus re-acquire, touch swipe on a device) remains deferred to the on-host pass (consistent with Plans 4–8). No commit needed unless Step 1–4 surfaced a fix.

---

## Self-Review

**Spec coverage:**
- Wake-lock (M3) → Task 4 (hook) + Task 5 (wiring + status dot). ✅
- Program/machine step params (M4) → Task 1 (`formatDuration`) + Task 2 (`StepParams`) + Task 5 (render in cook view). ✅
- Swipe (M5) → Task 3 (`resolveSwipe`) + Task 6 (handlers + hint). ✅
- Progress bar + jump-to-step → Task 6. ✅
- Live servings adjustment → Task 5 (header servings control). ✅
- Shared `StepParams` extraction (locked decision) → Task 2. ✅
- Text param style, zero new i18n keys → Tasks 2/5/6 reuse existing keys; Task 7 Step 4 enforces. ✅
- Out of scope (checklist, timers): not present in any task. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `formatDuration(seconds: number): string` (T1) consumed by `StepParams` (T2); `StepParams({ step: StepParamFields })` structural shape accepts both `RecipeDetailDto` machine steps and `CookingStepDto`; `useWakeLock(enabled: boolean): { active: boolean }` (T4) consumed as `{ active: wakeLockActive }` (T5); `resolveSwipe(dx, dy, threshold?)` (T3) consumed in T6. Step keys use `CookingStepDto.id`. ✅
