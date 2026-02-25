# PX4: React Query staleTime Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce unnecessary background refetches by setting appropriate `staleTime` defaults and per-query overrides for data that changes infrequently.

**Architecture:** Set a global `staleTime` default of 60 seconds on the `QueryClient`. Override to `Infinity` for units (seeded once, never changes at runtime) and 5 minutes for ingredients (rarely added). Leave recipes and other queries at the 60s default.

**Tech Stack:** TanStack React Query `defaultOptions`

---

### Task 1: Set global `staleTime` default

**Files:**
- Modify: `frontend/src/components/AppProviders.tsx`

**Step 1: Add `defaultOptions` to `QueryClient`**

In `frontend/src/components/AppProviders.tsx`, update the `QueryClient` construction:

```typescript
// OLD
const [queryClient] = useState(() => new QueryClient({
  mutationCache: new MutationCache({
    onError: (_error, _variables, _context, mutation) => {
      if (!mutation.options.onError) {
        addToast(t("common.error"), "error");
      }
    },
  }),
}));

// NEW
const [queryClient] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
    },
  },
  mutationCache: new MutationCache({
    onError: (_error, _variables, _context, mutation) => {
      if (!mutation.options.onError) {
        addToast(t("common.error"), "error");
      }
    },
  }),
}));
```

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/AppProviders.tsx
git commit -m "perf(px4): set global staleTime default to 60s"
```

---

### Task 2: Set per-query `staleTime` for static data

**Files:**
- Modify: `frontend/src/hooks/useUnits.ts`
- Modify: `frontend/src/hooks/useIngredients.ts`

**Step 1: Update `useUnits` with `staleTime: Infinity`**

```typescript
// OLD
export function useUnits() {
  return useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get<Unit[]>("/api/v1/units/"),
  });
}

// NEW
export function useUnits() {
  return useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get<Unit[]>("/api/v1/units/"),
    staleTime: Infinity,
  });
}
```

**Step 2: Update `useIngredients` with `staleTime: 5 * 60_000`**

```typescript
// OLD
export function useIngredients() {
  return useQuery<Ingredient[]>({
    queryKey: ["ingredients"],
    queryFn: () => api.get<Ingredient[]>("/api/v1/ingredients/"),
  });
}

// NEW
export function useIngredients() {
  return useQuery<Ingredient[]>({
    queryKey: ["ingredients"],
    queryFn: () => api.get<Ingredient[]>("/api/v1/ingredients/"),
    staleTime: 5 * 60_000,
  });
}
```

**Step 3: Run frontend lint and type check**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: No errors

**Step 4: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add frontend/src/hooks/useUnits.ts frontend/src/hooks/useIngredients.ts
git commit -m "perf(px4): set staleTime Infinity for units, 5min for ingredients"
```
