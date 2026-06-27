# Release Notes — Next.js Cutover

> **Platform upgrade:** Cookless has migrated from its original Django/React stack to a new Next.js application. The core functionality — recipes, meal planning, shopping lists, and AI generation — carries over, but the upgrade introduces several breaking changes described below.

---

## Breaking Changes

### 1. Password reset required

For security, all account passwords were invalidated during the platform upgrade.

- **If you have a passkey registered:** log in as normal — passkey authentication is unaffected.
- **If you log in with a password:** your existing password no longer works. Ask an admin to set a new password for you using the `set-password.ts` admin script.

> **Note:** There is no self-service "forgot my password" email flow. SMTP is not configured in this deployment. Password resets must be performed by an administrator.

### 2. Personal Access Tokens removed

API token access (programmatic/script access using a personal access token) has been removed. The API is now session-cookie based only.

If you were using a personal access token to call the API, you will need to use browser-based session authentication instead. This was an intentional scope decision for this release.

### 3. Offline shopping toggles temporarily unavailable

The app is now installable as a Progressive Web App (PWA) — you can add it to your home screen on iOS and Android. However, the ability to check items off the shopping list while you are offline is not yet available in this release. It will be restored in a future update (tracked as Plan 8f).

Online shopping list toggling works as normal.

---

## Known Gaps Being Worked On

The following features from the previous app are not yet present in this release. Each is tracked as a focused follow-on plan and will ship independently, in priority order.

| Gap | Plan |
|-----|------|
| Household management UI (rename, delete, leave, switch household; member list; invite flow) | Plan 8a |
| Cooking mode: machine/program step parameters (temperature, speed, etc.) and screen wake-lock | Plan 8b |
| Shopping multi-list access (access to older lists or multi-day plan segments) | Plan 8c |
| Recipe collection full sort and "load more" pagination | Plan 8d |
| Meal-plan gap-fill variety (algorithm fidelity) | Plan 8e |
| Offline shopping toggle queue | Plan 8f |

For full detail on each gap, see [Section B of Plan 8](superpowers/plans/2026-06-27-nextjs-migration-08-cutover.md#section-b--parity-gap-roadmap-follow-on-plans).

---

## What Did Not Change

- All recipe, meal plan, ingredient, and shopping data was migrated from the previous database.
- Passkey (WebAuthn) authentication works as before.
- AI recipe generation (requires a Gemini API key configured in household settings).
- Image uploads and AI-generated recipe images.
- Meal planning, shopping list generation, and all core recipe CRUD operations.
