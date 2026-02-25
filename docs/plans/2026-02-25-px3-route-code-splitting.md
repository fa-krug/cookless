# PX3: Route-Level Code Splitting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce initial JS bundle size by lazy-loading page components and splitting vendor chunks for better caching.

**Architecture:** Convert all static page imports in `App.tsx` to `React.lazy()` with `<Suspense>` boundaries. Add `manualChunks` to Vite config to split stable vendor libraries into separate cached chunks.

**Tech Stack:** React.lazy, Suspense, Vite rollupOptions manualChunks

---

### Task 1: Add Suspense and lazy-load pages

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Convert all page imports to lazy**

Replace `frontend/src/App.tsx` entirely:

```tsx
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";

const CookingViewPage = lazy(() => import("./pages/CookingViewPage"));
const HouseholdPage = lazy(() => import("./pages/HouseholdPage"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MealPlanPage = lazy(() => import("./pages/MealPlanPage"));
const RecipeCreatePage = lazy(() => import("./pages/RecipeCreatePage"));
const RecipeDetailPage = lazy(() => import("./pages/RecipeDetailPage"));
const RecipeListPage = lazy(() => import("./pages/RecipeListPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ShoppingListDetailPage = lazy(() => import("./pages/ShoppingListDetailPage"));
const SetupWizardPage = lazy(() => import("./pages/SetupWizardPage"));
const ShoppingListPage = lazy(() => import("./pages/ShoppingListPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));

function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/setup" element={<SetupWizardPage />} />
        <Route path="/welcome" element={<WelcomePage />} />

        <Route element={<Layout />}>
          <Route path="/recipes" element={<RecipeListPage />} />
          <Route path="/recipes/new" element={<RecipeCreatePage />} />
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
          <Route path="/plan" element={<MealPlanPage />} />
          <Route path="/shopping" element={<ShoppingListPage />} />
          <Route path="/shopping/:id" element={<ShoppingListDetailPage />} />
          <Route path="/cook/:id" element={<CookingViewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/household" element={<HouseholdPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
```

Notes:
- `Layout` stays statically imported (it's needed on every authenticated page)
- `fallback={null}` avoids a flash — the Layout shell is already rendered, and the page content just pops in. If a loading skeleton is preferred later, it can be added.

**Step 2: Verify all page components use default exports**

Each page file must have `export default function PageName()` or `export default PageName`. Verify:
- `CookingViewPage.tsx`, `HouseholdPage.tsx`, `InvitePage.tsx`, `LoginPage.tsx`, `MealPlanPage.tsx`, `RecipeCreatePage.tsx`, `RecipeDetailPage.tsx`, `RecipeListPage.tsx`, `SettingsPage.tsx`, `ShoppingListDetailPage.tsx`, `SetupWizardPage.tsx`, `ShoppingListPage.tsx`, `WelcomePage.tsx`

**Step 3: Run frontend build and check output**

Run: `cd frontend && npm run build`
Expected: Build succeeds. Output should show multiple chunk files instead of one large bundle.

**Step 4: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "perf(px3): lazy-load all page components with React.lazy"
```

---

### Task 2: Add Vite manual chunk splitting

**Files:**
- Modify: `frontend/vite.config.ts`

**Step 1: Add `build.rollupOptions.output.manualChunks` to vite config**

Add after the `test` block (before `server`):

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'query-vendor': ['@tanstack/react-query'],
        'i18n-vendor': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
      },
    },
  },
},
```

**Step 2: Run production build**

Run: `cd frontend && npm run build`
Expected: Build succeeds. Output shows separate chunk files: `react-vendor-[hash].js`, `query-vendor-[hash].js`, `i18n-vendor-[hash].js`, `dnd-vendor-[hash].js`, plus per-page chunks.

**Step 3: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All pass

**Step 4: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "perf(px3): add Vite manual chunk splitting for vendor libraries"
```
