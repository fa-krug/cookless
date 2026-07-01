# Plan 8f — Offline PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore offline shopping-toggle queuing (with reconnect replay) and runtime read-caching of `/shopping`, `/plan`, and recipe pages to the Next.js app, plus a subtle offline indicator — closing audit item C2, the last Section B parity gap.

**Architecture:** Server Actions can't be cleanly intercepted/replayed by a service worker, so the write path becomes a real JSON Route Handler (`POST /api/shopping/toggle`) that reuses the already-tested `lib/shopping/items.ts` logic. Offline queuing lives in a client-side IndexedDB module + a `drainQueue` replay engine (both unit-tested), driven by a `useOnlineSync` hook. A hand-rolled runtime-caching `public/sw.js` makes read pages viewable offline. A small indicator surfaces offline/syncing state.

**Tech Stack:** Next.js 16 App Router (RSC + Route Handlers) · Drizzle ORM + better-sqlite3 · Zod · IndexedDB (hand-rolled wrapper) · Vitest (node env, in-memory SQLite via `@/lib/test/db`, `fake-indexeddb` for IDB) · Tailwind 4 · Web Service Worker API.

Design spec: `docs/superpowers/specs/2026-07-01-nextjs-migration-08f-offline-pwa-design.md`.

## Global Constraints

- **App root is `web/`.** All paths below are relative to `web/` unless noted. Run all commands from `web/`.
- **Verification is `npx vitest run` + `npm run typecheck` + `npm run build`.** The `web` app has NO eslint (Next 16 dropped `next lint`); there is no lint step.
- **Vitest environment is `node`** (`vitest.config.ts`). Tests must not rely on `window`/`navigator`/`document` (no jsdom). IndexedDB in tests comes from `fake-indexeddb`. Fetch is stubbed via `vi.stubGlobal("fetch", …)` or passed as an argument.
- **Route handlers are thin and NOT unit-tested in this codebase** (no session-mock harness exists; verified: zero `app/**/route.test.ts` files). Their mutation logic is covered at the `lib/` layer. Follow this convention — do not build a session-mock harness. The one piece of new route logic (body parsing) is covered by a Zod schema test.
- **Parity intent:** only shopping-list toggles are queued offline (matching the old app). No offline creation/editing of recipes or plans. Keep the online-event replay model (no Background Sync API).
- **No new runtime dependencies.** The service worker is hand-rolled. The only new dependency is `fake-indexeddb` as a **devDependency**.
- **i18n files live at `lib/i18n/locales/{en,de}.json`.** New keys MUST be added to **both** locales with identical structure (26 top-level keys today; keep them symmetric).
- **Commit message convention:** `<type>(web): <description> (Plan 8f Task N)`.

---

### Task 1: Toggle Route Handler + request schema

The clean, replayable write path Server Actions can't be. A Zod discriminated union parses the body; the handler authenticates via `requireHousehold()` and delegates to the existing (already-tested) `lib/shopping/items.ts` functions.

**Files:**
- Create: `lib/schemas/shopping.ts`
- Test: `lib/schemas/shopping.test.ts`
- Create: `app/api/shopping/toggle/route.ts`

**Interfaces:**
- Consumes: `toggleShoppingItem(db, householdId, itemId): boolean` and `setShoppingItemsChecked(db, householdId, itemIds, isChecked): number` (`@/lib/shopping/items`); `requireHousehold(): Promise<{ householdId: string }>` (`@/lib/auth/session`); `AuthError` (`@/lib/auth/errors`); `db` (`@/lib/db`).
- Produces: `shoppingSyncSchema` (Zod discriminated union on `kind`) and `ShoppingSyncInput` type (`@/lib/schemas/shopping`). Route `POST /api/shopping/toggle` accepting `{ kind: "toggle", itemId }` → `{ checked: boolean }`, or `{ kind: "uncheck-all", itemIds }` → `{ count: number }`. This request shape is the contract for Tasks 3 and 4.

- [ ] **Step 1: Write the failing schema test**

