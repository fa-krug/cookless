# Cookless Phase 7: Frontend Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + Django Ninja backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, Bearer token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, Django Ninja, Pydantic, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase 7: Frontend Implementation

### Task 22: i18n setup

**Files:**
- Create: `frontend/src/i18n/index.ts`
- Create: `frontend/src/i18n/en.json`
- Create: `frontend/src/i18n/de.json`
- Modify: `frontend/src/main.tsx`

**Step 1: Configure react-i18next**

Set up i18next with EN and DE translation files. Auto-detect browser language. Include translations for all UI strings: nav labels, button texts, form labels, etc.

**Step 2: Verify language switching works**

Run: `cd frontend && npm run dev`
Manually verify language toggle renders correctly.

**Step 3: Commit**

```bash
git add frontend/src/i18n/
git commit -m "feat: add i18n setup with EN and DE translations"
```

---

### Task 23: API client and auth hooks

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/contexts/AuthContext.tsx`

**Step 1: Create API client**

Axios or fetch wrapper that:
- Sends cookies automatically (`credentials: "include"`)
- Includes CSRF token from cookie
- Base URL from env or proxy

**Step 2: Create TypeScript types**

Define types for: User, Household, Recipe, RecipeIngredient, Ingredient, Unit, MealPlan, MealPlanEntry, ShoppingList, ShoppingListItem.

**Step 3: Create auth context and hook**

- `AuthContext` provides current user, login/logout functions
- `useAuth` hook for components
- Apple Sign-In redirect flow

**Step 4: Commit**

```bash
git add frontend/src/api/ frontend/src/hooks/ frontend/src/contexts/
git commit -m "feat: add API client, types, and auth context"
```

---

### Task 24: App layout and routing

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/BottomNav.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`

**Step 1: Create Layout component**

Mobile-first layout with bottom navigation bar (Recipes, Plan, Shopping, Settings). Protected route wrapper that redirects to login.

**Step 2: Set up React Router**

```tsx
// Routes:
// /login          -> LoginPage
// /recipes        -> RecipeListPage
// /recipes/:id    -> RecipeDetailPage
// /plan           -> MealPlanPage
// /shopping       -> ShoppingListPage
// /shopping/:id   -> ShoppingListDetailPage
// /cook/:id       -> CookingViewPage
// /settings       -> SettingsPage
// /household      -> HouseholdPage
```

