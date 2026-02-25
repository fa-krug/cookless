# Household Management Design

## Overview

Add full household management: edit name, delete household (with name-confirmation), leave household, transfer ownership, and a navigation link to the household page from the sidebar/top bar.

## Backend

### New Endpoints

- **`DELETE /api/v1/households/{id}/`** — OWNER only. Returns 409 if other members exist (must remove or transfer ownership first). Deletes household, auto-switches user's `active_household` to next available or null.
- **`POST /api/v1/households/{id}/leave/`** — Any member except sole owner. Removes membership, auto-switches `active_household` if needed. Returns 409 if user is OWNER and other members exist (must transfer ownership first).
- **`POST /api/v1/households/{id}/members/{pk}/transfer-ownership/`** — OWNER only. Promotes target member to OWNER, demotes current owner to MEMBER.

### Existing Endpoints (no changes)

- `PATCH /api/v1/households/{id}/` — Already handles household rename (OWNER only).

## Frontend — Navigation

- **Desktop sidebar:** Household name shown below the logo, tappable link to `/household`.
- **Mobile:** Small bar at the top of the screen with household name, tappable link to `/household`.

## Frontend — HouseholdPage Sections (top to bottom)

1. **Household Switcher** (existing, shown if 2+ households)
2. **Household Name** — displayed as text with edit icon (OWNER only). Tap turns it into an inline input with save/cancel buttons.
3. **Members List** (existing) — add "Transfer Ownership" button per member (OWNER only).
4. **Invite Section** (existing, OWNER only)
5. **Create Household** (existing)
6. **Join Household** (existing)
7. **Leave Household** — button for non-owners. Simple confirmation dialog.
8. **Delete Household** — danger zone at bottom, OWNER only. Red button opens modal requiring the exact household name typed to confirm deletion.

## Auto-switch Logic

When a user leaves, is removed from, or deletes a household that was their `active_household`: set `active_household` to the next available household (or null if none). Invalidate queries and refresh user context on the frontend.

## Deletion Safety

- Owner must be the sole member to delete a household.
- If other members exist, owner must remove them or transfer ownership first.
- Confirmation modal requires typing the exact household name.

## i18n

New translation keys needed for: edit name, save, cancel, delete household, confirm deletion prompt, transfer ownership, leave household, leave confirmation, and related error/success messages. Both en and de.