Create `lib/schemas/shopping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shoppingSyncSchema } from "./shopping";

describe("shoppingSyncSchema", () => {
  it("accepts a toggle op", () => {
    const parsed = shoppingSyncSchema.safeParse({ kind: "toggle", itemId: "i1" });
    expect(parsed.success).toBe(true);
  });

  it("accepts an uncheck-all op", () => {
    const parsed = shoppingSyncSchema.safeParse({ kind: "uncheck-all", itemIds: ["i1", "i2"] });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(shoppingSyncSchema.safeParse({ kind: "delete", itemId: "i1" }).success).toBe(false);
  });

  it("rejects a toggle missing itemId", () => {
    expect(shoppingSyncSchema.safeParse({ kind: "toggle" }).success).toBe(false);
  });

  it("rejects an uncheck-all with a non-array itemIds", () => {
    expect(shoppingSyncSchema.safeParse({ kind: "uncheck-all", itemIds: "i1" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/schemas/shopping.test.ts`
Expected: FAIL — cannot resolve `./shopping`.

- [ ] **Step 3: Create the schema**

Create `lib/schemas/shopping.ts`:

```ts
import { z } from "zod";

export const shoppingSyncSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("toggle"), itemId: z.string().min(1) }),
  z.object({ kind: z.literal("uncheck-all"), itemIds: z.array(z.string().min(1)) }),
]);

export type ShoppingSyncInput = z.infer<typeof shoppingSyncSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/schemas/shopping.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Create the Route Handler**

Create `app/api/shopping/toggle/route.ts` (mirrors the auth/error shape of `app/api/recipes/route.ts`):

```ts
import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { toggleShoppingItem, setShoppingItemsChecked } from "@/lib/shopping/items";
import { shoppingSyncSchema } from "@/lib/schemas/shopping";

export async function POST(req: Request) {
  try {
    const { householdId } = await requireHousehold();
    const raw = await req.json().catch(() => null);
    const parsed = shoppingSyncSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }
    const body = parsed.data;
    if (body.kind === "toggle") {
      const checked = toggleShoppingItem(db, householdId, body.itemId);
      return NextResponse.json({ checked });
    }
    const count = setShoppingItemsChecked(db, householdId, body.itemIds, false);
    return NextResponse.json({ count });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ message: e.message }, { status: e.status });
    }
    throw e;
  }
}
```

- [ ] **Step 6: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed; the new route appears in the build output as `ƒ /api/shopping/toggle`.

- [ ] **Step 7: Commit**

```bash
git add lib/schemas/shopping.ts lib/schemas/shopping.test.ts app/api/shopping/toggle/route.ts
git commit -m "feat(web): shopping-toggle route handler + request schema (Plan 8f Task 1)"
```

---

### Task 2: Offline queue module (IndexedDB)

A pure IndexedDB wrapper storing pending offline ops in insertion order. No React, no fetch. Adds `fake-indexeddb` for tests.

**Files:**
- Modify: `package.json` (add `fake-indexeddb` devDependency)
- Create: `lib/offline/queue.ts`
- Test: `lib/offline/queue.test.ts`

**Interfaces:**
- Produces: `QueuedOp = { id: number; kind: "toggle" | "uncheck-all"; payload: Record<string, unknown> }`; `enqueue(op: Omit<QueuedOp, "id">): Promise<void>`; `all(): Promise<QueuedOp[]>`; `remove(id: number): Promise<void>`; `count(): Promise<number>`; `clear(): Promise<void>`. All exported from `@/lib/offline/queue`. Insertion order is preserved (autoincrement key). Consumed by Tasks 3, 4, 5, 6.

- [ ] **Step 1: Install `fake-indexeddb` as a devDependency**

Run: `npm install --save-dev fake-indexeddb`
Expected: `fake-indexeddb` added under `devDependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `lib/offline/queue.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { enqueue, all, remove, count, clear } from "./queue";

beforeEach(() => {
  // Fresh in-memory IndexedDB per test.
  globalThis.indexedDB = new IDBFactory();
});

describe("offline queue", () => {
  it("enqueues ops and returns them in insertion order", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    const ops = await all();
    expect(ops.map((o) => o.payload.itemId)).toEqual(["a", "b"]);
    expect(ops[0].id).toBeLessThan(ops[1].id);
  });

  it("counts pending ops", async () => {
    expect(await count()).toBe(0);
    await enqueue({ kind: "uncheck-all", payload: { itemIds: ["a", "b"] } });
    expect(await count()).toBe(1);
  });

  it("removes a single op by id", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    const [first] = await all();
    await remove(first.id);
    const ops = await all();
    expect(ops.map((o) => o.payload.itemId)).toEqual(["b"]);
  });

  it("clears all ops", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await clear();
    expect(await count()).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/offline/queue.test.ts`