**Step 3: Create LoginPage with Apple Sign-In button**

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add app layout, routing, and login page"
```

---

### Task 25: Recipe list page

**Files:**
- Create: `frontend/src/pages/RecipeListPage.tsx`
- Create: `frontend/src/components/RecipeCard.tsx`
- Create: `frontend/src/hooks/useRecipes.ts`

**Step 1: Create useRecipes hook**

TanStack Query hook for fetching recipes with list_type filter.

**Step 2: Create RecipeCard component**

Card showing recipe title, prep time, servings. Swipe-to-delete (or delete button).

**Step 3: Create RecipeListPage**

Two tabs: "Known" and "To Try". Quick-add form at top (title + list_type, details added later). Search/filter input. List of RecipeCards.

**Step 4: Write Vitest tests**

Test: tab switching, recipe rendering, quick-add form submission.

**Step 5: Commit**

```bash
git commit -m "feat: add recipe list page with tabs and quick-add"
```

---

### Task 26: Recipe detail/edit page

**Files:**
- Create: `frontend/src/pages/RecipeDetailPage.tsx`
- Create: `frontend/src/components/IngredientForm.tsx`
- Create: `frontend/src/components/StepEditor.tsx`
- Create: `frontend/src/hooks/useIngredients.ts`
- Create: `frontend/src/hooks/useUnits.ts`

**Step 1: Create ingredient autocomplete**

`useIngredients` hook with search query. Autocomplete dropdown for ingredient name (searches global Ingredient table). Unit selector dropdown.

**Step 2: Create IngredientForm component**

Add/remove ingredient rows. Each row: quantity input, unit dropdown, ingredient autocomplete.

**Step 3: Create StepEditor component**

Two sections: Manual steps, Machine steps. Add/remove/reorder steps. Each step: step number + textarea.

**Step 4: Create RecipeDetailPage**

Edit title, servings, prep/cook time. IngredientForm. StepEditor. Move to other list button. Save/delete buttons.

**Step 5: Commit**

```bash
git commit -m "feat: add recipe detail page with ingredient and step editors"
```

---

### Task 27: Meal plan page

**Files:**
- Create: `frontend/src/pages/MealPlanPage.tsx`
- Create: `frontend/src/components/PlanGrid.tsx`
- Create: `frontend/src/components/GenerateDrawer.tsx`
- Create: `frontend/src/hooks/useMealPlan.ts`

**Step 1: Create useMealPlan hook**

TanStack Query hooks for: list plans, generate plan, get plan detail, swap entry, regenerate.

**Step 2: Create PlanGrid component**

7-day grid showing lunch + dinner per day. Each cell shows recipe name. Leftover entries visually distinct (muted/italic). Tap cell to swap recipe. Lock icon toggle per entry.

**Step 3: Create GenerateDrawer component**

Slide-up drawer with: days (7/14), servings, known/new ratio slider. "Generate" button. "Create Shopping List" button (appears after plan exists).

**Step 4: Create MealPlanPage**

Shows current plan or empty state with generate prompt. PlanGrid + GenerateDrawer.

**Step 5: Commit**

```bash
git commit -m "feat: add meal plan page with grid and generation"
```

---

### Task 28: Shopping list page

**Files:**
- Create: `frontend/src/pages/ShoppingListPage.tsx`
- Create: `frontend/src/components/ShoppingCategory.tsx`
- Create: `frontend/src/hooks/useShoppingList.ts`

**Step 1: Create useShoppingList hook**

TanStack Query hooks for: get list, toggle item, bulk toggle.

**Step 2: Create ShoppingCategory component**

Collapsible category section (e.g., "Produce", "Dairy"). List of items with checkbox, quantity, unit, ingredient name. Checked items sink to bottom with strikethrough.

**Step 3: Create ShoppingListPage**

List of ShoppingCategory sections. "Uncheck All" button. Shows which meal plan it's linked to.

**Step 4: Commit**

```bash
git commit -m "feat: add shopping list page grouped by category"
```

---

### Task 29: Cooking view page

**Files:**
- Create: `frontend/src/pages/CookingViewPage.tsx`
- Create: `frontend/src/hooks/useWakeLock.ts`

**Step 1: Create useWakeLock hook**

Uses Wake Lock API to keep screen on. Activates on mount, releases on unmount.

**Step 2: Create CookingViewPage**

Method selector: Manual | Machine (toggle/tabs at top). Scrollable step list. Current step highlighted (larger font, accent border). Tap step to set as current. Step number + instruction text. Wake lock active indicator.

**Step 3: Commit**

```bash
git commit -m "feat: add cooking view with step highlighting and wake lock"
```

---

### Task 30: Household management page

**Files:**
- Create: `frontend/src/pages/HouseholdPage.tsx`
- Create: `frontend/src/hooks/useHousehold.ts`

**Step 1: Create useHousehold hook**

TanStack Query hooks for: list households, create, switch, create invite, accept invite, remove member.

**Step 2: Create HouseholdPage**

Current household display. Switch household dropdown. Create new household form. Members list (with remove button for owner). Generate invite link button (shows code/link, copy to clipboard). Join household form (paste invite code).

**Step 3: Commit**

```bash
git commit -m "feat: add household management page"
```

---

### Task 31: Settings page

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Create SettingsPage**

Language toggle (DE/EN). Default servings input. Default known/new ratio slider. Save button. Logout button.

**Step 2: Commit**

```bash
git commit -m "feat: add settings page with language and defaults"
```
