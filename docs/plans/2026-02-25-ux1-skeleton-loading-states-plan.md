# UX1: Skeleton Loading States — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all "One moment..." text loading indicators with shimmer skeleton placeholders that match each page's final layout.

**Architecture:** Create a `Skeleton` base primitive in a new `components/ui/` directory, then compose page-specific skeletons from it. Each page's `isLoading` branch swaps the text for the matching skeleton. TDD — write failing tests first, then implement.

**Tech Stack:** React, TypeScript, Tailwind CSS v4 (`animate-pulse`), Vitest + @testing-library/react

---

### Task 1: Create the Skeleton base primitive

**Files:**
- Create: `frontend/src/components/ui/Skeleton.tsx`

**Step 1: Create the Skeleton component**

```tsx
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}
```

**Step 2: Verify it renders**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | head -20`
Expected: existing tests still pass (no breakage)

**Step 3: Commit**

```
feat(ux1): add Skeleton base primitive
```

---

### Task 2: Create RecipeCardSkeleton + RecipeListSkeleton

**Files:**
- Create: `frontend/src/components/ui/RecipeCardSkeleton.tsx`
- Create: `frontend/src/components/ui/RecipeListSkeleton.tsx`

**Step 1: Write the failing test**

Create `frontend/src/__tests__/RecipeListPage.skeleton.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../contexts/ToastContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("../api/client", () => ({
  fetchRecipes: vi.fn(() => new Promise(() => {})),
  deleteRecipe: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("RecipeListPage skeleton", () => {
  it("shows skeleton placeholders while loading", async () => {
    const { RecipeListPage } = await import("../pages/RecipeListPage");
    renderWithProviders(<RecipeListPage />);
    expect(screen.getByTestId("recipe-list-skeleton")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/RecipeListPage.skeleton.test.tsx --reporter=verbose`
Expected: FAIL — `recipe-list-skeleton` not found

**Step 3: Create RecipeCardSkeleton**

`frontend/src/components/ui/RecipeCardSkeleton.tsx`:

```tsx
import { Skeleton } from "./Skeleton";

export function RecipeCardSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-6 w-3/4" />
        <div className="mt-1 flex gap-x-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
      <Skeleton className="ml-3 h-9 w-9 shrink-0 rounded-md" />
    </div>
  );
}
```

**Step 4: Create RecipeListSkeleton**

`frontend/src/components/ui/RecipeListSkeleton.tsx`:

```tsx
import { RecipeCardSkeleton } from "./RecipeCardSkeleton";

export function RecipeListSkeleton() {
  return (
    <div data-testid="recipe-list-skeleton" className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <RecipeCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

**Step 5: Integrate into RecipeListPage**

In `frontend/src/pages/RecipeListPage.tsx`, replace the loading paragraph:

Replace:
```tsx
{isLoading && (
  <p className="text-center text-sm text-gray-500">{t("common.loading")}</p>
)}
```

With:
```tsx
{isLoading && <RecipeListSkeleton />}
```

Add import at top:
```tsx
import { RecipeListSkeleton } from "../components/ui/RecipeListSkeleton";
```

**Step 6: Run tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: all tests pass including new skeleton test

**Step 7: Commit**

```
feat(ux1): add RecipeCard/RecipeList skeletons
```

---

### Task 3: Create RecipeDetailSkeleton

**Files:**
- Create: `frontend/src/components/ui/RecipeDetailSkeleton.tsx`
- Create: `frontend/src/__tests__/RecipeDetailPage.skeleton.test.tsx`
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Write the failing test**

Create `frontend/src/__tests__/RecipeDetailPage.skeleton.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../contexts/ToastContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("../api/client", () => ({
  fetchRecipe: vi.fn(() => new Promise(() => {})),
  deleteRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/recipes/1"]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("RecipeDetailPage skeleton", () => {
  it("shows skeleton while loading", async () => {
    const { RecipeDetailPage } = await import("../pages/RecipeDetailPage");
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
    );
    expect(screen.getByTestId("recipe-detail-skeleton")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/RecipeDetailPage.skeleton.test.tsx --reporter=verbose`
Expected: FAIL

**Step 3: Create RecipeDetailSkeleton**

`frontend/src/components/ui/RecipeDetailSkeleton.tsx`:

```tsx
import { Skeleton } from "./Skeleton";

export function RecipeDetailSkeleton() {
  return (
    <div data-testid="recipe-detail-skeleton" className="p-4">
      {/* Title */}
      <Skeleton className="h-7 w-2/3" />

      {/* Meta row */}
      <div className="mt-3 flex gap-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>

      {/* Ingredients section */}
      <Skeleton className="mt-6 h-5 w-24" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>

      {/* Steps section */}
      <Skeleton className="mt-6 h-5 w-20" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Integrate into RecipeDetailPage**

In `frontend/src/pages/RecipeDetailPage.tsx`, replace the loading early return:

Replace:
```tsx
if (recipeLoading) {
  return (
    <div className="p-4">
      <p className="text-center text-sm text-gray-500">{t("common.loading")}</p>
    </div>
  );
}
```

With:
```tsx
if (recipeLoading) {
  return <RecipeDetailSkeleton />;
}
```

Add import:
```tsx
import { RecipeDetailSkeleton } from "../components/ui/RecipeDetailSkeleton";
```

**Step 5: Run tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: all pass

**Step 6: Commit**

```
feat(ux1): add RecipeDetail skeleton
```

---

### Task 4: Create MealPlanSkeleton

**Files:**
- Create: `frontend/src/components/ui/MealPlanSkeleton.tsx`
- Create: `frontend/src/__tests__/MealPlanPage.skeleton.test.tsx`
- Modify: `frontend/src/pages/MealPlanPage.tsx`

**Step 1: Write the failing test**

Create `frontend/src/__tests__/MealPlanPage.skeleton.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../contexts/ToastContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("../api/client", () => ({
  fetchMealPlans: vi.fn(() => new Promise(() => {})),
  generateNextIteration: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("MealPlanPage skeleton", () => {
  it("shows skeleton while loading", async () => {
    const { MealPlanPage } = await import("../pages/MealPlanPage");
    renderWithProviders(<MealPlanPage />);
    expect(screen.getByTestId("meal-plan-skeleton")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/MealPlanPage.skeleton.test.tsx --reporter=verbose`
Expected: FAIL

**Step 3: Create MealPlanSkeleton**

`frontend/src/components/ui/MealPlanSkeleton.tsx`:

```tsx
import { Skeleton } from "./Skeleton";

export function MealPlanSkeleton() {
  return (
    <div data-testid="meal-plan-skeleton" className="space-y-4">
      {/* Header bar */}
      <Skeleton className="h-6 w-40" />
      {/* Day cards */}
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-5 w-24" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Integrate into MealPlanPage**

In `frontend/src/pages/MealPlanPage.tsx`, replace the loading paragraph:

Replace:
```tsx
{isLoading && (
  <p className="text-sm text-gray-500">{t("common.loading")}</p>
)}
```

With:
```tsx
{isLoading && <MealPlanSkeleton />}
```

Add import:
```tsx
import { MealPlanSkeleton } from "../components/ui/MealPlanSkeleton";
```

**Step 5: Run tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: all pass

**Step 6: Commit**

```
feat(ux1): add MealPlan skeleton
```

---

### Task 5: Create ShoppingListSkeleton

**Files:**
- Create: `frontend/src/components/ui/ShoppingListSkeleton.tsx`
- Create: `frontend/src/__tests__/ShoppingListPage.skeleton.test.tsx`
- Modify: `frontend/src/pages/ShoppingListPage.tsx`

**Step 1: Write the failing test**

Create `frontend/src/__tests__/ShoppingListPage.skeleton.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../contexts/ToastContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("../api/client", () => ({
  fetchShoppingLists: vi.fn(() => new Promise(() => {})),
  toggleShoppingItem: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("ShoppingListPage skeleton", () => {
  it("shows skeleton while loading", async () => {
    const { ShoppingListPage } = await import("../pages/ShoppingListPage");
    renderWithProviders(<ShoppingListPage />);
    expect(screen.getByTestId("shopping-list-skeleton")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/ShoppingListPage.skeleton.test.tsx --reporter=verbose`
Expected: FAIL

**Step 3: Create ShoppingListSkeleton**

`frontend/src/components/ui/ShoppingListSkeleton.tsx`:

```tsx
import { Skeleton } from "./Skeleton";

export function ShoppingListSkeleton() {
  return (
    <div data-testid="shopping-list-skeleton" className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-5 w-28" />
          <div className="mt-2 space-y-2">
            {Array.from({ length: i + 2 }, (_, j) => (
              <Skeleton key={j} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Integrate into ShoppingListPage**

In `frontend/src/pages/ShoppingListPage.tsx`, replace the loading paragraph:

Replace:
```tsx
{isLoading && <p className="text-sm text-gray-500">{t("common.loading")}</p>}
```

With:
```tsx
{isLoading && <ShoppingListSkeleton />}
```

Add import:
```tsx
import { ShoppingListSkeleton } from "../components/ui/ShoppingListSkeleton";
```

**Step 5: Run tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: all pass

**Step 6: Commit**

```
feat(ux1): add ShoppingList skeleton
```

---

### Task 6: Create SettingsSkeleton

**Files:**
- Create: `frontend/src/components/ui/SettingsSkeleton.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Create SettingsSkeleton**

`frontend/src/components/ui/SettingsSkeleton.tsx`:

```tsx
import { Skeleton } from "./Skeleton";

export function SettingsSkeleton() {
  return (
    <div data-testid="settings-skeleton" className="space-y-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Integrate into SettingsPage**

In `frontend/src/pages/SettingsPage.tsx`, replace the passkeys loading text:

Replace:
```tsx
<p className="text-sm text-gray-500">{t("common.loading")}</p>
```
(the one inside the passkeys ternary)

With:
```tsx
<SettingsSkeleton />
```

Add import:
```tsx
import { SettingsSkeleton } from "../components/ui/SettingsSkeleton";
```

Note: The button-label loading strings (`isSaving`, `addingPasskey`, `savingPassword`) stay as-is — they are action-pending states, not page-loading states.

**Step 3: Run tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: all pass

**Step 4: Commit**

```
feat(ux1): add Settings skeleton
```

---

### Task 7: Update existing RecipeListPage test

**Files:**
- Modify: `frontend/src/__tests__/RecipeListPage.test.tsx`

**Step 1: Check and fix any broken assertions**

The existing `RecipeListPage.test.tsx` may assert on the old loading text `"common.loading"`. If so, update it to check for the skeleton `data-testid` instead.

Replace any assertion like:
```tsx
screen.getByText("common.loading")
```

With:
```tsx
screen.getByTestId("recipe-list-skeleton")
```

**Step 2: Run all tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: all pass

**Step 3: Run lint**

Run: `cd frontend && npm run lint`
Expected: no errors

**Step 4: Commit**

```
fix(ux1): update existing tests for skeleton loading states
```