Expected: FAIL — cannot resolve `./queue`.

- [ ] **Step 4: Implement the queue module**

Create `lib/offline/queue.ts`:

```ts
// web/lib/offline/queue.ts
// Client-side IndexedDB queue of shopping ops made while offline.
// Insertion order is preserved via the autoincrement key.

const DB_NAME = "cookless-offline";
const STORE = "pending-ops";
const DB_VERSION = 1;

export type QueuedOp = {
  id: number;
  kind: "toggle" | "uncheck-all";
  payload: Record<string, unknown>;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function enqueue(op: Omit<QueuedOp, "id">): Promise<void> {
  await tx("readwrite", (store) => store.add(op));
}

export async function all(): Promise<QueuedOp[]> {
  return tx<QueuedOp[]>("readonly", (store) => store.getAll());
}

export async function remove(id: number): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

export async function count(): Promise<number> {
  return tx<number>("readonly", (store) => store.count());
}

export async function clear(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/offline/queue.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/offline/queue.ts lib/offline/queue.test.ts
git commit -m "feat(web): offline IndexedDB op queue (Plan 8f Task 2)"
```

---

### Task 3: Sync engine (`drainQueue`)

Replays queued ops to the Route Handler in order, removing each on success and stopping on the first failure. Pure and fetch-injectable so it is fully unit-tested.

**Files:**
- Create: `lib/offline/sync.ts`
- Test: `lib/offline/sync.test.ts`

**Interfaces:**
- Consumes: `all()`, `remove(id)` (`@/lib/offline/queue`); the `POST /api/shopping/toggle` contract from Task 1.
- Produces: `drainQueue(fetchImpl?: typeof fetch): Promise<{ drained: number; remaining: number }>`. Replays in insertion order; `remaining = ops.length - drained`. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `lib/offline/sync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { enqueue, all } from "./queue";
import { drainQueue } from "./sync";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ checked: true }), { status: 200 }));
}

describe("drainQueue", () => {
  it("replays all ops and empties the queue on success", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    const fetchImpl = okFetch();
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 2, remaining: 0 });
    expect(await all()).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends kind + payload as the request body", async () => {
    await enqueue({ kind: "uncheck-all", payload: { itemIds: ["a", "b"] } });
    const fetchImpl = okFetch();
    await drainQueue(fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ kind: "uncheck-all", itemIds: ["a", "b"] });
  });

  it("stops at the first network failure and keeps the remainder", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("offline");
      return new Response("{}", { status: 200 });
    });
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 1, remaining: 1 });
    expect(await all()).toHaveLength(1);
  });

  it("stops on a non-2xx response", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 0, remaining: 1 });
    expect(await all()).toHaveLength(1);
  });

  it("no-ops on an empty queue", async () => {
    const fetchImpl = okFetch();
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 0, remaining: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/offline/sync.test.ts`
Expected: FAIL — cannot resolve `./sync`.

- [ ] **Step 3: Implement the sync engine**

Create `lib/offline/sync.ts`:

```ts
// web/lib/offline/sync.ts
// Replays queued offline shopping ops to the toggle route handler, in order.
import { all, remove } from "./queue";

const ENDPOINT = "/api/shopping/toggle";

export async function drainQueue(
  fetchImpl: typeof fetch = fetch,
): Promise<{ drained: number; remaining: number }> {
  const ops = await all();
  let drained = 0;
  for (const op of ops) {
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: op.kind, ...op.payload }),
        credentials: "include",
      });
      if (!res.ok) break;
      await remove(op.id);
      drained += 1;
    } catch {
      break;
    }
  }
  return { drained, remaining: ops.length - drained };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/offline/sync.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/offline/sync.ts lib/offline/sync.test.ts
git commit -m "feat(web): offline queue replay engine (Plan 8f Task 3)"
```

---

### Task 4: Client submit helpers + rewire shopping components

Add the client-side submit helpers that call the Route Handler and enqueue on offline. Rewire the two shopping components to use them, then remove the now-dead Server Actions.

