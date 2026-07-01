# Plan 8a — Household & Account Management UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing (but UI-less) household/account server layer into the Next.js app — household management, member/invite flows, logged-in invite-accept, password & passkey management, Gemini-key verification, and a `/welcome` page — and fix two behavioral regressions in the household lib.

**Architecture:** New `/settings/household` page composed of focused client components calling the already-built server actions; expanded `/settings` page with an Account section; owner-gated `/settings/ai` with key verification; new `/welcome` post-onboarding landing; logged-in join path on `/invite/[code]`. Two new lib functions (`joinHousehold`, `verifyGeminiKey`) and two behavioral fixes (`reassignActiveHousehold`, `transferOwnership` self-guard) are TDD'd first.

**Tech Stack:** Next.js 15 (App Router, RSC + server actions), React 19, TypeScript, Drizzle + better-sqlite3 (synchronous), Vitest, Tailwind, existing `web/components/ui/*` primitives, i18n via `web/lib/i18n`.

## Global Constraints

- All work is under `web/`. Run commands from `web/` (`cd web`).
- Tests: Vitest (`npm test`). Lint: `npm run lint`. Types: `npx tsc --noEmit`.
- DB is **synchronous** (better-sqlite3). Use `db.transaction(() => { ... })` for atomic multi-write ops; do **not** `await` inside it.
- Server actions live in `web/app/(account)/actions.ts` and use the existing `run<T>()` wrapper (returns `{ ok: true, data } | { ok: false, status, message }`). Parse input with Zod schemas from `web/lib/schemas/auth.ts`.
- Throw `AuthError(status, message)` from lib code for user-facing failures; `run()` maps it.
- i18n: use `useT()` (client) / `getI18n()` (server). Namespaces `household`, `password`, `passkeys`, `aiSettings`, `welcome`, `settings`, `nav`, `common`, `success`, `errors` already exist — **reuse existing keys**; only add keys explicitly listed in a task, to **both** `web/lib/i18n/locales/en.json` and `de.json`.
- Follow existing component idioms: `"use client"`, `useT`, `toast` from `@/components/ui/sonner`, `router.refresh()` after a mutating action, `Button`/`Input`/`Form` from `@/components/ui/*`, lucide-react icons.
- **Already exists — do NOT rebuild:** all 9 household actions + `createHouseholdInviteAction` in `(account)/actions.ts`; `listPasskeysAction`/`deletePasskeyAction` there; `setPasswordAction`/`removePasswordAction`/`skipPasskeyAction` in `(auth)/actions.ts`; add-passkey via `addPasskey()` client helper (`@/lib/auth-client/webauthn`) hitting `/api/auth/webauthn/add/{begin,complete}`; `setPasswordSchema`/`removePasswordSchema` in schemas; `serializeUser` exposes `hasPassword`/`hasPasskey`.
- **Parity references (old app, read these to port):** `frontend/src/pages/HouseholdPage.tsx`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/household/AISettings.tsx`, `frontend/src/pages/WelcomePage.tsx`.

---

## Task 1: `joinHousehold` lib function (logged-in invite accept)

**Files:**
- Modify: `web/lib/households/membership.ts`
- Test: `web/lib/households/membership.test.ts`

**Interfaces:**
- Consumes: `validateInvite(db, code, now)`, `consumeInvite(db, inviteId, userId)` from `@/lib/households/invites`; `isHouseholdMember(db, userId, householdId)` from `@/lib/auth/scoping`.
- Produces: `joinHousehold(db: Db, userId: string, code: string, now: Date): { id: string; name: string }`.

- [ ] **Step 1: Write the failing test**

Add to `web/lib/households/membership.test.ts` (follow the file's existing setup helpers for `db`, users, invites — mirror `invites.test.ts` if needed):

```ts
import { joinHousehold } from "./membership";
import { createInvite } from "./invites";

test("joinHousehold adds membership, consumes invite, sets active when none", () => {
  // owner + household + a second user `u2` with no active household
  const inv = createInvite(db, { householdId: hId, createdById: ownerId }, now);
  const res = joinHousehold(db, u2Id, inv.code, now);
  expect(res).toEqual({ id: hId, name: "Home" });
  expect(isHouseholdMember(db, u2Id, hId)).toBe(true);
  // invite consumed
  expect(() => joinHousehold(db, u3Id, inv.code, now)).toThrow(/already been used/i);
  // active household set because u2 had none
  const u2 = db.select().from(users).where(eq(users.id, u2Id)).get();
  expect(u2!.activeHouseholdId).toBe(hId);
});

