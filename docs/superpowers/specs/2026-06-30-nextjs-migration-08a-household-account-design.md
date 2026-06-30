# Plan 8a — Household & Account Management UI — Design

**Date:** 2026-06-30
**Part of:** Next.js migration, Plan 8 Section B (parity follow-ons). See `docs/superpowers/specs/2026-06-27-nextjs-migration-design.md` and the Plan 8 cutover plan (`docs/superpowers/plans/2026-06-27-nextjs-migration-08-cutover.md`, §B roadmap, Plan 8a).

## Problem

The Next.js app ships with a complete, tested household/account **server + lib layer** but **no UI imports it**. Audit findings folded into this plan:

- **M1/M2** — no UI for the 9 household actions; no logged-in invite-accept path (existing users can't join a second household).
- **M8** — no password set/change/remove UI in settings.
- **M9** — no Gemini API key verification on save.
- **M10** — passkey management (`listPasskeys`/`addPasskey`/`deletePasskey`) is not reachable from any settings surface.
- **M11** — no `/welcome` post-onboarding page.
- **Behavioral regressions** vs. the old app: leaving/removing/deleting *nulls* the active household instead of reassigning it; `transferOwnership` has no self-target guard and is non-atomic.

The old app's canonical surfaces are `frontend/src/pages/HouseholdPage.tsx`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/household/AISettings.tsx`, and `frontend/src/pages/WelcomePage.tsx` — these define parity.

## Decisions

1. **Route layout:** Sub-pages under `/settings` (matches the existing `/settings/tags` and `/settings/ai` pattern). New `/settings/household`; expand `/settings` with an Account section; keep `/settings/ai` as its own page.
2. **`/welcome`:** Included. Onboarding completion routes to `/welcome` instead of `/`.
3. **PATs / token section:** Out of scope (dropped at cutover, decision #4).

## What already exists (do not rebuild)

- **Household actions** — all 9 in `web/app/(account)/actions.ts`: `createHouseholdAction`, `listHouseholdsAction`, `updateHouseholdAction`, `updateHouseholdSettingsAction`, `switchHouseholdAction`, `listMembersAction`, `leaveHouseholdAction`, `removeMemberAction`, `transferOwnershipAction`, `deleteHouseholdAction`, `createHouseholdInviteAction`.
- **Household lib** — `web/lib/households/manage.ts`, `membership.ts`, `invites.ts`, `serialize.ts`.
- **Passkey management lib** — `web/lib/auth/passkey-management.ts`: `listPasskeys`, `beginAddPasskey`, `completeAddPasskey`, `deletePasskey`. Client helper `addPasskey` in `web/lib/auth-client/webauthn.ts`. Actions `listPasskeysAction`/`deletePasskeyAction` already exist.
- **Password lib** — `web/lib/auth/password-management.ts`: `setPassword`, `removePassword`.
- **User serialization** — `serializeUser` already exposes `hasPassword` / `hasPasskey`.
- **i18n namespaces** — `household`, `password`, `passkeys`, `aiSettings`, `welcome` already present in `web/lib/i18n/locales/{en,de}.json` (fill any gaps).
- **Invite create** — works. Invite **accept** exists only for *new-user* registration (`web/app/(auth)/invite/[code]/`).
- **UI primitives** — `web/components/ui/dialog.tsx` exists; there is **no** alert/confirm/drawer primitive (build confirm on top of `dialog.tsx`).

## Lib layer (new + changed)

### New: `joinHousehold` (logged-in invite accept) — M2

In `web/lib/households/membership.ts`:

```
joinHousehold(db, userId, code, now): { id: string; name: string }
```

- `validateInvite(db, code, now)` (throws on invalid/expired/used).
- If the user is already a member of the invite's household → throw `AuthError(400, "Already a member of this household.")`.
- Insert `householdMembers` row (`role: "MEMBER"`, `joinedAt: now`).
- `consumeInvite(db, invite.id, userId)`.
- If the user has no `activeHouseholdId`, set it to this household.
- Return the household `{ id, name }`.

Wrap insert + consume + active-household update in a `db.transaction` (better-sqlite3 synchronous).

### New: `verifyGeminiKey` — M9

In a new module `web/lib/ai/verify.ts`:

```
verifyGeminiKey(apiKey, fetchImpl = fetch): Promise<"valid" | "invalid" | "unreachable">
```

- GET `https://generativelanguage.googleapis.com/v1beta/models` with header `x-goog-api-key: <apiKey>` (reuse the `BASE` constant pattern from `web/lib/ai/config.ts`; export a `modelsListUrl()` helper there).
- 200 → `"valid"`; 400/401/403 → `"invalid"`; network error / other → `"unreachable"`.
- `fetchImpl` is injectable for tests (no real network in unit tests). Mirrors old `backend/users/api.py::verify_gemini_key`.

### Changed: active-household reassignment — behavioral fix

Replace `clearActiveHouseholdIfPointingHere` in `web/lib/households/membership.ts` with:

```
reassignActiveHousehold(db, userId, leavingHouseholdId): void
```

- If the user's `activeHouseholdId !== leavingHouseholdId`, do nothing.
- Otherwise set `activeHouseholdId` to the user's **next** remaining membership (the membership with the oldest `joinedAt` that is not `leavingHouseholdId`); if none remain, set `null`.
- Called from `leaveHousehold` (for the leaver), `removeMember` (for the removed member), `deleteHousehold` (for the owner).

### Changed: `transferOwnership` — behavioral fix

- Add a self-target guard: if the target membership belongs to the actor → throw `AuthError(400, "You already own this household.")`.
- Wrap the promote (target → OWNER) + demote (actor → MEMBER) in a `db.transaction` so they apply atomically.

### Tests (TDD, Vitest)

New/updated in `web/lib/households/*.test.ts` and `web/lib/ai/verify.test.ts`:

- `joinHousehold`: success path sets membership + consumes invite; already-member rejected; invalid/expired/used invite rejected; active household set only when previously null.
- `verifyGeminiKey`: valid (200), invalid (400/401/403), unreachable (throw / 500) via injected fetch.
- `reassignActiveHousehold`: reassigns to next membership; nulls when none remain; no-op when active points elsewhere. Cover via `leaveHousehold` / `removeMember` / `deleteHousehold`.
- `transferOwnership`: self-target rejected; normal transfer swaps roles; both rows updated.

## Server actions (`web/app/(account)/actions.ts`)

Add, using the existing `run()` wrapper and Zod schemas:

- `joinHouseholdAction(code: string)` → `joinHousehold`.
- `setPasswordAction(input)` → `setPassword` (current+new for change, new-only for set).
- `removePasswordAction(input)` → `removePassword` (requires a passkey; surface the lib's guard).
- `verifyGeminiKeyAction(apiKey: string)` → `verifyGeminiKey`.
- `beginAddPasskeyAction()` / `completeAddPasskeyAction(...)` → wrap `beginAddPasskey` / `completeAddPasskey` (mirror the onboarding add-passkey flow).

Add any missing Zod schemas to `web/lib/schemas/auth.ts` (`joinHouseholdSchema`, `setPasswordSchema`).

## UI

### `/settings/household` (new)

- `page.tsx` (server) — `requireUser`; load households via `listHouseholds`, members of the active household via `listMembers`, and the active household id. Pass to client.
- `household-client.tsx` — orchestrates state (active household, optimistic refresh via `router.refresh()` + toasts). Composed of focused components:
  - `household-info.tsx` — name + member count; inline rename form (owner only).
  - `members-list.tsx` — member rows with role badge; remove (owner, non-self) and transfer-ownership (owner, non-self, non-owner target) with confirm.
  - `invite-section.tsx` — generate invite (owner), show code, copy-to-clipboard, expiry date.
  - `create-household.tsx` — name input → `createHouseholdAction`.
  - `join-household.tsx` — code input → `joinHouseholdAction`.
  - `switch-household.tsx` — switcher (dialog/select) when the user has >1 household → `switchHouseholdAction`.
  - `danger-zone.tsx` — leave (non-owner) and delete (owner, sole member, name-confirmation) with confirm.

### `/settings` (expand)

- Add an **Account** section: current email, password form (`password-form.tsx`: set/change/remove, gated on `hasPassword`/`hasPasskey`), passkey management (`passkey-section.tsx`: list/add/delete), logout.
- Add a **link card** to `/settings/household` (and keep existing tags/AI links).

### `/settings/ai` (modify)

- Owner-gate the form (disable inputs for non-owners, mirroring old `AISettings`).
- Add a "Verify" button next to the key input → `verifyGeminiKeyAction`, showing valid/invalid/unreachable state.

### `/welcome` (new) — M11

- Port `frontend/src/pages/WelcomePage.tsx`: title, subtitle, three link cards (add recipe → `/recipes`, create plan → `/plan`, invite member → `/settings/household`), "Get started" → `/recipes`.
- Onboarding completion (CREATE_HOUSEHOLD step) routes to `/welcome`. `/welcome` itself requires an authenticated, onboarded user.

### `/invite/[code]` (modify)

- If a session exists (`getSessionUser` returns a user), render a "Join {householdName}" action calling `joinHouseholdAction(code)` then routing to `/welcome` (or `/`), instead of the registration form.
- Anonymous users keep the existing register form.

### Confirm dialog

- A small `confirm-dialog.tsx` (and/or a `useConfirm` hook) in `web/components/ui/` built on `dialog.tsx`, supporting title/message/confirm-label/destructive variant and an optional text-input field (for delete-by-name and remove-password-by-current-password).

## i18n

Namespaces already exist; fill any missing keys in both `en.json` and `de.json` (household management, members, invites, join/create, danger zone, password set/change/remove, passkey add/delete, AI verify states, welcome cards). Reuse old-app key names where they map cleanly.

## Out of scope

- Personal access tokens / token section (dropped at cutover).
- New bottom-nav icon (household reached via the `/settings` link card).
- Offline behavior (Plan 8f).

## Testing summary

- **Unit (Vitest):** `joinHousehold`, `verifyGeminiKey`, `reassignActiveHousehold` (via leave/remove/delete), `transferOwnership` self-guard; update existing `manage.test.ts` / `membership.test.ts`.
- **Component:** light coverage following existing new-app patterns (e.g. confirm-dialog behavior, password-form gating).
- **Lint/type:** `npm run lint`, `tsc` clean.

## File map

| Area | Path |
|------|------|
| Lib — join | `web/lib/households/membership.ts` (+ test) |
| Lib — verify key | `web/lib/ai/verify.ts` (+ test), `web/lib/ai/config.ts` (add `modelsListUrl`) |
| Lib — reassign / transfer fix | `web/lib/households/membership.ts`, `manage.ts` (+ tests) |
| Schemas | `web/lib/schemas/auth.ts` |
| Actions | `web/app/(account)/actions.ts` |
| Household page | `web/app/(app)/settings/household/page.tsx` + components |
| Settings expand | `web/app/(app)/settings/settings-client.tsx` + account components |
| AI verify | `web/app/(app)/settings/ai/ai-settings-form.tsx` |
| Welcome | `web/app/(app)/welcome/page.tsx`; onboarding completion routing |
| Invite accept (logged-in) | `web/app/(auth)/invite/[code]/page.tsx` + form |
| Confirm dialog | `web/components/ui/confirm-dialog.tsx` |
| i18n | `web/lib/i18n/locales/{en,de}.json` |