**Files:**
- Create: `lib/offline/submit.ts`
- Test: `lib/offline/submit.test.ts`
- Modify: `components/shopping/shopping-category.tsx`
- Modify: `components/shopping/shopping-actions.tsx`
- Modify: `app/(app)/actions.ts` (remove `toggleShoppingItemAction`, `uncheckAllShoppingAction`)

**Interfaces:**
- Consumes: `enqueue()` (`@/lib/offline/queue`); the `POST /api/shopping/toggle` contract from Task 1.
- Produces: `submitToggle(itemId: string): Promise<{ result: "synced" | "queued" | "error"; checked?: boolean }>`; `submitUncheckAll(itemIds: string[]): Promise<"synced" | "queued" | "error">`. Both exported from `@/lib/offline/submit`.

- [ ] **Step 1: Write the failing test**

Create `lib/offline/submit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { count, all } from "./queue";
import { submitToggle, submitUncheckAll } from "./submit";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitToggle", () => {
  it("returns synced with the server's checked value online", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ checked: true }), { status: 200 })));
    const res = await submitToggle("i1");
    expect(res).toEqual({ result: "synced", checked: true });
    expect(await count()).toBe(0);
  });

  it("returns error on a non-2xx response and does not enqueue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const res = await submitToggle("i1");
    expect(res.result).toBe("error");
    expect(await count()).toBe(0);
  });

  it("enqueues and returns queued when the network is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await submitToggle("i1");
    expect(res.result).toBe("queued");
    const ops = await all();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "toggle", payload: { itemId: "i1" } });
  });
});

describe("submitUncheckAll", () => {
  it("enqueues an uncheck-all op when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await submitUncheckAll(["i1", "i2"]);
    expect(res).toBe("queued");
    const ops = await all();
    expect(ops[0]).toMatchObject({ kind: "uncheck-all", payload: { itemIds: ["i1", "i2"] } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/offline/submit.test.ts`
Expected: FAIL — cannot resolve `./submit`.

- [ ] **Step 3: Implement the submit helpers**

Create `lib/offline/submit.ts`:

```ts
// web/lib/offline/submit.ts
// Client helpers that POST shopping ops to the route handler, falling back
// to the offline queue when the network is unavailable.
import { enqueue } from "./queue";

const ENDPOINT = "/api/shopping/toggle";

export type SubmitResult = "synced" | "queued" | "error";

export async function submitToggle(
  itemId: string,
): Promise<{ result: SubmitResult; checked?: boolean }> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "toggle", itemId }),
    });
    if (!res.ok) return { result: "error" };
    const data = (await res.json()) as { checked: boolean };
    return { result: "synced", checked: data.checked };
  } catch {
    await enqueue({ kind: "toggle", payload: { itemId } });
    return { result: "queued" };
  }
}

export async function submitUncheckAll(itemIds: string[]): Promise<SubmitResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "uncheck-all", itemIds }),
    });
    if (!res.ok) return "error";
    return "synced";
  } catch {
    await enqueue({ kind: "uncheck-all", payload: { itemIds } });
    return "queued";
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/offline/submit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewire `shopping-category.tsx`**

In `components/shopping/shopping-category.tsx`, replace the action import:

```tsx
import { toggleShoppingItemAction } from "@/app/(app)/actions";
```

with:

```tsx
import { submitToggle } from "@/lib/offline/submit";
```

Then replace the `onToggle` function body so a queued (offline) result keeps the optimistic state, and only a real error reverts:

```tsx
  function onToggle(item: ShoppingItemDto) {
    const next = !checkedOf(item);
    setOptimistic((o) => ({ ...o, [item.id]: next }));
    startTransition(async () => {
      const { result } = await submitToggle(item.id);
      if (result === "error") {
        setOptimistic((o) => ({ ...o, [item.id]: !next })); // revert
        toast.error(t("common.errorRetry"));
      }
      // "queued" (offline) keeps the optimistic state; it replays on reconnect.
    });
  }
