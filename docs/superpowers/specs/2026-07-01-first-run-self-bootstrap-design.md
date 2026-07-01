# First-run self-bootstrap (in-app first user → OWNER)

**Date:** 2026-07-01
**Status:** Design — approved for planning
**Component:** `web` (Next.js app)

## Problem

The `web` app's registration is entirely invite-gated. Both the password path
(`registerWithPassword`, [lib/auth/register.ts](../../../web/lib/auth/register.ts))
and the passkey path require an invite code, and the new user's household comes
*from* the invite. There is no in-app way to create the very first user.

Today bootstrapping a fresh install requires a manual, off-app step: insert a
household plus an inactive `system@cookless.local` "creator" user, mint an invite
for it, and register through `/invite/[code]` — which grants OWNER only because
`roleForInviteCreator` returns OWNER when the invite creator is inactive
([lib/auth/register.ts:13](../../../web/lib/auth/register.ts)). The old README
still points at the retired Django command `manage.py create_first_household`.

## Goal

When the app has no users, let someone register openly through the UI and become
the OWNER of a freshly-created household. After the first user exists, registration
returns to invite-only. Remove the manual-bootstrap machinery entirely.

## Key insight — reuse the existing onboarding pipeline

`createHousehold` ([lib/households/manage.ts:10](../../../web/lib/households/manage.ts))
already:
- creates the household,
- inserts the caller as `householdMembers` with role `OWNER`,
- seeds default tags,
- sets `activeHouseholdId` if unset, and
- advances `onboardingStep` `CREATE_HOUSEHOLD → COMPLETED`.

There is already a full onboarding wizard with steps
`CHANGE_PASSWORD → ADD_PASSKEY → CREATE_HOUSEHOLD`
([app/onboarding/wizard.tsx](../../../web/app/onboarding/wizard.tsx)), and the
layouts already redirect any user whose `onboardingStep !== "COMPLETED"` into it
([app/(app)/layout.tsx:16](../../../web/app/(app)/layout.tsx)).

Therefore first-run needs **no new household logic**. It only has to open a front
door that lands the first user in the existing onboarding pipeline at the right
step. Household naming happens in the existing `CREATE_HOUSEHOLD` step.

## Trigger condition

First-run is available **iff the `users` table is empty** (`count(users) === 0`).

- A fresh `db:migrate` + `db:seed` produces exactly zero users.
- A Django-migrated install (`data:import`, `scripts/migrate-data.ts`) imports
  users, so setup stays closed.
- Chosen over "no *active* users" deliberately: an admin deactivating every
  account must **not** reopen the OWNER-granting setup door. Emptiness cannot be
  reached by deactivation, only by a genuinely fresh database.

## Design

### 1. `/setup` route (new)

- Path: `app/(auth)/setup/page.tsx` + `setup-form.tsx`, styled with the existing
  `AuthCard`, mirroring `app/(auth)/invite/[code]/` structure.
- The form mirrors the invite registration form: **passkey by default with a
  password toggle**. It collects credentials only — **no** household name, **no**
  invite code.
- Server-side redirect guard in the page: if `count(users) > 0`, redirect to
  `/login` (setup is closed once anyone exists).

### 2. Server actions (new, in `app/(auth)/actions.ts`)

Add first-run counterparts to the existing register actions. The security boundary
is the action, not the route redirect.

**Password path — `registerFirstUserPasswordAction(input)`**
1. Parse+validate email/password (reuse existing password validation).
2. `await hashPassword(...)` first (async), *before* any DB emptiness check.
3. Inside a single synchronous `db.transaction`:
   - Re-check `count(users) === 0`; if not, throw `AuthError(409, "Setup already completed.")`.
   - Insert the user with **no household**, `onboardingStep = "ADD_PASSKEY"`,
     `isActive = true`.
4. Set the session cookie for the new user.

**Passkey path** — the WebAuthn register route/handler gains a first-run mode that,
under the same empty-table transaction guard, creates the user with
`onboardingStep = "CREATE_HOUSEHOLD"` (they already hold a credential, so the
`ADD_PASSKEY` step is skipped).

**Race-safety:** hashing (the only `await`) is done up front; the emptiness check
and the insert are both synchronous `better-sqlite3` calls inside one transaction
with no intervening `await`, so two concurrent setup submissions cannot both pass
the `count === 0` check. The second transaction sees the first user and throws 409.

### 3. `onboardingStep` seed values for the first user

- Password path → `"ADD_PASSKEY"` (they set a password at setup; skip
  `CHANGE_PASSWORD`, offer the optional passkey step, then create the household).
- Passkey path → `"CREATE_HOUSEHOLD"` (skip `ADD_PASSKEY` too).

Both terminate at the existing `CREATE_HOUSEHOLD` step, which promotes them to
OWNER via `createHousehold` and sets `COMPLETED`.

### 4. Routing guards

- Logged-out `/login` and the root redirect: when `count(users) === 0`, redirect
  to `/setup`.
- `/setup`: when `count(users) > 0`, redirect to `/login`.
- Add a small helper, e.g. `hasAnyUser(db): boolean`, in `lib/auth/` so the
  emptiness check has one definition used by both the guards and the actions.

### 5. Cleanup / removal

- Remove reliance on the inactive `system@cookless.local` creator pattern for
  bootstrapping. (`roleForInviteCreator`'s inactive→OWNER branch may remain if it
  is still exercised by legacy Django-migrated invites; verify during planning and
  remove if dead.)
- Reset the current dev DB to genuinely empty (it still holds the placeholder
  household + inactive user + invite created during manual bootstrapping) so
  `/setup` can be exercised.
- Update `README.md`: replace the retired
  `manage.py create_first_household` bootstrap note with "open the app and the
  first visitor is guided through creating the owner account."

## Testing

- **Unit** (`lib/auth`): `registerFirstUserPasswordAction` creates an OWNER-bound
  path when the table is empty; throws 409 when a user already exists; the
  transaction guard rejects the second of two interleaved calls.
- **Unit**: `hasAnyUser` true/false.
- **Flow**: after first-run password registration, `onboardingStep === "ADD_PASSKEY"`
  and no household exists yet; after completing `CREATE_HOUSEHOLD`, the user is an
  OWNER of a household and `onboardingStep === "COMPLETED"`.
- **Guards**: `/setup` redirects to `/login` when a user exists; `/login` redirects
  to `/setup` when empty.
- Follow the repo's existing Vitest patterns under `web/`.

## Out of scope (YAGNI)

- A combined credentials + household-name screen (onboarding already names it).
- Reopening setup based on "no active users".
- Any change to the invite flow for second-and-later users.
