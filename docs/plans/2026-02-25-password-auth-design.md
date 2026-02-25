# Password Authentication Design

**Date:** 2026-02-25
**Status:** Approved

## Summary

Add password authentication alongside existing passkey auth. Passkeys remain the preferred method, but users can register and login with passwords. Users are nudged to add a passkey after password-only registration.

## Requirements

- Registration can be password-only, passkey-only, or both
- Login page shows both options upfront, passkey visually preferred
- Password can be set/changed/removed in settings
- Password removal requires at least one passkey
- Django's built-in password validators (min 8 chars, not too common, not all numeric, not too similar to email)
- No forgot-password/reset flow for now
- Uses Django's existing `AbstractBaseUser` password infrastructure (no new models or dependencies)

## Backend API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/auth/register/password/` | None | Register with email + password + invite code |
| `POST` | `/auth/login/password/` | None | Login with email + password |
| `POST` | `/users/me/password/` | Session | Set or change password |
| `DELETE` | `/users/me/password/` | Session | Remove password (requires >= 1 passkey) |

### Registration (`POST /auth/register/password/`)

Single-step flow. Receives email, password, invite_code. Validates invite (not expired, not used), validates email not taken, validates password with Django validators, creates user with `set_password()`, creates HouseholdMember, consumes invite, establishes session, returns `UserOut`.

### Password Login (`POST /auth/login/password/`)

Single-step flow. Receives email, password. Looks up user, calls `check_password()`, establishes session via Django `login()`, returns `UserOut`.

### Set/Change Password (`POST /users/me/password/`)

Receives `new_password` and optionally `current_password` (required if user already has a password). Validates new password with Django validators. Calls `set_password()`.

### Remove Password (`DELETE /users/me/password/`)

Checks user has at least one passkey. Calls `set_unusable_password()`.

## Schemas

### Request Schemas

```
RegisterPasswordIn: email, password, invite_code
LoginPasswordIn: email, password
SetPasswordIn: current_password (optional), new_password
```

### Response Changes

`UserOut` gains two new fields:
- `has_password: bool`
- `has_passkey: bool`

## Frontend Changes

### Login Page

Two buttons: "Login with Passkey" (primary) and "Login with Password" (secondary). Password login shows email + password form.

### Registration Page

Two paths: existing passkey flow + "Register with Password" (secondary). After password registration, nudge to add a passkey.

### Settings Page

New "Password" section:
- No password: "Set a password" form (new_password + confirm)
- Has password: "Change password" form (current + new + confirm), "Remove password" button (enabled only if has passkey)

### Auth Context

Add `loginWithPassword(email, password)` and `registerWithPassword(email, password, inviteCode)`. Update `User` type with `has_password` and `has_passkey`.

## Model Changes

None significant. `AbstractBaseUser` already provides `password`, `set_password()`, `check_password()`, `has_usable_password()`. Add a `has_passkey` property on User. No migrations needed.