```

- [ ] **Step 6: Rewire `shopping-actions.tsx`**

In `components/shopping/shopping-actions.tsx`, replace the action import:

```tsx
import { uncheckAllShoppingAction } from "@/app/(app)/actions";
```

with:

```tsx
import { useRouter } from "next/navigation";
import { submitUncheckAll } from "@/lib/offline/submit";
```

Add `const router = useRouter();` inside the component (below `const { t } = useT();`), and replace the click handler body. Because the Route Handler (unlike the old Server Action) does not `revalidatePath`, refresh the RSC on success so the reset is reflected:

```tsx
      onClick={() =>
        startTransition(async () => {
          const res = await submitUncheckAll(itemIds);
          if (res === "error") {
            toast.error(t("common.errorRetry"));
          } else {
            router.refresh();
          }
        })
      }
```

- [ ] **Step 7: Remove the dead Server Actions**

In `app/(app)/actions.ts`, delete the `toggleShoppingItemAction` and `uncheckAllShoppingAction` functions (lines ~21–34). Also remove the now-unused import `toggleShoppingItem, setShoppingItemsChecked` from `@/lib/shopping/items` **only if** no other function in the file uses them (verify with a search first — as of this plan they are used solely by those two actions). Leave the `revalidatePath` import (other actions use it).

Verify no dangling references:

Run: `grep -rn "toggleShoppingItemAction\|uncheckAllShoppingAction" app lib components`
Expected: no matches.

- [ ] **Step 8: Verify tests, typecheck, and build**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all pass; build succeeds with no unused-import or unresolved-reference errors.

- [ ] **Step 9: Commit**

```bash
git add lib/offline/submit.ts lib/offline/submit.test.ts \
  components/shopping/shopping-category.tsx components/shopping/shopping-actions.tsx \
  "app/(app)/actions.ts"
git commit -m "feat(web): route shopping toggles through offline-aware submit helpers (Plan 8f Task 4)"
```

---

### Task 5: `useOnlineSync` hook + offline indicator + i18n

The client hook that drains the queue on mount and on reconnect (then refreshes the RSC), and a slim banner surfacing offline/syncing state. Adds i18n keys to both locales.

**Files:**
- Create: `lib/offline/use-online-sync.ts`
- Create: `components/offline/offline-indicator.tsx`
- Modify: `lib/i18n/locales/en.json`
- Modify: `lib/i18n/locales/de.json`

**Interfaces:**
- Consumes: `drainQueue()` (`@/lib/offline/sync`); `count()` (`@/lib/offline/queue`); `useRouter` (`next/navigation`); `useT` (`@/lib/i18n/provider`).
- Produces: `useOnlineSync(): { online: boolean; syncing: boolean }` (`@/lib/offline/use-online-sync`); `<OfflineIndicator />` (`@/components/offline/offline-indicator`). Both consumed by Task 6.

- [ ] **Step 1: Add i18n keys to `en.json`**

In `lib/i18n/locales/en.json`, add a new top-level `"offline"` object (place it immediately after the `"install"` block for locality):

```json
  "offline": {
    "banner": "You're offline — changes will sync when you reconnect.",
    "syncing": "Syncing your changes…"
  },
```

- [ ] **Step 2: Add the matching keys to `de.json`**

In `lib/i18n/locales/de.json`, add the same block in the same position (after `"install"`):

```json
  "offline": {
    "banner": "Du bist offline — Änderungen werden synchronisiert, sobald du wieder online bist.",
    "syncing": "Änderungen werden synchronisiert…"
  },
```

- [ ] **Step 3: Implement the hook**

Create `lib/offline/use-online-sync.ts`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { drainQueue } from "./sync";
import { count } from "./queue";

/**
 * Drains the offline op queue on mount and whenever the browser comes back
 * online, then refreshes the current route so the RSC reflects server truth.
 * Exposes coarse online/syncing flags for the offline indicator.
 */
export function useOnlineSync(): { online: boolean; syncing: boolean } {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    if ((await count()) === 0) return;
    setSyncing(true);
    const { drained, remaining } = await drainQueue();
    if (drained > 0 && remaining === 0) router.refresh();
    setSyncing(false);
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);

    function handleOnline() {
      setOnline(true);
      void sync();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void sync(); // replay anything left from a previous session

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync]);

  return { online, syncing };
}
```

- [ ] **Step 4: Implement the indicator**

Create `components/offline/offline-indicator.tsx`:

