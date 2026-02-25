# Toast & Error Handling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toast notification system so users see feedback when backend requests fail, with specific error messages where useful and success toasts on navigating actions.

**Architecture:** Custom React context + component (no dependencies). Global QueryClient `onError` as safety net. Per-mutation `onError` at call sites for specific messages. i18n keys for all messages.

**Tech Stack:** React Context, Tailwind CSS, react-i18next, TanStack React Query

---

### Task 1: Create ToastContext and ToastContainer

**Files:**
- Create: `frontend/src/contexts/ToastContext.tsx`

**Step 1: Write the toast context and container component**

```tsx
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

type ToastType = "error" | "success";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  addToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            onClick={() => removeToast(toast.id)}
            className={`pointer-events-auto animate-slide-down cursor-pointer rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

**Step 2: Add the slide-down animation to Tailwind config**

In `frontend/src/index.css`, add the `animate-slide-down` keyframes. Find where `@import "tailwindcss"` is and add after it:

```css
@theme {
  --animate-slide-down: slide-down 0.3s ease-out;
}

@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-1rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 3: Run build to verify no errors**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/contexts/ToastContext.tsx frontend/src/index.css
git commit -m "feat: add toast notification context and component"
```

---

### Task 2: Wire ToastProvider into app and add global mutation error handler

**Files:**
- Modify: `frontend/src/main.tsx`

**Step 1: Update main.tsx to add ToastProvider and global onError**

The QueryClient creation must move inside a component so it can access `useToast`. Create a wrapper component `AppProviders` in `main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import './i18n'
import './index.css'
import App from './App.tsx'

function AppProviders() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClientRef = useRef<QueryClient>();

  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        mutations: {
          onError: () => {
            addToast(t("common.error"), "error");
          },
        },
      },
    });
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AppProviders />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

**Step 2: Run build to verify no errors**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Run existing tests to verify nothing broke**

Run: `cd frontend && npm test`
Expected: All existing tests pass (tests use their own QueryClient so unaffected)

**Step 4: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: wire toast provider and global mutation error handler"
```

---

### Task 3: Add i18n error and success keys

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add error keys to en.json**

Add an `"errors"` section after the `"settings"` section:

```json
"errors": {
  "recipeSave": "Could not save recipe.",
  "recipeDelete": "Could not delete recipe.",
  "recipeMove": "Could not move recipe.",
  "planGenerate": "Could not generate meal plan.",
  "shoppingUpdate": "Could not update shopping list.",
  "settingsSave": "Could not save settings.",
  "householdCreate": "Could not create household.",
  "householdJoin": "Could not join household.",
  "householdSwitch": "Could not switch household.",
  "memberRemove": "Could not remove member."
},
"success": {
  "recipeSaved": "Recipe saved!",
  "householdJoined": "Joined household!"
}
```

**Step 2: Add error keys to de.json**

Add the same sections:

```json
"errors": {
  "recipeSave": "Rezept konnte nicht gespeichert werden.",
  "recipeDelete": "Rezept konnte nicht gelöscht werden.",
  "recipeMove": "Rezept konnte nicht verschoben werden.",
  "planGenerate": "Essensplan konnte nicht erstellt werden.",
  "shoppingUpdate": "Einkaufsliste konnte nicht aktualisiert werden.",
  "settingsSave": "Einstellungen konnten nicht gespeichert werden.",
  "householdCreate": "Haushalt konnte nicht erstellt werden.",
  "householdJoin": "Beitritt zum Haushalt fehlgeschlagen.",
  "householdSwitch": "Haushalt konnte nicht gewechselt werden.",
  "memberRemove": "Mitglied konnte nicht entfernt werden."
},
"success": {
  "recipeSaved": "Rezept gespeichert!",
  "householdJoined": "Haushalt beigetreten!"
}
```

**Step 3: Run build to verify JSON is valid**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: add i18n keys for error and success toasts"
```

---

### Task 4: Add per-mutation error toasts to RecipeListPage

**Files:**
- Modify: `frontend/src/pages/RecipeListPage.tsx`

**Step 1: Add error handling to create and delete mutations**

Import `useToast` and `useTranslation` is already imported. Add `onError` callbacks:

```tsx
// At top of RecipeListPage component, after existing hooks:
const { addToast } = useToast();

