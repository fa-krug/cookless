# New Recipe Highlight After Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After creating a recipe, scroll to and briefly highlight the new recipe card in the list so users get clear confirmation their recipe was added.

**Architecture:** Pass the new recipe ID via React Router navigation state. RecipeListPage reads it, scrolls the card into view, and applies a fade-out highlight animation. The success toast already exists (`success.recipeSaved`) — this adds the visual anchor.

**Tech Stack:** React Router (navigation state), React refs, Tailwind CSS animation, existing RecipeCard component

---

### Task 1: Pass new recipe ID through navigation state

**Files:**
- Modify: `frontend/src/pages/RecipeCreatePage.tsx`

**Step 1: Update onSuccess handler to pass recipe ID**

The `useCreateRecipe` mutation returns the created `Recipe` object. Update the `onSuccess` callback:

```tsx
createRecipe.mutate(payload, {
  onSuccess: (newRecipe) => {
    queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    addToast(t("success.recipeSaved"), "success");
    navigate("/recipes", { state: { newRecipeId: newRecipe.id } });
  },
  onError: () => addToast(t("errors.recipeSave"), "error"),
});
```

**Step 2: Commit**

```bash
git add frontend/src/pages/RecipeCreatePage.tsx
git commit -m "feat(ux9): pass new recipe ID via navigation state"
```

---

### Task 2: Add highlight animation to Tailwind config

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Add keyframes and animation class**

Add to the CSS file (alongside the existing `slide-down` animation):

```css
@keyframes highlight-fade {
  0% { background-color: rgb(255 237 213); }  /* orange-100 */
  100% { background-color: transparent; }
}

.animate-highlight {
  animation: highlight-fade 2s ease-out;
}
```

**Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(ux9): add highlight-fade CSS animation"
```

---

### Task 3: Scroll to and highlight new recipe in RecipeListPage

**Files:**
- Modify: `frontend/src/pages/RecipeListPage.tsx`
- Modify: `frontend/src/components/RecipeCard.tsx`

**Step 1: Read navigation state in RecipeListPage**

```tsx
import { useLocation } from "react-router-dom";

// Inside the component:
const location = useLocation();
const newRecipeId = (location.state as { newRecipeId?: string })?.newRecipeId;

// Clear the state so it doesn't re-highlight on back navigation:
useEffect(() => {
  if (newRecipeId) {
    window.history.replaceState({}, "");
  }
}, [newRecipeId]);
```

**Step 2: Pass highlight prop to RecipeCard**

```tsx
{filteredRecipes.map((recipe) => (
  <RecipeCard
    key={recipe.id}
    recipe={recipe}
    onDelete={handleDelete}
    highlight={recipe.id === newRecipeId}
  />
))}
```

**Step 3: Update RecipeCard to accept highlight prop**

In `RecipeCard.tsx`, add the prop and apply the animation + scroll-into-view:

```tsx
import { useEffect, useRef } from "react";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onDelete: (id: string) => void;
  highlight?: boolean;
}

export default function RecipeCard({ recipe, onDelete, highlight }: RecipeCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  return (
    <div
      ref={highlight ? ref : undefined}
      className={`flex min-w-0 items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${
        highlight ? "animate-highlight" : ""
      }`}
    >
      {/* ... existing content unchanged ... */}
    </div>
  );
}
```

**Step 4: Verify visually**

Run: `cd frontend && npm run dev`
Create a new recipe. After save, the list should scroll to the new card and show a brief orange highlight that fades to white.

**Step 5: Commit**

```bash
git add frontend/src/pages/RecipeListPage.tsx frontend/src/components/RecipeCard.tsx
git commit -m "feat(ux9): scroll to and highlight newly created recipe"
```