```tsx
"use client";

import { useOnlineSync } from "@/lib/offline/use-online-sync";
import { useT } from "@/lib/i18n/provider";

export function OfflineIndicator() {
  const { online, syncing } = useOnlineSync();
  const { t } = useT();

  if (online && !syncing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-sm"
    >
      {syncing ? t("offline.syncing") : t("offline.banner")}
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed. (The hook/indicator have no node-env unit test — no jsdom in this repo; they are verified here and manually in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add lib/offline/use-online-sync.ts components/offline/offline-indicator.tsx \
  lib/i18n/locales/en.json lib/i18n/locales/de.json
git commit -m "feat(web): online-sync hook + offline indicator + i18n (Plan 8f Task 5)"
```

---

### Task 6: Service worker + registration + providers mount + logout cache-clear

The hand-rolled runtime-caching service worker, its registration component, mounting the SW + indicator in the client providers, and clearing caches/queue on logout.

**Files:**
- Create: `public/sw.js`
- Create: `components/offline/service-worker-registration.tsx`
- Modify: `components/providers.tsx`
- Modify: `app/(app)/settings/account-section.tsx`

**Interfaces:**
- Consumes: `<OfflineIndicator />` (`@/components/offline/offline-indicator`); `clear()` (`@/lib/offline/queue`).
- Produces: `<ServiceWorkerRegistration />` (`@/components/offline/service-worker-registration`); `public/sw.js` served at `/sw.js`; a `CLEAR_CACHES` postMessage contract handled by the SW.

- [ ] **Step 1: Create the service worker**

Create `public/sw.js`:

```js
/* Cookless service worker — runtime caching only (Plan 8f). */
const VERSION = "v1";
const STATIC_CACHE = `cookless-static-${VERSION}`;
const PAGES_CACHE = `cookless-pages-${VERSION}`;
const OFFLINE_ROUTES = ["/shopping", "/plan", "/recipes"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

function isStaticAsset(url, request) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    ["style", "script", "image", "font"].includes(request.destination)
  );
}

function isCacheableNav(url, request) {
  const isRsc = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  const isNav = request.mode === "navigate" || isRsc;
  if (!isNav) return false;
  return OFFLINE_ROUTES.some((r) => url.pathname === r || url.pathname.startsWith(r + "/"));
}

function pageCacheKey(url) {
  const u = new URL(url);
  u.searchParams.delete("_rsc");
  return u.toString();
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  const key = pageCacheKey(url);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url, request)) {
    event.respondWith(cacheFirst(request));
  } else if (isCacheableNav(url, request)) {
    event.respondWith(networkFirst(request, url));
  }
});
```

- [ ] **Step 2: Create the registration component**

Create `components/offline/service-worker-registration.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function register() {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Registration failures are non-fatal; the app works online without the SW.
      });
    }

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
```

- [ ] **Step 3: Mount both in `providers.tsx`**

In `components/providers.tsx`, add imports:

```tsx
import { ServiceWorkerRegistration } from "@/components/offline/service-worker-registration";
import { OfflineIndicator } from "@/components/offline/offline-indicator";
```

Then render them inside the `TooltipProvider`, alongside `children`. The updated return:

```tsx
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ThemeProvider>
        <TooltipProvider>
          <ServiceWorkerRegistration />
          <OfflineIndicator />
          {children}
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </I18nProvider>
  );
```

- [ ] **Step 4: Clear caches + queue on logout**

In `app/(app)/settings/account-section.tsx`, add the import:

```tsx
import { clear as clearOfflineQueue } from "@/lib/offline/queue";
```

Then in `handleLogout`, after the confirm guard and **before** `await logoutAction();`, clear local offline state:

```tsx
    if (!confirmed) return;

    // Clear offline caches + pending queue so the next account on this device
    // can't see this session's cached pages or replay its queued toggles.
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
    }
    await clearOfflineQueue();

    await logoutAction();
    router.push("/login");
```

- [ ] **Step 5: Verify tests, typecheck, and build**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all pass. `public/sw.js` is a static asset (not compiled) and does not affect typecheck.

- [ ] **Step 6: Manual verification (production build)**

The service worker and offline flow are verified manually (no automated SW harness, consistent with the old app). Run a production build and exercise offline:

```bash
npm run build && npm run start
```