// Change handleQuickAdd:
function handleQuickAdd(e: React.FormEvent) {
  e.preventDefault();
  const title = newTitle.trim();
  if (!title) return;
  createRecipe.mutate({ title, list_type: activeTab }, {
    onError: () => addToast(t("errors.recipeSave"), "error"),
  });
  setNewTitle("");
}

// Change handleDelete:
function handleDelete(id: string) {
  if (!window.confirm(t("recipes.deleteConfirm"))) return;
  deleteRecipe.mutate(id, {
    onError: () => addToast(t("errors.recipeDelete"), "error"),
  });
}
```

Add the import: `import { useToast } from "../contexts/ToastContext";`

**Step 2: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/pages/RecipeListPage.tsx
git commit -m "feat: add error toasts to recipe list page"
```

---

### Task 5: Add error and success toasts to RecipeDetailPage

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Add error/success handling to RecipeForm mutations**

Import `useToast`. In `RecipeForm` component, add `const { addToast } = useToast();` after existing hooks.

Update `handleSave` — add `onError` and success toast:

```tsx
updateRecipe.mutate({ id: recipeId, data: payload }, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    addToast(t("success.recipeSaved"), "success");
    navigate("/recipes");
  },
  onError: () => addToast(t("errors.recipeSave"), "error"),
});
```

Update `handleMove`:

```tsx
moveRecipe.mutate(recipeId, {
  onSuccess: () => navigate("/recipes"),
  onError: () => addToast(t("errors.recipeMove"), "error"),
});
```

Update `handleDelete`:

```tsx
deleteRecipe.mutate(recipeId, {
  onSuccess: () => navigate("/recipes"),
  onError: () => addToast(t("errors.recipeDelete"), "error"),
});
```

Add the import: `import { useToast } from "../contexts/ToastContext";`

**Step 2: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: add error and success toasts to recipe detail page"
```

---

### Task 6: Add error and success toasts to HouseholdPage

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx`

**Step 1: Add toast to MembersList**

Import `useToast` at top of file. In `MembersList`:

```tsx
const { addToast } = useToast();

function handleRemove(memberId: number) {
  if (!window.confirm(t("household.removeMemberConfirm"))) return;
  removeMember.mutate({ householdId: household.id, memberId }, {
    onError: () => addToast(t("errors.memberRemove"), "error"),
  });
}
```

**Step 2: Add toast to InviteSection**

In `InviteSection`, add `const { addToast } = useToast();` then update:

```tsx
function handleGenerate() {
  createInvite.mutate(householdId, {
    onSuccess: (data) => {
      setInvite(data);
      setCopied(false);
    },
    onError: () => addToast(t("common.error"), "error"),
  });
}
```

**Step 3: Add toast to JoinHouseholdSection**

In `JoinHouseholdSection`, add `const { addToast } = useToast();` then update:

```tsx
acceptInvite.mutate(code.trim(), {
  onSuccess: async () => {
    setCode("");
    await refreshUser();
    addToast(t("success.householdJoined"), "success");
  },
  onError: () => addToast(t("errors.householdJoin"), "error"),
});
```

**Step 4: Add toast to CreateHouseholdSection**

In `CreateHouseholdSection`, add `const { addToast } = useToast();` then update:

```tsx
createHousehold.mutate(name.trim(), {
  onSuccess: async () => {
    setName("");
    await refreshUser();
  },
  onError: () => addToast(t("errors.householdCreate"), "error"),
});
```

**Step 5: Add toast to HouseholdPage (switch)**

In `HouseholdPage`, add `const { addToast } = useToast();` then update:

```tsx
switchHousehold.mutate(id, {
  onSuccess: async () => {
    await refreshUser();
  },
  onError: () => addToast(t("errors.householdSwitch"), "error"),
});
```

Add the import at top: `import { useToast } from "../contexts/ToastContext";`

