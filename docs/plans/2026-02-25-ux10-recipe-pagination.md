# Recipe List Pagination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cursor-based pagination to the recipe list API and infinite scroll to the frontend, so large recipe collections don't load everything at once.

**Architecture:** Backend returns paginated results with `limit`/`offset` query params and a `total_count` field. Frontend uses TanStack React Query's `useInfiniteQuery` with intersection observer for infinite scroll. Search and sort remain client-side for the initial version (fetch all matching, paginate display).

**Decision:** Use offset pagination (not cursor) because recipes need arbitrary sorting (name, date) and Django Ninja's offset approach is simpler. Page size: 20 recipes.

**Tech Stack:** Django Ninja (backend), TanStack React Query `useInfiniteQuery` (frontend), Intersection Observer API

---

### Task 1: Add paginated response schema to backend

**Files:**
- Modify: `backend/recipes/schemas.py`
- Test: `backend/recipes/tests/test_api.py`

**Step 1: Write the failing test**

```python
# Add to backend/recipes/tests/test_api.py
@pytest.mark.django_db
def test_list_recipes_paginated(auth_client):
    client, household = auth_client
    # Create 25 recipes
    for i in range(25):
        Recipe.objects.create(
            title=f"Recipe {i:02d}",
            household=household,
            list_type="KNOWN",
            default_servings=2,
        )

    # First page
    response = client.get("/api/v1/recipes/?limit=20&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 20
    assert data["total_count"] == 25

    # Second page
    response = client.get("/api/v1/recipes/?limit=20&offset=20")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5
    assert data["total_count"] == 25


@pytest.mark.django_db
def test_list_recipes_paginated_with_list_type(auth_client):
    client, household = auth_client
    for i in range(10):
        Recipe.objects.create(
            title=f"Known {i}", household=household, list_type="KNOWN", default_servings=2,
        )
    for i in range(5):
        Recipe.objects.create(
            title=f"ToTry {i}", household=household, list_type="TO_TRY", default_servings=2,
        )

    response = client.get("/api/v1/recipes/?list_type=KNOWN&limit=20&offset=0")
    data = response.json()
    assert data["total_count"] == 10
    assert len(data["items"]) == 10


@pytest.mark.django_db
def test_list_recipes_default_pagination(auth_client):
    """Without limit/offset params, returns all recipes (backwards compatible)."""
    client, household = auth_client
    for i in range(5):
        Recipe.objects.create(
            title=f"Recipe {i}", household=household, list_type="KNOWN", default_servings=2,
        )

    response = client.get("/api/v1/recipes/")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5
    assert data["total_count"] == 5
```

**Step 2: Run test to verify it fails**

Run: `pytest backend/recipes/tests/test_api.py::test_list_recipes_paginated -v`
Expected: FAIL — response is a list, not a dict with `items`

**Step 3: Add paginated response schema**

In `backend/recipes/schemas.py`:

```python
class PaginatedRecipeListOut(Schema):
    items: list[RecipeListOut]
    total_count: int
```

**Step 4: Update the API endpoint**

In `backend/recipes/api.py`, update `list_recipes`:

```python
@router.get("/recipes/", response=PaginatedRecipeListOut, tags=["recipes"])
def list_recipes(
    request,
    list_type: str | None = None,
    limit: int | None = None,
    offset: int = 0,
):
    require_household_member(request)
    qs = Recipe.objects.filter(household=request.user.active_household)
    if list_type:
        qs = qs.filter(list_type=list_type)

    total_count = qs.count()

    if limit is not None:
        qs = qs[offset : offset + limit]

    return {"items": qs, "total_count": total_count}
```

**Step 5: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_api.py -v -k paginated`
Expected: PASS

Also run all existing tests to verify backwards compatibility:
Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: Some may fail due to response shape change — fix in Task 2.

**Step 6: Commit**

```bash
git add backend/recipes/schemas.py backend/recipes/api.py backend/recipes/tests/test_api.py
git commit -m "feat(ux10): add paginated recipe list endpoint"
```

---

### Task 2: Fix existing backend tests for new response shape

**Files:**
- Modify: `backend/recipes/tests/test_api.py`

**Step 1: Update all tests that call GET /api/v1/recipes/**

Every test that does `response.json()` expecting a list now needs to read `response.json()["items"]` instead.

Find all occurrences and update them. For example:

```python
# Before:
data = response.json()
assert len(data) == 2

