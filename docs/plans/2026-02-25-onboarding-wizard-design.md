# Onboarding Wizard Design

## Problem

The app starts with an admin user created via `docker-entrypoint.sh` with a fixed password from env vars. There is no flow to guide this user through securing their account and setting up their household.

When a user has no household (`active_household` is null), the app shows empty states on all pages with no guidance.

## Solution

A backend-driven onboarding wizard at `/setup` that guides the admin through three sequential steps:

1. Change password (mandatory)
2. Add passkey (optional, can skip)
3. Create household

## Backend

### User Model Changes

Add `onboarding_step` field to the User model:

```python
class OnboardingStep(models.TextChoices):
    CHANGE_PASSWORD = "CHANGE_PASSWORD"
    ADD_PASSKEY = "ADD_PASSKEY"
    CREATE_HOUSEHOLD = "CREATE_HOUSEHOLD"
    COMPLETED = "COMPLETED"

onboarding_step = CharField(
    max_length=20,
    choices=OnboardingStep.choices,
    default=OnboardingStep.CHANGE_PASSWORD,
)
```

- Default value: `CHANGE_PASSWORD` (applies to docker-entrypoint superuser)
- Users who register via invite get `COMPLETED` (they already have a household)
- Returned in `/api/v1/users/me/` response

### New Endpoints

**`POST /api/v1/users/me/change-password/`**
- Accepts: `current_password`, `new_password`
- Validates current password
- Sets new password
- Advances `onboarding_step` from `CHANGE_PASSWORD` to `ADD_PASSKEY`

**`POST /api/v1/users/me/skip-passkey/`**
- Advances `onboarding_step` from `ADD_PASSKEY` to `CREATE_HOUSEHOLD`

### Modified Endpoints

- **Passkey registration complete:** If `onboarding_step` is `ADD_PASSKEY`, advance to `CREATE_HOUSEHOLD`
- **Create household:** If `onboarding_step` is `CREATE_HOUSEHOLD`, advance to `COMPLETED`

## Frontend

### Routing & Guards

- New route: `/setup` → `<SetupWizard />`
- Sits outside `<Layout />` (like `/login` and `/invite`) — no bottom nav, no header
- **Layout guard:** If `user.onboarding_step !== "COMPLETED"`, redirect to `/setup`
- **Setup guard:** If `user.onboarding_step === "COMPLETED"`, redirect to `/recipes`

### SetupWizard Component

Reads `user.onboarding_step` from backend to determine which step to show. Step indicator at the top (1 — 2 — 3). Each step is a centered card.

**Step 1: ChangePasswordStep**
- Shows current email (read-only)
- Fields: current password, new password, confirm new password
- Calls `POST /api/v1/users/me/change-password/`
- On success, refetches `/me/` → advances to step 2

**Step 2: AddPasskeyStep**
- Brief explanation of passkeys
- "Add Passkey" button → reuses existing passkey registration flow
- "Skip" button → calls `POST /api/v1/users/me/skip-passkey/`
- On success, refetches `/me/` → advances to step 3

**Step 3: CreateHouseholdStep**
- Single field: household name
- Calls `POST /api/v1/households/`
- On success, refetches `/me/` → wizard sees `COMPLETED` → redirects to `/welcome`

### Welcome Page

- Route: `/welcome`
- Centered card with "Welcome to Cookless!" heading
- Links to key features:
  - "Add your first recipe" → `/recipes`
  - "Create a meal plan" → `/plan`
  - "Invite a family member" → `/household`
- Normal page, no forced revisits
