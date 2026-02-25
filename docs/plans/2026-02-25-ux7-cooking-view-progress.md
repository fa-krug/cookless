# Cooking View Progress Indicator + Step Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a visual progress bar to the cooking view showing "Step X of Y" and persist the current step to localStorage so users can resume where they left off.

**Architecture:** Enhance CookingViewPage with a progress bar (segmented, Tailwind-only) and a `useCookingProgress` hook that syncs step state to localStorage keyed by recipe ID + method.

**Tech Stack:** React, Tailwind CSS, localStorage

---

### Task 1: Create useCookingProgress hook with tests

**Files:**
- Create: `frontend/src/hooks/useCookingProgress.ts`
- Create: `frontend/src/hooks/useCookingProgress.test.ts`

**Step 1: Write the test**

```tsx
// frontend/src/hooks/useCookingProgress.test.ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCookingProgress } from "./useCookingProgress";

describe("useCookingProgress", () => {
  afterEach(() => localStorage.clear());

  it("starts at step 0 with no saved state", () => {
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    expect(result.current.currentStep).toBe(0);
  });

  it("restores saved step from localStorage", () => {
    localStorage.setItem("cookless-cooking-recipe-1-MANUAL", "3");
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    expect(result.current.currentStep).toBe(3);
  });

  it("clamps saved step to valid range", () => {
    localStorage.setItem("cookless-cooking-recipe-1-MANUAL", "10");
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    expect(result.current.currentStep).toBe(0);
  });

  it("persists step changes to localStorage", () => {
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    act(() => result.current.setStep(2));
    expect(localStorage.getItem("cookless-cooking-recipe-1-MANUAL")).toBe("2");
  });

  it("resets to 0 when method changes", () => {
    localStorage.setItem("cookless-cooking-recipe-1-MANUAL", "3");
    const { result, rerender } = renderHook(
      ({ method }) => useCookingProgress("recipe-1", method, 5),
      { initialProps: { method: "MANUAL" as const } },
    );
    expect(result.current.currentStep).toBe(3);
    rerender({ method: "MACHINE" as const });
    expect(result.current.currentStep).toBe(0);
  });

  it("clearProgress removes localStorage entry", () => {
    localStorage.setItem("cookless-cooking-recipe-1-MANUAL", "3");
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    act(() => result.current.clearProgress());
    expect(localStorage.getItem("cookless-cooking-recipe-1-MANUAL")).toBeNull();
    expect(result.current.currentStep).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useCookingProgress.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// frontend/src/hooks/useCookingProgress.ts
import { useCallback, useEffect, useState } from "react";

type Method = "MANUAL" | "MACHINE";

function storageKey(recipeId: string, method: Method): string {
  return `cookless-cooking-${recipeId}-${method}`;
}

function loadStep(recipeId: string, method: Method, totalSteps: number): number {
  try {
    const saved = localStorage.getItem(storageKey(recipeId, method));
    if (saved === null) return 0;
    const step = parseInt(saved, 10);
    return step >= 0 && step < totalSteps ? step : 0;
  } catch {
    return 0;
  }
}

export function useCookingProgress(recipeId: string, method: Method, totalSteps: number) {
  const [currentStep, setCurrentStep] = useState(() =>
    loadStep(recipeId, method, totalSteps),
  );

  // Reset when method or recipe changes
  useEffect(() => {
    setCurrentStep(loadStep(recipeId, method, totalSteps));
  }, [recipeId, method, totalSteps]);

  const setStep = useCallback(
    (step: number) => {
      setCurrentStep(step);
      try {
        localStorage.setItem(storageKey(recipeId, method), step.toString());
      } catch {
        // localStorage unavailable
      }
    },
    [recipeId, method],
  );

  const clearProgress = useCallback(() => {
    setCurrentStep(0);
    try {
      localStorage.removeItem(storageKey(recipeId, method));
    } catch {
      // localStorage unavailable
    }
  }, [recipeId, method]);

  return { currentStep, setStep, clearProgress };
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/useCookingProgress.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/hooks/useCookingProgress.ts frontend/src/hooks/useCookingProgress.test.ts
git commit -m "feat(ux7): add useCookingProgress hook with localStorage persistence"
```

---

### Task 2: Add progress bar to CookingViewPage

**Files:**
- Modify: `frontend/src/pages/CookingViewPage.tsx`

**Step 1: Replace useState with useCookingProgress**

Remove:
```tsx
const [currentStep, setCurrentStep] = useState(0);
```

Add:
```tsx
import { useCookingProgress } from "../hooks/useCookingProgress";
```

Then after `steps` and `sortedSteps` are computed:
```tsx
const { currentStep, setStep: setCurrentStep, clearProgress } = useCookingProgress(
  id ?? "",
  method,
  sortedSteps.length,
);
```

**Step 2: Remove step reset from handleMethodChange**

The hook already resets on method change. Simplify `handleMethodChange` to:
```tsx
function handleMethodChange(newMethod: Method) {
  setMethod(newMethod);
}
```

**Step 3: Add progress bar above the step list**

Insert after the method tabs and before the step list:

```tsx
{/* Progress bar */}
{sortedSteps.length > 0 && (
  <div className="mb-4">
    <p className="mb-2 text-center text-sm font-medium text-gray-600">
      {t("cooking.stepOf", { current: currentStep + 1, total: sortedSteps.length })}
    </p>
    <div className="flex gap-1">
      {sortedSteps.map((_, index) => (
        <div
          key={index}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            index <= currentStep ? "bg-orange-500" : "bg-gray-200"
          }`}
        />
      ))}
    </div>
  </div>
)}
```

Note: The i18n key `cooking.stepOf` already exists: "Step {{current}} of {{total}}".

**Step 4: Verify visually**

Run: `cd frontend && npm run dev`
Navigate to a recipe's cooking view. Progress bar should show segments, filled up to current step. Navigate away and come back — step should persist.

**Step 5: Commit**

```bash
git add frontend/src/pages/CookingViewPage.tsx
git commit -m "feat(ux7): add progress bar and step persistence to cooking view"
```

---

### Task 3: Add "Done" state and clear-progress action

**Files:**
- Modify: `frontend/src/pages/CookingViewPage.tsx`

**Step 1: Add a completion state**

After the step list, when the user is on the last step and taps "Next", show a completion view:

```tsx
{currentStep >= sortedSteps.length - 1 && sortedSteps.length > 0 && (
  <button
    type="button"
    onClick={clearProgress}
    className="mt-4 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
  >
    {t("cooking.done")} — {t("common.back")}
  </button>
)}
```

Note: `cooking.done` already exists ("All done!").

**Step 2: Commit**

```bash
git add frontend/src/pages/CookingViewPage.tsx
git commit -m "feat(ux7): add done state with progress clear in cooking view"
```
