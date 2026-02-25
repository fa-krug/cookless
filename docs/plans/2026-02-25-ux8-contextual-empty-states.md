# Contextual Empty States Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace generic empty states with context-aware messages that guide users to the logical next action, and add missing empty states to pages that don't have them.

**Architecture:** Use the existing `EmptyState` component (already supports icon, title, subtitle, and CTA link/button). Add new i18n keys and wire up missing pages.

**Tech Stack:** React, react-i18next, existing EmptyState component

---

### Task 1: Add EmptyState to MealPlanPage (replace inline markup)

**Files:**
- Modify: `frontend/src/pages/MealPlanPage.tsx`

**Step 1: Identify the current inline empty state**

Lines 81-93 of `MealPlanPage.tsx` have a hand-rolled empty state:

```tsx
{!isLoading && !currentPlan && (
  <div className="mt-12 flex flex-col items-center text-center">
    <Calendar size={48} className="text-gray-400" />
    <p className="mt-4 text-gray-500">{t("plan.noPlan")}</p>
    <button ...>
```

This doesn't use the `EmptyState` component and has an inline button instead of a CTA.

**Step 2: Replace with EmptyState component**

Since `EmptyState` supports `ActionButton`, we can use it but the current setup button opens a drawer, not a link. Use the button action variant:

```tsx
import { EmptyState } from "../components/ui/EmptyState";
```

Replace lines 81-93 with:

```tsx
{!isLoading && !currentPlan && (
  <EmptyState
    icon={Calendar}
    title={t("plan.noPlanTitle")}
    subtitle={t("plan.noPlanSubtitle")}
    action={{ label: t("plan.setup"), onClick: () => setDrawerOpen(true) }}
  />
)}
```

**Step 3: Add i18n keys**

In `en.json`, replace the existing `plan.noPlan` and add structured keys:
```json
"noPlanTitle": "No meal plan yet",
"noPlanSubtitle": "Set up your first plan to get cooking!"
```

In `de.json`:
```json
"noPlanTitle": "Noch kein Essensplan",
"noPlanSubtitle": "Erstelle deinen ersten Plan und leg los!"
```

Keep the old `plan.noPlan` key for now (it may be used elsewhere).

**Step 4: Verify visually**

Run: `cd frontend && npm run dev`
Navigate to Plan page with no meal plan. Should show the EmptyState component with icon, title, subtitle, and "Let's go!" button.

**Step 5: Commit**

```bash
git add frontend/src/pages/MealPlanPage.tsx frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat(ux8): use EmptyState component on MealPlanPage"
```

---

### Task 2: Add EmptyState to ShoppingListDetailPage

**Files:**
- Modify: `frontend/src/pages/ShoppingListDetailPage.tsx`

**Step 1: Identify the current inline empty state**

Lines 78-82 use a plain `<div>` with text:

```tsx
{!isLoading && !shoppingList && (
  <div className="mt-12 text-center">
    <p className="text-gray-500">{t("shopping.emptyState")}</p>
  </div>
)}
```

**Step 2: Replace with EmptyState component**

```tsx
import { ShoppingCart } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
```

Replace lines 78-82 with:

```tsx
{!isLoading && !shoppingList && (
  <EmptyState
    icon={ShoppingCart}
    title={t("shopping.emptyTitle")}
    subtitle={t("shopping.emptySubtitle")}
    action={{ label: t("shopping.goToPlan"), to: "/plan" }}
  />
)}
```

Note: These i18n keys already exist from ShoppingListPage.

**Step 3: Commit**

```bash
git add frontend/src/pages/ShoppingListDetailPage.tsx
git commit -m "feat(ux8): use EmptyState component on ShoppingListDetailPage"
```

---

### Task 3: Improve MealPlanPage empty state for "has plan but no recipes"

**Files:**
- Modify: `frontend/src/pages/MealPlanPage.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add context-aware empty state when plan exists but active iteration has no meals**

After the `activeIteration` section, add a fallback when `currentPlan` exists but `activeIteration` is null and `!activeIterationEnded`:

```tsx
{currentPlan && !activeIteration && !activeIterationEnded && (
  <EmptyState
    icon={CalendarPlus}
    title={t("plan.noActiveTitle")}
    subtitle={t("plan.noActiveSubtitle")}
    action={{ label: t("plan.generateNext"), onClick: handleNextIteration }}
  />
)}
```

**Step 2: Add i18n keys**

In `en.json` under `plan`:
```json
"noActiveTitle": "No active plan",
"noActiveSubtitle": "Generate your next meal plan to get started"
```

In `de.json` under `plan`:
```json
"noActiveTitle": "Kein aktiver Plan",
"noActiveSubtitle": "Erstelle deinen nächsten Essensplan"
```

**Step 3: Commit**

```bash
git add frontend/src/pages/MealPlanPage.tsx frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat(ux8): add contextual empty state for plan without active iteration"
```

---

### Task 4: Improve "all done" shopping state with link back to plan

**Files:**
- Modify: `frontend/src/pages/ShoppingListPage.tsx`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add CTA to the "all done" empty state**

Currently the "All done!" state has no action. Add a link to the meal plan:

```tsx
{allChecked && (
  <EmptyState
    icon={CheckCircle}
    title={t("shopping.allDoneTitle")}
    subtitle={t("shopping.allDoneSubtitle")}
    action={{ label: t("shopping.backToPlan"), to: "/plan" }}
  />
)}
```

**Step 2: Add i18n keys**

In `en.json` under `shopping`:
```json
"backToPlan": "Back to meal plan"
```

In `de.json` under `shopping`:
```json
"backToPlan": "Zurück zum Essensplan"
```

**Step 3: Commit**

```bash
git add frontend/src/pages/ShoppingListPage.tsx frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat(ux8): add CTA to shopping all-done empty state"
```