**Step 6: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx
git commit -m "feat: add error and success toasts to household page"
```

---

### Task 7: Add error toast to GenerateDrawer (meal plan)

**Files:**
- Modify: `frontend/src/components/GenerateDrawer.tsx`

**Step 1: Add error handling to generate mutation**

Import `useToast`. Add `const { addToast } = useToast();` and update:

```tsx
function handleGenerate() {
  generatePlan.mutate(
    {
      start_date: todayISO(),
      days,
      servings,
      known_ratio: knownRatio,
      default_leftover_days: defaultLeftoverDays,
    },
    {
      onSuccess: () => onClose(),
      onError: () => addToast(t("errors.planGenerate"), "error"),
    },
  );
}
```

Add the import: `import { useToast } from "../contexts/ToastContext";`

**Step 2: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/components/GenerateDrawer.tsx
git commit -m "feat: add error toast to meal plan generation"
```

---

### Task 8: Add error toast to SettingsPage

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Add error handling to handleSave**

Import `useToast`. Add `const { addToast } = useToast();` after existing hooks. Update `handleSave`:

```tsx
async function handleSave() {
  setIsSaving(true);
  setSaved(false);
  try {
    await api.patch<User>("/api/v1/users/me/", {
      preferred_language: language,
      settings: {
        default_servings: defaultServings,
        known_new_ratio: knownNewRatio,
        plan_days: planDays,
      },
    });
    await refreshUser();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  } catch {
    addToast(t("errors.settingsSave"), "error");
  } finally {
    setIsSaving(false);
  }
}
```

Note: SettingsPage uses raw `api.patch` instead of a mutation hook, so we add a `catch` block. The passkey and password sections already have their own error handling, so leave those as-is.

Add the import: `import { useToast } from "../contexts/ToastContext";`

**Step 2: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add error toast to settings page"
```

---

### Task 9: Add error toasts to shopping list pages

**Files:**
- Modify: `frontend/src/pages/ShoppingListPage.tsx`
- Modify: `frontend/src/pages/ShoppingListDetailPage.tsx`

**Step 1: Add error handling to ShoppingListPage**

Import `useToast`. In the `ShoppingListView` component, add `const { addToast } = useToast();` and update:

```tsx
function handleUncheckAll() {
  if (!hasCheckedItems) return;
  bulkToggle.mutate({ item_ids: checkedItemIds, is_checked: false }, {
    onError: () => addToast(t("errors.shoppingUpdate"), "error"),
  });
}

function handleToggleItem(itemId: string) {
  toggleItem.mutate(itemId, {
    onError: () => addToast(t("errors.shoppingUpdate"), "error"),
  });
}
```

Add the import: `import { useToast } from "../contexts/ToastContext";`

**Step 2: Add error handling to ShoppingListDetailPage**

Same pattern. Import `useToast`, add `const { addToast } = useToast();`, update both handlers:

```tsx
function handleUncheckAll() {
  if (!hasCheckedItems) return;
  bulkToggle.mutate({ item_ids: checkedItemIds, is_checked: false }, {
    onError: () => addToast(t("errors.shoppingUpdate"), "error"),
  });
}

function handleToggleItem(itemId: string) {
  toggleItem.mutate(itemId, {
    onError: () => addToast(t("errors.shoppingUpdate"), "error"),
  });
}
```

Add the import: `import { useToast } from "../contexts/ToastContext";`

**Step 3: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/pages/ShoppingListPage.tsx frontend/src/pages/ShoppingListDetailPage.tsx
git commit -m "feat: add error toasts to shopping list pages"
```

---

### Task 10: Fix existing tests and run full verification

**Files:**
- Modify: `frontend/src/__tests__/RecipeListPage.test.tsx` (if needed — test may need ToastProvider wrapper)

**Step 1: Run all frontend tests**

Run: `cd frontend && npm test`

If tests fail because components now call `useToast()` outside a `ToastProvider`, wrap the test render with `<ToastProvider>`. Check the test file's render wrapper and add `ToastProvider` around it.

**Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: No lint errors

**Step 3: Run full build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

**Step 4: Commit any test fixes**

```bash
git add frontend/src/__tests__/
git commit -m "test: wrap test renders with ToastProvider"
```