Then in the browser (DevTools → Application → Service Workers):
1. Load `/shopping` while online (registers the SW, caches the page).
2. DevTools → Network → set **Offline**.
3. Toggle a shopping item → it strikes through (optimistic) and the offline banner appears; no error toast.
4. Reload `/shopping` while offline → the page still renders (served from `PAGES_CACHE`).
5. Set Network back to **Online** → the banner switches to "Syncing…" briefly, the queued toggle replays (verify the item stays checked after the auto-refresh), and the banner clears.
6. Log out → confirm caches are cleared (Application → Cache Storage is emptied).

- [ ] **Step 7: Commit**

```bash
git add public/sw.js components/offline/service-worker-registration.tsx \
  components/providers.tsx "app/(app)/settings/account-section.tsx"
git commit -m "feat(web): runtime-caching service worker + offline mount + logout clear (Plan 8f Task 6)"
```

---

### Task 7: Update migration memory

Mark Plan 8f complete and note the migration's remaining work (on-host Docker cutover).

**Files:**
- Modify: `/Users/skrug/.claude/projects/-Users-skrug-PycharmProjects-cookless/memory/nextjs-migration.md`
- Modify: `/Users/skrug/.claude/projects/-Users-skrug-PycharmProjects-cookless/memory/MEMORY.md` (index line)

- [ ] **Step 1: Update the memory files**

In `nextjs-migration.md` and its `MEMORY.md` index line, add Plan 8f (offline PWA) to the completed list. Since 8f is the final Section B parity plan, update the "remaining" note to reflect that only the on-host Docker cutover remains (Section B parity is complete).

- [ ] **Step 2: Commit**

Memory files live outside the repo (`~/.claude/...`) and are not part of the project git tree — no commit is needed. If they happen to be tracked in a separate memory repo, commit there per that repo's convention. Otherwise this step is a plain file save.

---

## Self-Review

**Spec coverage (against the design spec's sections):**
- Toggle Route Handler (unit 1) → Task 1 ✓
- Queue module (unit 2) → Task 2 ✓
- Sync engine + hook (unit 3) → `drainQueue` Task 3, `useOnlineSync` Task 5 ✓
- Service worker (unit 4) → Task 6 ✓
- Wiring/mount points (providers, logout clear) → Task 6 ✓
- Toggle client change (submit helpers, component rewire, action removal) → Task 4 ✓
- Offline indicator + i18n keys → Task 5 ✓
- Data flow (offline → reconnect replay → refresh) → Tasks 3/4/5 + manual verify Task 6 Step 6 ✓
- Testing (queue/sync/submit + schema; SW/hook manual) → Tasks 1–4 automated, Task 6 manual ✓
- New devDep `fake-indexeddb`, no runtime deps → Task 2 ✓
- Risk mitigations: `_rsc` cache-key normalization (`pageCacheKey`, Task 6), cross-account leakage (`CLEAR_CACHES` + `clear()`, Task 6), SW staleness (versioned caches + `updateViaCache: "none"`, Task 6) ✓

**Deviation from spec (justified):** the spec listed `route.test.ts`; the codebase has **no** route-handler test harness (route handlers call `requireHousehold()`, which reads cookies + global `db`). Rather than invent a session mock, the route's only novel logic (body parsing) is covered by `shoppingSyncSchema` tests (Task 1), and the mutation logic is already covered by `lib/shopping/items.test.ts`. This matches every other route handler in the app.

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step contains complete code.

**Type consistency:** `QueuedOp`/`enqueue`/`all`/`remove`/`count`/`clear` (Task 2) are used with matching signatures in Tasks 3–6. `shoppingSyncSchema` body shape (`{ kind, itemId }` / `{ kind, itemIds }`, Task 1) matches what `drainQueue` sends (Task 3) and what `submit*` sends (Task 4). `submitToggle` returns `{ result, checked? }` and `submitUncheckAll` returns `SubmitResult` — consumed accordingly in the components (Task 4). `useOnlineSync(): { online, syncing }` (Task 5) matches its consumption in `OfflineIndicator` (Task 5) and mount in providers (Task 6).

**Ordering:** Task 2 (queue) precedes its consumers (3/4/5/6). Task 1 (route contract) precedes 3/4. `providers.tsx` is modified only in Task 6 (indicator + SW registration created in Tasks 5/6 first). No forward references.
