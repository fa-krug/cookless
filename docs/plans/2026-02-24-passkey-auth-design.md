# Passkey-Only Authentication Design

**Date:** 2026-02-24
**Status:** Approved

## Summary

Replace Apple Sign-In with passkey-only authentication (WebAuthn). Users register via invite links with just an email and a passkey. No passwords.

## Data Model Changes

### Remove
- `apple_id` field from User model
- `rest_framework.authtoken.Token` dependency
- `django-allauth` and all social account models

### Add: `PasskeyCredential` model
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user | FK → User | |
| credential_id | BinaryField | Unique, indexed |
| public_key | BinaryField | |
| sign_count | IntegerField | Replay protection counter |
| device_name | CharField | User-provided or from attestation |
| created_at | DateTimeField | |

### User model
- Remove `apple_id` field
- Keep `set_unusable_password()` as default
- `is_active` defaults to `True` (invite = pre-approved)

## Auth Flows

### Registration (via invite link)
1. User opens `/invite/<code>`
2. Frontend validates invite via `GET /api/v1/invites/<code>/`
3. User enters email
4. `POST /api/v1/auth/register/` with `{email, invite_code}` — creates user, returns WebAuthn challenge
5. Browser prompts passkey creation (`navigator.credentials.create()`)
6. `POST /api/v1/auth/passkey/register/complete/` — verifies attestation, stores credential, sets session

### Login
1. User enters email on `/login`
2. `POST /api/v1/auth/login/begin/` — returns WebAuthn challenge
3. Browser prompts passkey (`navigator.credentials.get()`)
4. `POST /api/v1/auth/login/complete/` — verifies assertion, sets session

### Existing user joining via invite
1. User opens `/invite/<code>` while logged in
2. Sees "Join [Household Name]?" confirmation
3. Clicks Join → `POST /api/v1/invites/<code>/accept/`

### Logout
- `POST /api/v1/auth/logout/` — clears session (unchanged)

## API Endpoints

### Remove
- `POST /api/v1/auth/apple/`
- Bearer token auth (`TokenAuth` class)

### New/Modified Endpoints
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v1/invites/<code>/` | GET | None | Validate invite, return household name |
| `/api/v1/auth/register/` | POST | None | Create user + begin passkey registration |
| `/api/v1/auth/passkey/register/complete/` | POST | None | Complete registration, set session |
| `/api/v1/auth/login/begin/` | POST | None | Begin login ceremony |
| `/api/v1/auth/login/complete/` | POST | None | Verify assertion, set session |
| `/api/v1/auth/logout/` | POST | Required | Clear session (existing) |
| `/api/v1/invites/<code>/accept/` | POST | Required | Join household |
| `/api/v1/invites/` | POST | Required | Create invite (owner only, existing) |
| `/api/v1/users/me/passkeys/` | GET | Required | List user's passkeys |
| `/api/v1/users/me/passkeys/<id>/` | DELETE | Required | Remove a passkey |
| `/api/v1/users/me/passkeys/add/begin/` | POST | Required | Begin adding another passkey |
| `/api/v1/users/me/passkeys/add/complete/` | POST | Required | Complete adding passkey |

Challenge state stored in Django sessions between begin/complete calls.

## Frontend Changes

### Remove
- Apple Sign-In redirect logic in AuthContext
- `VITE_APPLE_CLIENT_ID` env var

### Login page (`/login`)
- Email input + "Sign in" button
- Calls login/begin → browser passkey prompt → login/complete

### Invite page (`/invite/:code`)
- Validates invite on load
- Logged in: "Join [Household]?" with Join/Decline
- Not logged in: email input → register → passkey prompt → logged in + joined

### Passkey management (settings)
- List passkeys (device name + created date)
- Delete (with confirmation, prevent deleting last one)
- Add passkey for additional devices

### AuthContext
- `login(email)` becomes async multi-step
- Add `register(email, inviteCode)`
- Keep `logout`, `refreshUser`

## Dependencies

### Backend — Add
- `py-webauthn`

### Backend — Remove
- `django-allauth[socialaccount]`
- `djangorestframework`

### Frontend
- No new dependencies (WebAuthn API is built into browsers)

## Settings Changes

### Remove from INSTALLED_APPS
- `rest_framework`, `rest_framework.authtoken`
- `allauth`, `allauth.account`, `allauth.socialaccount`, `allauth.socialaccount.providers.apple`

### Remove from AUTHENTICATION_BACKENDS
- `allauth.account.auth_backends.AuthenticationBackend`

### Remove
- `SOCIALACCOUNT_PROVIDERS` block
- Apple env vars (`APPLE_CLIENT_ID`, `APPLE_SECRET_KEY`, `APPLE_KEY_ID`, `APPLE_CERTIFICATE_KEY`)

### Add
- `WEBAUTHN_RP_ID` — e.g. `localhost` for dev
- `WEBAUTHN_RP_NAME` — e.g. `Cook Less`
- `WEBAUTHN_ORIGIN` — e.g. `http://localhost:5173` for dev

### Auth simplification
- Remove `TokenAuth` class — session-only auth
- API default auth becomes just `SessionAuth`