# After:
data = response.json()
assert len(data["items"]) == 2
```

**Step 2: Run full test suite**

Run: `pytest backend/recipes/tests/test_api.py -v`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/recipes/tests/test_api.py
git commit -m "fix(ux10): update existing tests for paginated response shape"
```

---

### Task 3: Update frontend types and API hook

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/hooks/useRecipes.ts`

**Step 1: Add paginated response type**

In `frontend/src/api/types.ts`:

```typescript
export interface PaginatedResponse<T> {
  items: T[];
  total_count: number;
}
```

**Step 2: Update useRecipes hook to use useInfiniteQuery**

```typescript
import { useInfiniteQuery } from "@tanstack/react-query";
import type { PaginatedResponse, RecipeSummary } from "../api/types";

const PAGE_SIZE = 20;

export function useRecipes(listType?: ListType) {
  return useInfiniteQuery<PaginatedResponse<RecipeSummary>>({
    queryKey: ["recipes", listType],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      if (listType) params.set("list_type", listType);
      params.set("limit", PAGE_SIZE.toString());
      params.set("offset", pageParam.toString());
      return api.get<PaginatedResponse<RecipeSummary>>(`/api/v1/recipes/?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total_count ? loaded : undefined;
    },
  });
}
```

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/useRecipes.ts
git commit -m "feat(ux10): convert useRecipes to useInfiniteQuery"
```

---

### Task 4: Update RecipeListPage to consume infinite query

**Files:**
- Modify: `frontend/src/pages/RecipeListPage.tsx`

**Step 1: Update data access pattern**

The `useInfiniteQuery` returns `data.pages` (array of pages). Flatten them:

```tsx
const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useRecipes(activeTab);

const allRecipes = data?.pages.flatMap((page) => page.items) ?? [];
const totalCount = data?.pages[0]?.total_count ?? 0;
```

Replace all references to `recipes` with `allRecipes`.

**Step 2: Update filtering to use allRecipes**

```tsx
const filteredRecipes = sortRecipes(
  allRecipes.filter(
    (r) => r.title.toLowerCase().includes(search.toLowerCase()) && !pendingDeletes.has(r.id),
  ),
  sort,
  i18n.language,
);
```

**Step 3: Update empty state detection**

```tsx
const hasRecipes = allRecipes.filter((r) => !pendingDeletes.has(r.id)).length > 0;
```

**Step 4: Add infinite scroll trigger**

Add at the bottom of the recipe list:

```tsx
import { useEffect, useRef } from "react";

// Inside the component:
const loadMoreRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!loadMoreRef.current || !hasNextPage) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    { threshold: 0.1 },
  );
  observer.observe(loadMoreRef.current);
  return () => observer.disconnect();
}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
```

At the bottom of the recipe list div:

```tsx
{hasNextPage && (
  <div ref={loadMoreRef} className="flex justify-center py-4">
    {isFetchingNextPage && <Spinner size={24} />}
  </div>
)}
```

**Step 5: Verify visually**

Run: `cd frontend && npm run dev`
Add 25+ recipes. Scroll down — more should load automatically.

**Step 6: Commit**

```bash
git add frontend/src/pages/RecipeListPage.tsx
git commit -m "feat(ux10): add infinite scroll to recipe list"
```

---

### Task 5: Update RecipeDetailPage cache interaction

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

**Step 1: Update optimistic cache reads**

If `RecipeDetailPage` reads from the recipe list cache (e.g., for optimistic updates), update it to handle the new paginated structure. Check for any `queryClient.getQueryData(["recipes"])` calls and update them to handle `{ pages: [...] }` format.

Look for patterns like:

```tsx
// Before:
const cached = queryClient.getQueryData<RecipeSummary[]>(["recipes", listType]);

// After:
const cached = queryClient.getQueryData<InfiniteData<PaginatedResponse<RecipeSummary>>>(["recipes", listType]);
const allCached = cached?.pages.flatMap((p) => p.items) ?? [];
```

**Step 2: Run frontend tests**

Run: `cd frontend && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "fix(ux10): update RecipeDetailPage for paginated cache structure"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run backend tests**

Run: `pytest`
Expected: ALL PASS

**Step 2: Run frontend tests**

Run: `cd frontend && npm test`
Expected: ALL PASS

**Step 3: Run linters**

Run: `ruff check . --fix && ruff format .`
Run: `cd frontend && npm run lint`
Expected: Clean

**Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(ux10): lint fixes for pagination"
```
