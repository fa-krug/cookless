# Button Loading States Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a visible spinner + disabled state to all async submit buttons so users get instant feedback during mutations.

**Architecture:** Create a reusable `<Spinner>` component (inline SVG animation), then add it to every button that triggers a mutation. No new dependencies — pure Tailwind animation.

**Tech Stack:** React, Tailwind CSS, Lucide React (existing)

---

### Task 1: Create Spinner component

**Files:**
- Create: `frontend/src/components/ui/Spinner.tsx`
- Test: `frontend/src/components/ui/Spinner.test.tsx`

**Step 1: Write the test**

```tsx
// frontend/src/components/ui/Spinner.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders with default size", () => {
    render(<Spinner />);
    const svg = screen.getByRole("status");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("animate-spin");
  });

  it("accepts a custom size", () => {
    render(<Spinner size={20} />);
    const svg = screen.getByRole("status");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ui/Spinner.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// frontend/src/components/ui/Spinner.tsx
interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 16 }: SpinnerProps) {
  return (
    <svg
      role="status"
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ui/Spinner.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/ui/Spinner.tsx frontend/src/components/ui/Spinner.test.tsx
git commit -m "feat(ux6): add reusable Spinner component"
```

---

### Task 2: Add spinner to RecipeCreatePage save button

**Files:**
- Modify: `frontend/src/pages/RecipeCreatePage.tsx`

**Step 1: Import Spinner**

Add at the top of RecipeCreatePage.tsx:

```tsx
import { Spinner } from "../components/ui/Spinner";
```

**Step 2: Update the save button**

Replace the save button (the `<button type="submit">` at the bottom of the form) with:

```tsx
<button
  type="submit"
  disabled={createRecipe.isPending || !title.trim()}
  className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
>
  {createRecipe.isPending ? <Spinner /> : <Save size={16} />}
  {createRecipe.isPending ? t("common.loading") : t("common.save")}
</button>
```

**Step 3: Verify visually**

Run: `cd frontend && npm run dev`
Navigate to `/recipes/new`, fill in a title, submit. Button should show spinner + "One moment..." while saving.

**Step 4: Commit**

```bash
git add frontend/src/pages/RecipeCreatePage.tsx
git commit -m "feat(ux6): add spinner to recipe create button"
```

---

### Task 3: Add spinner to RecipeDetailPage save/move/delete buttons

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Import Spinner**

```tsx
import { Spinner } from "../components/ui/Spinner";
```

**Step 2: Update save button**

Replace the save button's icon with:

```tsx
{updateRecipe.isPending ? <Spinner /> : <Save size={16} />}
{updateRecipe.isPending ? t("common.loading") : t("common.save")}
```

**Step 3: Update move button**

Replace the move button's icon with:

```tsx
{moveRecipe.isPending ? <Spinner /> : <ArrowLeftRight size={16} />}
```

**Step 4: Update delete button**

Replace the delete button's icon with:

```tsx
{deleteRecipe.isPending ? <Spinner /> : <Trash2 size={16} />}
```

**Step 5: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat(ux6): add spinners to recipe detail buttons"
```

---

### Task 4: Add spinner to HouseholdPage buttons

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx`

**Step 1: Import Spinner**

```tsx
import { Spinner } from "../components/ui/Spinner";
```

**Step 2: Update all mutation-backed buttons**

Apply the same pattern to each button in HouseholdPage:

- **Create household button:** `{createHousehold.isPending ? <Spinner /> : <Plus size={16} />}`
- **Generate invite button:** `{createInvite.isPending ? <Spinner /> : <Link size={16} />}`
- **Join household button:** `{acceptInvite.isPending ? <Spinner /> : <UserPlus size={16} />}`
- **Update household save button:** show Spinner when `updateHousehold.isPending`
- **Leave household button:** `{leaveHousehold.isPending ? <Spinner /> : <LogOut size={16} />}`
- **Remove member button:** `{removeMember.isPending ? <Spinner /> : <UserMinus size={16} />}`
- **Transfer ownership button:** `{transferOwnership.isPending ? <Spinner /> : <Shield size={16} />}`

**Step 3: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx
git commit -m "feat(ux6): add spinners to household page buttons"
```

---

### Task 5: Add spinner to MealPlanPage and GenerateDrawer buttons

**Files:**
- Modify: `frontend/src/pages/MealPlanPage.tsx`
- Modify: `frontend/src/components/GenerateDrawer.tsx`
- Modify: `frontend/src/components/IterationCard.tsx`

**Step 1: MealPlanPage — "generate next" button**

Import Spinner and update:

```tsx
{nextIteration.isPending ? <Spinner /> : <CalendarPlus size={16} />}
{nextIteration.isPending ? t("common.loading") : t("plan.generateNext")}
```

**Step 2: GenerateDrawer — setup button**

Import Spinner and update the submit button:

```tsx
{setupPlan.isPending ? <Spinner /> : <Sparkles size={16} />}
{setupPlan.isPending ? t("common.loading") : isUpdate ? t("plan.updateConfig") : t("plan.setup")}
```

**Step 3: IterationCard — renew button**

Import Spinner. The `onRenew` prop doesn't carry loading state, so add an `isRenewing` prop:

In `IterationCard.tsx`, update the props interface:
```tsx
interface IterationCardProps {
  // ... existing props
  isRenewing?: boolean;
}
```

Update the renew button:
```tsx
{isRenewing ? <Spinner size={14} /> : <RefreshCw size={14} />}
```

In `MealPlanPage.tsx`, pass the prop:
```tsx
<IterationCard
  iteration={activeIteration}
  shoppingDays={currentPlan.shopping_days}
  isArchived={false}
  onRenew={handleRenew}
  isRenewing={renewIteration.isPending}
/>
```

**Step 4: Commit**

```bash
git add frontend/src/pages/MealPlanPage.tsx frontend/src/components/GenerateDrawer.tsx frontend/src/components/IterationCard.tsx
git commit -m "feat(ux6): add spinners to meal plan buttons"
```

---

### Task 6: Add spinner to SettingsPage async actions

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Import Spinner**

```tsx
import { Spinner } from "../components/ui/Spinner";
```

**Step 2: Update passkey "Add" button**

Show Spinner when `addingPasskey` is true.

**Step 3: Update password save button**

Show Spinner when `savingPassword` is true.

**Step 4: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat(ux6): add spinners to settings page buttons"
```

---

### Task 7: Add spinner to ShoppingListPage bulk toggle

**Files:**
- Modify: `frontend/src/pages/ShoppingListPage.tsx`

**Step 1: Import Spinner and update "Reset" button**

```tsx
{bulkToggle.isPending ? <Spinner /> : <ListRestart size={16} />}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/ShoppingListPage.tsx
git commit -m "feat(ux6): add spinner to shopping list reset button"
```