test("joinHousehold rejects an existing member", () => {
  const inv = createInvite(db, { householdId: hId, createdById: ownerId }, now);
  expect(() => joinHousehold(db, ownerId, inv.code, now)).toThrow(/already a member/i);
});

test("joinHousehold does not change active household when one is already set", () => {
  const inv = createInvite(db, { householdId: hId, createdById: ownerId }, now);
  // u2 already has an active household `otherId`
  joinHousehold(db, u2Id, inv.code, now);
  const u2 = db.select().from(users).where(eq(users.id, u2Id)).get();
  expect(u2!.activeHouseholdId).toBe(otherId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- membership`
Expected: FAIL — `joinHousehold` is not exported.

- [ ] **Step 3: Implement `joinHousehold`**

Add to `web/lib/households/membership.ts` (import `validateInvite`, `consumeInvite` from `./invites`; `isHouseholdMember` from `@/lib/auth/scoping`; `households` is already imported):

```ts
export function joinHousehold(
  db: Db,
  userId: string,
  code: string,
  now: Date,
): { id: string; name: string } {
  const invite = validateInvite(db, code, now);
  if (isHouseholdMember(db, userId, invite.householdId)) {
    throw new AuthError(400, "You are already a member of this household.");
  }
  const h = db.select().from(households).where(eq(households.id, invite.householdId)).get();
  if (!h) throw new AuthError(400, "Invalid invite code.");

  db.transaction(() => {
    db.insert(householdMembers)
      .values({ householdId: invite.householdId, userId, role: "MEMBER", joinedAt: now })
      .run();
    consumeInvite(db, invite.id, userId);
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    if (u && !u.activeHouseholdId) {
      db.update(users).set({ activeHouseholdId: invite.householdId }).where(eq(users.id, userId)).run();
    }
  });
  return { id: h.id, name: h.name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- membership`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/households/membership.ts web/lib/households/membership.test.ts
git commit -m "feat(web): joinHousehold lib for logged-in invite accept (Plan 8a Task 1)"
```

---

## Task 2: `verifyGeminiKey` lib function

**Files:**
- Create: `web/lib/ai/verify.ts`
- Modify: `web/lib/ai/config.ts` (add `modelsListUrl`)
- Test: `web/lib/ai/verify.test.ts`

**Interfaces:**
- Produces: `verifyGeminiKey(apiKey: string, fetchImpl?: typeof fetch): Promise<"valid" | "invalid" | "unreachable">`; `modelsListUrl(): string` in `config.ts`.

- [ ] **Step 1: Add `modelsListUrl` to `config.ts`**

In `web/lib/ai/config.ts`, after the existing URL helpers add:

```ts
export const modelsListUrl = (): string => BASE; // GET BASE lists models; 200 ⇒ key valid
```

- [ ] **Step 2: Write the failing test**

Create `web/lib/ai/verify.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { verifyGeminiKey } from "./verify";

function fakeFetch(status: number | "throw"): typeof fetch {
  return (async () => {
    if (status === "throw") throw new Error("network");
    return new Response(null, { status });
  }) as unknown as typeof fetch;
}

describe("verifyGeminiKey", () => {
  test("200 → valid", async () => {
    expect(await verifyGeminiKey("k", fakeFetch(200))).toBe("valid");
  });
  test("400/401/403 → invalid", async () => {
    expect(await verifyGeminiKey("k", fakeFetch(400))).toBe("invalid");
    expect(await verifyGeminiKey("k", fakeFetch(401))).toBe("invalid");
    expect(await verifyGeminiKey("k", fakeFetch(403))).toBe("invalid");
  });
  test("network error or 500 → unreachable", async () => {
    expect(await verifyGeminiKey("k", fakeFetch("throw"))).toBe("unreachable");
    expect(await verifyGeminiKey("k", fakeFetch(500))).toBe("unreachable");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm test -- ai/verify`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `verifyGeminiKey`**

Create `web/lib/ai/verify.ts`:

```ts
import { modelsListUrl } from "./config";

export async function verifyGeminiKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"valid" | "invalid" | "unreachable"> {
  try {
    const res = await fetchImpl(modelsListUrl(), {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
    });
    if (res.status === 200) return "valid";
    if (res.status === 400 || res.status === 401 || res.status === 403) return "invalid";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm test -- ai/verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/ai/verify.ts web/lib/ai/verify.test.ts web/lib/ai/config.ts
git commit -m "feat(web): verifyGeminiKey lib (Plan 8a Task 2)"
```

---

## Task 3: Behavioral fix — reassign active household on leave/remove/delete

**Files:**
- Modify: `web/lib/households/membership.ts`
- Test: `web/lib/households/membership.test.ts`

**Interfaces:**
- Produces: `reassignActiveHousehold(db: Db, userId: string, leavingHouseholdId: string): void` (replaces `clearActiveHouseholdIfPointingHere`).

- [ ] **Step 1: Write the failing tests**

Add to `web/lib/households/membership.test.ts`:

```ts
test("leaving reassigns active household to the next membership", () => {
  // user is MEMBER of hA (active) and hB (joined earlier). Owner of hA can remain.
  leaveHousehold(db, userId, hAId);
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  expect(u!.activeHouseholdId).toBe(hBId); // reassigned, not nulled
});

test("leaving your only household nulls active household", () => {
  leaveHousehold(db, soloId, soloHouseholdId);
  const u = db.select().from(users).where(eq(users.id, soloId)).get();
  expect(u!.activeHouseholdId).toBeNull();
});

test("removeMember reassigns the removed member's active household", () => {
  // member belongs to hA (active) and hB; owner removes them from hA
  removeMember(db, ownerId, hAId, memberRowId);
  const m = db.select().from(users).where(eq(users.id, memberUserId)).get();
  expect(m!.activeHouseholdId).toBe(hBId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- membership`
Expected: FAIL — active household is nulled instead of reassigned.

- [ ] **Step 3: Replace the helper**

In `web/lib/households/membership.ts`, replace `clearActiveHouseholdIfPointingHere` with:

```ts
function reassignActiveHousehold(db: Db, userId: string, leavingHouseholdId: string): void {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (u?.activeHouseholdId !== leavingHouseholdId) return;
  const next = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .orderBy(householdMembers.joinedAt)
    .all()
    .find((m) => m.householdId !== leavingHouseholdId);
  db.update(users)
    .set({ activeHouseholdId: next?.householdId ?? null })
    .where(eq(users.id, userId))
    .run();
}
```

Update the three callers to run reassignment **after** the membership/household row is deleted (so the leaving membership is excluded):
- `leaveHousehold`: replace `clearActiveHouseholdIfPointingHere(db, userId, householdId)` → `reassignActiveHousehold(db, userId, householdId)`.
- `removeMember`: replace `clearActiveHouseholdIfPointingHere(db, member.userId, householdId)` → `reassignActiveHousehold(db, member.userId, householdId)`.
- `deleteHousehold`: replace `clearActiveHouseholdIfPointingHere(db, userId, householdId)` → `reassignActiveHousehold(db, userId, householdId)`.

> Note: `members` query in `leaveHousehold` already runs before deletion; reassignment runs after `db.delete(...)`, so the just-deleted row is gone from the `householdMembers` lookup.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- membership`
Expected: PASS (and pre-existing membership tests still pass).

- [ ] **Step 5: Commit**

```bash
git add web/lib/households/membership.ts web/lib/households/membership.test.ts
git commit -m "fix(web): reassign active household on leave/remove/delete (Plan 8a Task 3)"
```

---

## Task 4: Behavioral fix — `transferOwnership` self-guard + atomicity

**Files:**
- Modify: `web/lib/households/membership.ts`
- Test: `web/lib/households/membership.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `web/lib/households/membership.test.ts`:

```ts
test("transferOwnership rejects transferring to yourself", () => {
  const ownMembership = db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, hId), eq(householdMembers.userId, ownerId)))
    .get()!;
  expect(() => transferOwnership(db, ownerId, hId, ownMembership.id)).toThrow(/already own/i);
});

test("transferOwnership swaps roles atomically", () => {
  transferOwnership(db, ownerId, hId, memberRowId); // memberRowId belongs to another user
  const roles = listMembers(db, hId).reduce<Record<string, string>>((acc, m) => {
    acc[m.userId] = m.role;
    return acc;
  }, {});
  expect(roles[memberUserId]).toBe("OWNER");
  expect(roles[ownerId]).toBe("MEMBER");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- membership`
Expected: FAIL — no self-guard (the self-target test throws nothing or mis-sets roles).

- [ ] **Step 3: Add the guard and transaction**

In `web/lib/households/membership.ts`, update `transferOwnership`:

```ts
export function transferOwnership(
  db: Db,
  actorId: string,
  householdId: string,
  memberId: number,
): void {
  requireOwner(db, actorId, householdId);
  const target = memberById(db, householdId, memberId);
  if (target.userId === actorId) {
    throw new AuthError(400, "You already own this household.");
  }
  db.transaction(() => {
    db.update(householdMembers).set({ role: "OWNER" }).where(eq(householdMembers.id, target.id)).run();
    db.update(householdMembers)
      .set({ role: "MEMBER" })
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, actorId)))
      .run();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- membership`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/households/membership.ts web/lib/households/membership.test.ts
git commit -m "fix(web): transferOwnership self-guard + atomic swap (Plan 8a Task 4)"
```

---

## Task 5: New server actions + schema (`joinHouseholdAction`, `verifyGeminiKeyAction`)

**Files:**
- Modify: `web/app/(account)/actions.ts`
- Modify: `web/lib/schemas/auth.ts`
- Test: none (thin wrappers over tested lib; covered by integration through UI). Verify with `tsc`.

**Interfaces:**
- Consumes: `joinHousehold` (Task 1), `verifyGeminiKey` (Task 2).
- Produces: `joinHouseholdAction(input: unknown): Promise<Result<{ id: string; name: string }>>`; `verifyGeminiKeyAction(apiKey: string): Promise<Result<"valid" | "invalid" | "unreachable">>`; `joinHouseholdSchema`.

- [ ] **Step 1: Add the schema**

In `web/lib/schemas/auth.ts` add:

```ts
export const joinHouseholdSchema = z.object({ code: z.string().min(1) });
```

- [ ] **Step 2: Add the actions**

In `web/app/(account)/actions.ts`: add imports `joinHousehold` from `@/lib/households/membership`, `verifyGeminiKey` from `@/lib/ai/verify`, `joinHouseholdSchema` from `@/lib/schemas/auth`. Then:

```ts
export const joinHouseholdAction = async (input: unknown) =>
  run((uid) => joinHousehold(db, uid, joinHouseholdSchema.parse(input).code, new Date()));

export const verifyGeminiKeyAction = async (apiKey: string) =>
  run(() => verifyGeminiKey(apiKey));
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "web/app/(account)/actions.ts" web/lib/schemas/auth.ts
git commit -m "feat(web): joinHousehold + verifyGeminiKey actions (Plan 8a Task 5)"
```

---

## Task 6: `confirm-dialog` UI primitive

**Files:**
- Create: `web/components/ui/confirm-dialog.tsx`
- Test: `web/components/ui/confirm-dialog.test.tsx`

**Interfaces:**
- Produces: `useConfirm()` hook returning `{ confirm, dialog }`, where `confirm(opts) => Promise<string | boolean>` and `dialog` is a JSX element to render. `opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; input?: { placeholder: string; type?: string; expected?: string } }`. Resolves `false` on cancel; on confirm resolves the input string (if `input` given) or `true`. When `input.expected` is set, the confirm button is disabled until the typed value matches.

- [ ] **Step 1: Write the failing test**

Create `web/components/ui/confirm-dialog.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useConfirm } from "./confirm-dialog";

function Harness({ onResult }: { onResult: (v: string | boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button onClick={async () => onResult(await confirm({ title: "T", message: "M", confirmLabel: "Yes" }))}>
        open
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  test("resolves true on confirm", async () => {
    let result: string | boolean = "unset";
    render(<Harness onResult={(v) => (result = v)} />);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(await screen.findByText("Yes"));
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- confirm-dialog`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `confirm-dialog.tsx`**

Create `web/components/ui/confirm-dialog.tsx` using the existing `Dialog` primitives (`@/components/ui/dialog`), `Button`, `Input`. Implement `useConfirm()`:
- Holds `opts` + an internal `resolve` ref in `useState`/`useRef`.
- `confirm(opts)` sets state and returns a `new Promise` whose `resolve` is stored.
- `dialog` renders a `<Dialog open={!!opts} onOpenChange={(o) => !o && settle(false)}>` with `DialogContent` containing title, message, optional `<Input>` (controlled local state), a cancel button (`settle(false)`) and a confirm button (`destructive` → `variant="destructive"`); confirm `settle(input ? value : true)`; disabled when `input.expected` is set and `value !== input.expected`.
- `settle(v)` resolves the stored promise, clears `opts` and input value.

Reference the old `frontend/src/components/ui/ConfirmDialog.tsx` + `hooks/useConfirm.ts` for behavior (including the `inputField` option).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- confirm-dialog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/ui/confirm-dialog.tsx web/components/ui/confirm-dialog.test.tsx
git commit -m "feat(web): confirm-dialog primitive with useConfirm (Plan 8a Task 6)"
```

---

## Task 7: `/settings/household` page + components

**Files:**
- Create: `web/app/(app)/settings/household/page.tsx`
- Create: `web/app/(app)/settings/household/household-client.tsx`
- Create: `web/app/(app)/settings/household/household-info.tsx`
- Create: `web/app/(app)/settings/household/members-list.tsx`
- Create: `web/app/(app)/settings/household/invite-section.tsx`
- Create: `web/app/(app)/settings/household/manage-households.tsx` (create + join + switch)
- Create: `web/app/(app)/settings/household/danger-zone.tsx`

**Interfaces:**
- Consumes: `listHouseholdsAction`, `listMembersAction`, `updateHouseholdAction`, `switchHouseholdAction`, `createHouseholdAction`, `joinHouseholdAction`, `createHouseholdInviteAction`, `removeMemberAction`, `transferOwnershipAction`, `leaveHouseholdAction`, `deleteHouseholdAction` (all from `@/app/(account)/actions`); `useConfirm` (Task 6); `HouseholdDto` (`@/lib/households/serialize`: `{ id, name, aiEnabled, geminiApiKeySet, role, memberCount }`), `MemberDto` (`@/lib/households/membership`: `{ id, userId, email, role, joinedAt }`).
- Produces: the `/settings/household` route.

This is a **port** of `frontend/src/pages/HouseholdPage.tsx` to new-app idioms. Transformation rules:
- React-Query hooks (`useHouseholds`, `useSwitchHousehold`, …) → call the corresponding **server action**, then `router.refresh()`; show `toast.error(t("errors.…"))` / `toast.success(t("success.…"))` using the existing keys.
- `useAuth().user` / `refreshUser()` → the active household + current email come from the **server component** (`page.tsx`) as props; after mutations, `router.refresh()` re-renders it.
- `ResponsiveOverlay` → use `Dialog` from `@/components/ui/dialog` for the switch list; `ConfirmDialog`/`useConfirm` → Task 6's `useConfirm`.
- Ownership: a household is owned when its `HouseholdDto.role === "OWNER"`. The current user's email comes from `page.tsx`.

- [ ] **Step 1: Server page**

Create `web/app/(app)/settings/household/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listHouseholds } from "@/lib/households/manage";
import { listMembers } from "@/lib/households/membership";
import { HouseholdClient } from "./household-client";

export default async function HouseholdPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const households = listHouseholds(db, user.id);
  const activeId = user.activeHouseholdId ?? null;
  const active = households.find((h) => h.id === activeId) ?? null;
  const members = active ? listMembers(db, active.id) : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("household.title")}</h1>
      <HouseholdClient
        households={households}
        activeId={activeId}
        members={members}
        currentEmail={user.email}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build the client components**

Create the components per the transformation rules above:
- `household-info.tsx` — active household name + `t("household.members")` count; inline rename form (owner only) → `updateHouseholdAction(id, { name })`. Keys: `household.currentHousehold`, `household.editName`.
- `members-list.tsx` — member rows (email, role badge via `household.owner`/`household.member`); owner-only, non-self actions: transfer (confirm `household.transferOwnershipConfirm`) → `transferOwnershipAction`; remove (confirm `household.removeMemberConfirm`) → `removeMemberAction`. Success/error: `success.ownershipTransferred`/`errors.ownershipTransfer`, `errors.memberRemove`.
- `invite-section.tsx` — owner-only; generate → `createHouseholdInviteAction(id)`, show `code`, copy button (`navigator.clipboard.writeText`), expiry via `household.inviteExpiry` with `{ date }`. Keys: `household.generateInvite`, `household.copyCode`/`household.codeCopied`, `errors.inviteCreate`.
- `manage-households.tsx` — create (`createHouseholdAction`, `errors.householdCreate`), join-by-code (`joinHouseholdAction`, `success.householdJoined`/`errors.householdJoin`), and switch (only when `households.length > 1`) via a `Dialog` list → `switchHouseholdAction` (`errors.householdSwitch`). Keys: `household.createHousehold`, `household.householdName`, `household.joinHousehold`, `household.inviteCodePlaceholder`, `household.switchHousehold`.
- `danger-zone.tsx` — leave (non-owner) → `leaveHouseholdAction` (confirm `household.leaveConfirm`, `success.householdLeft`/`errors.householdLeave`); delete (owner) → name-confirmation via `useConfirm` `input.expected = household.name` → `deleteHouseholdAction` (`household.deleteConfirm` with `{ name }`, `household.deleteConfirmPlaceholder`, `success.householdDeleted`/`errors.householdDelete`).
- `household-client.tsx` — composes the above, passes `router.refresh()` down, renders `useConfirm().dialog` once.

- [ ] **Step 3: Add any missing i18n keys**

Verify all keys referenced above exist in `en.json`/`de.json` (most do — see Global Constraints). Add only those missing. Likely net-new (add to both files): none expected for this task; if `household.copyCode`/`household.codeCopied` are absent, reuse existing `household.copyLink`/`household.copied`/`household.codeCopied` (check first).

- [ ] **Step 4: Verify build + lint + types**

Run: `cd web && npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "web/app/(app)/settings/household"
git commit -m "feat(web): /settings/household management UI (Plan 8a Task 7)"
```

---

## Task 8: Expand `/settings` with Account section + household link

**Files:**
- Modify: `web/app/(app)/settings/page.tsx`
- Modify: `web/app/(app)/settings/settings-client.tsx`
- Create: `web/app/(app)/settings/account-section.tsx`
- Create: `web/app/(app)/settings/password-form.tsx`
- Create: `web/app/(app)/settings/passkey-section.tsx`

**Interfaces:**
- Consumes: `setPasswordAction`/`removePasswordAction` (`@/app/(auth)/actions`); `listPasskeysAction`/`deletePasskeyAction` (`@/app/(account)/actions`); `addPasskey` (`@/lib/auth-client/webauthn`); `logoutAction` (`@/app/(auth)/actions`); `useConfirm` (Task 6); `PasskeyDto` (`@/lib/auth/passkey-management`: `{ id, deviceName, createdAt }`).
- The server `page.tsx` passes `email`, `hasPassword`, `hasPasskey` (from `requireUser()` + `serializeUser`) into `SettingsClient`.

- [ ] **Step 1: Pass account flags from the server page**

Modify `web/app/(app)/settings/page.tsx` to also compute `serializeUser(db, user)` and pass `email`, `hasPassword`, `hasPasskey` to `<SettingsClient>`. (Import `serializeUser` from `@/lib/auth/serialize`, `db` from `@/lib/db`.)

- [ ] **Step 2: Add a household link card + Account section to `settings-client.tsx`**

In `web/app/(app)/settings/settings-client.tsx` add, alongside the existing tags/AI link sections:
- A link card to `/settings/household` (key `nav.manageHousehold`).
- An `<AccountSection email={...} hasPassword={...} hasPasskey={...} />` (new component), rendered last.

Update `SettingsClient`'s props to accept `email`, `hasPassword`, `hasPasskey`.

- [ ] **Step 3: Build `password-form.tsx`**

Port the password form from `frontend/src/pages/SettingsPage.tsx` (the `handlePasswordSubmit` / `handleRemovePassword` parts). Rules:
- Use `react-hook-form` + `zodResolver` like the old form; current-password field shown only when `hasPassword`.
- Submit → `setPasswordAction({ currentPassword?, newPassword })`; on `res.ok` toast `password.passwordChanged`/`password.passwordSet`, reset. On `!res.ok` set root error to `res.message`.
- Remove (only when `hasPassword`, disabled unless `hasPasskey` with title `passkeys.cannotDeleteLast`) → `useConfirm` with `input` (current password) → `removePasswordAction({ currentPassword })`, toast `password.passwordRemoved`.
- After a successful set/remove the action re-issues the session; call `router.refresh()`.

- [ ] **Step 4: Build `passkey-section.tsx`**

- On mount, `listPasskeysAction()` → render device names + created date; "Add passkey" button → `await addPasskey()` then refresh the list (`passkeys.addPasskey`); delete (confirm `passkeys.confirmDelete`, disabled on last credential when `!hasPassword` with title `passkeys.cannotDeleteLast`) → `deletePasskeyAction(id)` (`errors.passkeyDelete`/`errors.passkeyAdd`).
- Reference `frontend/src/pages/settings/PasskeySection.tsx`.

- [ ] **Step 5: Build `account-section.tsx`**

Compose email display, `<PasswordForm>`, `<PasskeySection>`, and a logout button (`logoutAction()` then `router.push("/login")`), under the `settings.account` heading. Render `useConfirm().dialog` for the forms that need it (or let each sub-component own its own `useConfirm`).

- [ ] **Step 6: Add missing i18n keys**

Add to `en.json` + `de.json` only if absent: `passkeys.empty` ("No passkeys yet." / "Noch keine Passkeys."), `passkeys.created` ("Added {date}" / "Hinzugefügt {date}"). Reuse all other existing `password.*`/`passkeys.*`/`settings.*` keys.

- [ ] **Step 7: Verify + commit**

```bash
cd web && npm run lint && npx tsc --noEmit
git add "web/app/(app)/settings/page.tsx" "web/app/(app)/settings/settings-client.tsx" "web/app/(app)/settings/account-section.tsx" "web/app/(app)/settings/password-form.tsx" "web/app/(app)/settings/passkey-section.tsx" web/lib/i18n/locales
git commit -m "feat(web): account section (password + passkeys + logout) in settings (Plan 8a Task 8)"
```

---

## Task 9: Owner-gate `/settings/ai` + Gemini key verification

**Files:**
- Modify: `web/app/(app)/settings/ai/page.tsx`
- Modify: `web/app/(app)/settings/ai/ai-settings-form.tsx`

**Interfaces:**
- Consumes: `verifyGeminiKeyAction` (Task 5), existing `updateAiSettingsAction`. The page must pass `isOwner` to the form.

- [ ] **Step 1: Pass `isOwner` from the page**

In `web/app/(app)/settings/ai/page.tsx`, compute the user's role for the active household and pass `isOwner` to `<AiSettingsForm>`. Use `serializeHousehold(db, householdId, user.id).role === "OWNER"` (import `serializeHousehold` from `@/lib/households/serialize`; get the user via `requireUser()` in addition to `requireHousehold()` — or read `requireHousehold()` which returns `{ user, householdId }`).

- [ ] **Step 2: Owner-gate + verify button in the form**

In `web/app/(app)/settings/ai/ai-settings-form.tsx`:
- Accept `isOwner: boolean`. Disable the enable checkbox, key input, and save button when `!isOwner` (mirror old `AISettings` disabled styling).
- Add a "Verify" button next to the key input that calls `verifyGeminiKeyAction(key.trim())` and sets local status `"idle" | "valid" | "invalid" | "unreachable"`; render the result with the existing pattern (check/x icon + label). Disable when no key entered, verifying, or `!isOwner`.

- [ ] **Step 3: Add i18n keys**

Add to `en.json` + `de.json` under `aiSettings`: `verify` ("Verify"/"Prüfen"), `keyValid` ("Key is valid"/"Schlüssel gültig"), `keyInvalid` ("Invalid key"/"Schlüssel ungültig"), `keyUnreachable` ("Couldn't verify"/"Nicht prüfbar").

- [ ] **Step 4: Verify + commit**

```bash
cd web && npm run lint && npx tsc --noEmit
git add "web/app/(app)/settings/ai" web/lib/i18n/locales
git commit -m "feat(web): owner-gate AI settings + Gemini key verify (Plan 8a Task 9)"
```

---

## Task 10: `/welcome` page + onboarding completion routing

**Files:**
- Create: `web/app/(app)/welcome/page.tsx`
- Modify: the onboarding completion path (`web/app/onboarding/steps.tsx` — the CREATE_HOUSEHOLD success handler, and/or `web/app/onboarding/page.tsx`).

**Interfaces:**
- Produces: `/welcome` route, guarded by `requireUser()` (must be onboarded).

- [ ] **Step 1: Build the page**

Port `frontend/src/pages/WelcomePage.tsx` to a server component at `web/app/(app)/welcome/page.tsx`: title/subtitle (`welcome.title`/`welcome.subtitle`), three `next/link` cards — add recipe → `/recipes` (`welcome.addRecipe`/`welcome.addRecipeDescription`), create plan → `/plan` (`welcome.createPlan`/…), invite member → `/settings/household` (`welcome.inviteMember`/…) — and a "Get started" link → `/recipes` (`welcome.getStarted`). Use `getI18n()` for `t`. Icons: `BookOpen`, `CalendarDays`, `UserPlus` from lucide-react.

- [ ] **Step 2: Route onboarding completion to `/welcome`**

In `web/app/onboarding/steps.tsx`, find where the CREATE_HOUSEHOLD step completes (after `createHouseholdAction` succeeds and onboarding becomes COMPLETED) and route to `/welcome` instead of `/` (e.g. `router.push("/welcome")`). Confirm `web/app/onboarding/page.tsx` still redirects already-COMPLETED users to `/` (leave that as-is so `/welcome` is shown once, on completion, not on every visit).

- [ ] **Step 3: Verify + commit**

```bash
cd web && npm run lint && npx tsc --noEmit
git add "web/app/(app)/welcome" web/app/onboarding
git commit -m "feat(web): /welcome post-onboarding page (Plan 8a Task 10)"
```

---

## Task 11: Logged-in join path on `/invite/[code]`

**Files:**
- Modify: `web/app/(auth)/invite/[code]/page.tsx`
- Create: `web/app/(auth)/invite/[code]/join-button.tsx`

**Interfaces:**
- Consumes: `getSession` (`@/lib/auth/session`), `joinHouseholdAction` (Task 5), `getInviteSummary` (existing).

- [ ] **Step 1: Branch on session in the page**

In `web/app/(auth)/invite/[code]/page.tsx`, after computing `summary`, call `const user = await getSession();`. If `user` is non-null, render a `<JoinButton code={code} householdName={summary.householdName} />` (with a short "you're signed in as {email}, join {household}?" prompt) instead of `<InviteForm>`. Keep the existing `<InviteForm>` for anonymous users.

- [ ] **Step 2: Build the join button**

Create `web/app/(auth)/invite/[code]/join-button.tsx` (`"use client"`): a button that calls `joinHouseholdAction({ code })`; on `res.ok` toast `success.householdJoined` and `router.push("/welcome")` + `router.refresh()`; on `!res.ok` toast `res.message`. Use `useT`. Add i18n keys to both locales if absent: `invite.joinPrompt` ("Join {household}?"/"{household} beitreten?"), `invite.joinAs` ("Signed in as {email}"/"Angemeldet als {email}"), `invite.join` ("Join household"/"Haushalt beitreten").

- [ ] **Step 3: Verify + commit**

```bash
cd web && npm run lint && npx tsc --noEmit
git add "web/app/(auth)/invite/[code]" web/lib/i18n/locales
git commit -m "feat(web): logged-in invite-accept path (Plan 8a Task 11)"
```

---

## Task 12: Full verification pass

**Files:** none (verification only).

- [x] **Step 1: Run the full web test suite**

Run: `cd web && npm test`
Result: 345/345 tests passing across 67 files. ✓

- [x] **Step 2: Lint + types**

Run: `cd web && npm run lint && npx tsc --noEmit`
Result: `tsc --noEmit` clean. Note: the `web/` app has no `lint` script / ESLint config (that lived in the old `frontend/`), so the lint sub-step is N/A here. Production `next build` also runs clean with every 8a route present. ✓

- [x] **Step 3: Manual smoke (dev server)**

Interactive browser smoke not run (visual companion disallowed). Covered non-interactively instead: `next build` compiles every route (`/settings`, `/settings/household`, `/settings/ai`, `/welcome`, `/invite/[code]`), and en/de locales are at full parity (506/506 keys, none missing either side). ✓

- [x] **Step 4: Update memory index**

`MEMORY.md` already lists Plan 8a as complete with remaining §B plans (8c/8d/8e/8f) noted — no change needed.

- [x] **Step 5: Commit (if memory/docs changed)**

```bash
git add -A && git commit -m "docs: mark Plan 8a complete (Plan 8a Task 12)"
```

---

## Self-Review

**Spec coverage:**
- M2 logged-in join → Tasks 1, 5, 7 (join section), 11. ✓
- M9 Gemini verify → Tasks 2, 5, 9. ✓
- Behavioral fixes (reassign active household; transferOwnership self-guard+atomic) → Tasks 3, 4. ✓
- Household UI (rename/members/remove/transfer/invite/create/switch/leave/delete) → Task 7. ✓
- M8 password set/change/remove → Task 8 (reuses existing actions). ✓
- M10 passkey management reachable → Task 8. ✓
- M11 /welcome → Task 10. ✓
- Owner-gating AI → Task 9. ✓
- Confirm dialog primitive → Task 6. ✓
- Reach via /settings link card (no new bottom-nav icon) → Task 8. ✓
- i18n en+de → folded into Tasks 7–11. ✓

**Placeholder scan:** UI Tasks 7/8 are framed as ports with explicit transformation rules + exact action names + exact i18n keys rather than full re-typed JSX — justified because the old-app components are the working reference implementation named in each step. All logic-bearing new code (lib fns, actions, confirm-dialog contract, verify wiring) has complete code.

**Type consistency:** `joinHousehold(db, userId, code, now) → {id,name}` (Task 1) matches `joinHouseholdAction` (Task 5) and `joinHouseholdSchema` `{ code }` (Task 5/7/11). `verifyGeminiKey → "valid"|"invalid"|"unreachable"` consistent across Tasks 2/5/9. `reassignActiveHousehold(db,userId,leavingHouseholdId)` replaces `clearActiveHouseholdIfPointingHere` in all three callers (Task 3). `HouseholdDto`/`MemberDto`/`PasskeyDto` shapes match their lib definitions.

**Out of scope (confirmed):** PATs/token section, new bottom-nav icon, offline (8f).
