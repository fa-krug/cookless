# First-run self-bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the `web` app has no users, let the first visitor register openly and become the OWNER of a freshly-created household, then close registration to invite-only.

**Architecture:** Add a `/setup` route and first-run server actions/routes that create the first user with **no household** and an `onboardingStep` that drops them into the *existing* onboarding wizard, where the already-built `CREATE_HOUSEHOLD` step (`createHousehold`) promotes them to OWNER. Emptiness (`count(users) === 0`) is the single trigger, enforced server-side inside a `db.transaction` so concurrent setups cannot both succeed.

**Tech Stack:** Next.js 15 (App Router, server actions), Drizzle ORM + better-sqlite3, argon2, @simplewebauthn, Zod, react-hook-form, Vitest.

## Global Constraints

- Emptiness trigger is **`count(users) === 0`** (zero users in the table), never "no active users". Enforced server-side inside a `db.transaction`.
- The security boundary is the server action / API route, not the page redirect. Route redirects are UX only.
- Every new user-facing string needs entries in **both** `lib/i18n/locales/en.json` and `lib/i18n/locales/de.json`.
- Reuse existing helpers: `AuthError(status, message)`, the actions `Result` type + `fail()` in `app/(auth)/actions.ts`, `hashPassword`/`validatePassword`, `setSessionCookie`, `serializeUser`, `createTestDb` for lib tests.
- Password-path first user → `onboardingStep = "ADD_PASSKEY"`. Passkey-path first user → `onboardingStep = "CREATE_HOUSEHOLD"`.
- Lib tests use `createTestDb()` from `@/lib/test/db`; passkey tests mock `./webauthn` exactly as `lib/auth/passkey-auth.test.ts` does.
- Run all backend/web checks from the `web/` directory. Commit after each task.

---

## File Structure

- **Create** `web/lib/auth/first-run.ts` — `hasAnyUser(db)` and `registerFirstUser(db, args, now)`. Single source of truth for the emptiness check and password-path first-user creation.
- **Create** `web/lib/auth/first-run.test.ts` — unit tests for the above.
- **Modify** `web/lib/auth/ceremony.ts` — add optional `firstRun` flag to `CeremonyState`.
- **Modify** `web/lib/auth/passkey-auth.ts` — add `beginFirstRunPasskeyRegistration`; add a `firstRun` branch to `completePasskeyRegistration`.
- **Modify** `web/lib/auth/passkey-auth.test.ts` — tests for the passkey first-run path.
- **Modify** `web/lib/schemas/auth.ts` — add `registerFirstUserSchema`.
- **Modify** `web/app/(auth)/actions.ts` — add `registerFirstUserPasswordAction`.
- **Modify** `web/app/api/auth/webauthn/register/begin/route.ts` — allow no-invite begin when the table is empty.
- **Modify** `web/lib/auth-client/webauthn.ts` — add `passkeyRegisterFirstRun(email)`.
- **Create** `web/app/(auth)/setup/page.tsx` + `web/app/(auth)/setup/setup-form.tsx` — the first-run screen.
- **Modify** `web/app/(auth)/login/page.tsx` — redirect to `/setup` when the table is empty.
- **Modify** `web/lib/i18n/locales/en.json` + `de.json` — new `firstRun` namespace.
- **Modify** `README.md` — replace the retired Django bootstrap note.

---

### Task 1: First-run password logic (`hasAnyUser` + `registerFirstUser`)

**Files:**
- Create: `web/lib/auth/first-run.ts`
- Test: `web/lib/auth/first-run.test.ts`

**Interfaces:**
- Produces:
  - `hasAnyUser(db: Db): boolean` — true iff at least one row exists in `users`.
  - `registerFirstUser(db: Db, args: { email: string; password: string }, now: Date): Promise<User>` — validates + hashes the password, then inside a transaction re-checks emptiness and inserts a user with `password = <hash>`, `onboardingStep = "ADD_PASSKEY"`, `isActive = true`, no `activeHouseholdId`. Throws `AuthError(409)` if a user already exists. Returns the inserted `User`.
- Consumes: `hashPassword`, `validatePassword` from `./password`; `AuthError` from `./errors`; `User` from `./session-store`; `users` from `@/lib/db/schema`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/auth/first-run.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { users } from "@/lib/db/schema";
import { hasUsablePassword, verifyPassword } from "./password";
import { hasAnyUser, registerFirstUser } from "./first-run";

const now = new Date("2026-07-01T12:00:00Z");

describe("hasAnyUser", () => {
  it("is false on an empty db and true once a user exists", () => {
    const db = createTestDb();
    expect(hasAnyUser(db)).toBe(false);
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    expect(hasAnyUser(db)).toBe(true);
  });
});

describe("registerFirstUser", () => {
  it("creates an ADD_PASSKEY user with a hashed password and no household", async () => {
    const db = createTestDb();
    const user = await registerFirstUser(db, { email: "boss@x.test", password: "Tr0ub4dour&3" }, now);
    expect(user.onboardingStep).toBe("ADD_PASSKEY");
    expect(user.activeHouseholdId).toBeNull();
    expect(user.isActive).toBe(true);
    expect(hasUsablePassword(user.password)).toBe(true);
    expect(await verifyPassword(user.password, "Tr0ub4dour&3")).toBe(true);
    const row = db.select().from(users).where(eq(users.id, user.id)).get();
    expect(row).toBeTruthy();
  });

  it("rejects with 409 when a user already exists", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    await expect(
      registerFirstUser(db, { email: "boss@x.test", password: "Tr0ub4dour&3" }, now),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a weak password before touching the db", async () => {
    const db = createTestDb();
    await expect(
      registerFirstUser(db, { email: "boss@x.test", password: "short" }, now),
    ).rejects.toMatchObject({ status: 400 });
    expect(hasAnyUser(db)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/first-run.test.ts`
Expected: FAIL — cannot find module `./first-run`.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/lib/auth/first-run.ts
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { hashPassword, validatePassword } from "./password";
import type { User } from "./session-store";

/** True iff at least one user row exists. Emptiness = fresh install → first-run available. */
export function hasAnyUser(db: Db): boolean {
  return db.select({ id: users.id }).from(users).limit(1).get() !== undefined;
}

/**
 * Create the very first user (password path). Only succeeds while the users table
 * is empty; the emptiness check and insert run inside one synchronous transaction so
 * two concurrent setups cannot both create an owner. The new user has no household and
 * lands on the ADD_PASSKEY onboarding step, which flows into CREATE_HOUSEHOLD (→ OWNER).
 */
export async function registerFirstUser(
  db: Db,
  args: { email: string; password: string },
  now: Date,
): Promise<User> {
  validatePassword(args.password, { email: args.email });
  const hash = await hashPassword(args.password);
  return db.transaction((tx) => {
    if (hasAnyUser(tx)) {
      throw new AuthError(409, "Setup has already been completed.");
    }
    return tx
      .insert(users)
      .values({
        id: randomUUID(),
        email: args.email,
        password: hash,
        onboardingStep: "ADD_PASSKEY",
        isActive: true,
        createdAt: now,
      })
      .returning()
      .get();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/first-run.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/first-run.ts web/lib/auth/first-run.test.ts
git commit -m "feat(web): first-run password logic (hasAnyUser + registerFirstUser)"
```

---

### Task 2: First-run passkey logic

**Files:**
- Modify: `web/lib/auth/ceremony.ts` (add `firstRun?: boolean` to `CeremonyState`)
- Modify: `web/lib/auth/passkey-auth.ts`
- Test: `web/lib/auth/passkey-auth.test.ts`

**Interfaces:**
- Consumes: `hasAnyUser` from `./first-run`; existing `getRegistrationOptions`, `verifyRegistration` from `./webauthn`; `users`, `passkeyCredentials` from `@/lib/db/schema`.
- Produces:
  - `beginFirstRunPasskeyRegistration(db: Db, args: { email: string }, rpId: string): Promise<{ options; ceremony: CeremonyState }>` — throws `AuthError(409)` if a user exists; returns a `register` ceremony with `firstRun: true`, no `inviteCode`.
  - `completePasskeyRegistration(...)` gains a `firstRun` branch: when `ceremony.firstRun`, verify the response then (in a transaction re-checking emptiness) insert a user with `password = ""`, `onboardingStep = "CREATE_HOUSEHOLD"`, no household, plus the passkey credential. Returns the `User`.

- [ ] **Step 1: Write the failing test**

Add to `web/lib/auth/passkey-auth.test.ts` (the `vi.mock("./webauthn", ...)` block already provides `verifyRegistration` returning a fixed credential). Import the new function name alongside the existing imports:

```ts
// add beginFirstRunPasskeyRegistration to the existing import from "./passkey-auth"
import {
  beginFirstRunPasskeyRegistration,
  beginPasskeyLogin,
  beginPasskeyRegistration,
  completePasskeyLogin,
  completePasskeyRegistration,
} from "./passkey-auth";

describe("passkey first-run registration", () => {
  it("begin returns a firstRun ceremony on an empty db", async () => {
    const db = createTestDb();
    const { ceremony } = await beginFirstRunPasskeyRegistration(db, { email: "boss@x.test" }, "localhost");
    expect(ceremony).toMatchObject({ type: "register", firstRun: true, email: "boss@x.test" });
    expect(ceremony.inviteCode).toBeUndefined();
  });

  it("begin rejects with 409 when a user already exists", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    await expect(
      beginFirstRunPasskeyRegistration(db, { email: "boss@x.test" }, "localhost"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("complete creates a CREATE_HOUSEHOLD user + credential, no household", async () => {
    const db = createTestDb();
    const ceremony = {
      type: "register" as const,
      firstRun: true,
      challenge: "chal-reg",
      email: "boss@x.test",
      tempUserId: "tmp",
    };
    const user = await completePasskeyRegistration(db, { responseJson: "{}", deviceName: "Phone" }, ceremony, "localhost", now);
    expect(user.onboardingStep).toBe("CREATE_HOUSEHOLD");
    expect(user.activeHouseholdId).toBeNull();
    const cred = db.select().from(passkeyCredentials).where(eq(passkeyCredentials.userId, user.id)).get();
    expect(cred?.deviceName).toBe("Phone");
  });

  it("complete rejects with 409 if a user appeared meanwhile", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    const ceremony = { type: "register" as const, firstRun: true, challenge: "chal-reg", email: "boss@x.test", tempUserId: "tmp" };
    await expect(
      completePasskeyRegistration(db, { responseJson: "{}", deviceName: "" }, ceremony, "localhost", now),
    ).rejects.toMatchObject({ status: 409 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/passkey-auth.test.ts`
Expected: FAIL — `beginFirstRunPasskeyRegistration` is not exported.

- [ ] **Step 3a: Add `firstRun` to the ceremony type**

In `web/lib/auth/ceremony.ts`, add the field to the interface:

```ts
export interface CeremonyState {
  type: "register" | "login" | "add";
  challenge: string;
  email?: string;
  inviteCode?: string;
  tempUserId?: string;
  firstRun?: boolean;
}
```

- [ ] **Step 3b: Add the first-run begin function and complete branch**

In `web/lib/auth/passkey-auth.ts`, add the import and function. Add near the top with the other imports:

```ts
import { hasAnyUser } from "./first-run";
```

Add this function (after `beginPasskeyRegistration`):

```ts
export async function beginFirstRunPasskeyRegistration(
  db: Db,
  args: { email: string },
  rpId: string,
): Promise<{ options: Awaited<ReturnType<typeof getRegistrationOptions>>; ceremony: CeremonyState }> {
  if (hasAnyUser(db)) {
    throw new AuthError(409, "Setup has already been completed.");
  }
  const tempUserId = randomUUID();
  const options = await getRegistrationOptions({
    userId: tempUserId,
    userEmail: args.email,
    rpId,
    excludeCredentialIds: [],
  });
  return {
    options,
    ceremony: { type: "register", firstRun: true, challenge: options.challenge, email: args.email, tempUserId },
  };
}
```

At the very top of `completePasskeyRegistration`, before the existing `if (ceremony.type !== "register" ...)` guard, insert the first-run branch:

```ts
  if (ceremony.firstRun) {
    if (ceremony.type !== "register" || !ceremony.email) {
      throw new AuthError(400, "No registration in progress.");
    }
    const verified = await verifyRegistration({
      responseJson: args.responseJson,
      expectedChallenge: ceremony.challenge,
      rpId,
    });
    const email = ceremony.email;
    return db.transaction((tx) => {
      if (hasAnyUser(tx)) {
        throw new AuthError(409, "Setup has already been completed.");
      }
      const user = tx
        .insert(users)
        .values({
          id: randomUUID(),
          email,
          password: "",
          onboardingStep: "CREATE_HOUSEHOLD",
          isActive: true,
          createdAt: now,
        })
        .returning()
        .get();
      tx.insert(passkeyCredentials)
        .values({
          id: randomUUID(),
          userId: user.id,
          credentialId: verified.credentialId,
          publicKey: verified.publicKey,
          signCount: verified.signCount,
          deviceName: args.deviceName,
          createdAt: now,
        })
        .run();
      return user;
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/auth/passkey-auth.test.ts`
Expected: PASS — existing tests plus the 4 new first-run tests.

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/ceremony.ts web/lib/auth/passkey-auth.ts web/lib/auth/passkey-auth.test.ts
git commit -m "feat(web): first-run passkey registration path"
```

---

### Task 3: Wire actions, schema, API route, and client helper

**Files:**
- Modify: `web/lib/schemas/auth.ts`
- Modify: `web/app/(auth)/actions.ts`
- Modify: `web/app/api/auth/webauthn/register/begin/route.ts`
- Modify: `web/lib/auth-client/webauthn.ts`

**Interfaces:**
- Consumes: `registerFirstUser`, `hasAnyUser` (Task 1); `beginFirstRunPasskeyRegistration` (Task 2).
- Produces:
  - `registerFirstUserSchema` — `{ email: string(email); password: string.min(1) }`.
  - `registerFirstUserPasswordAction(input: unknown): Promise<Result>` — creates the first user, sets the session cookie, returns `{ ok: true, user }`.
  - `passkeyRegisterFirstRun(email: string): Promise<T>` — client helper posting to the existing begin/complete routes with no invite code.
  - The begin route accepts a missing `inviteCode` only when `hasAnyUser(db)` is false.

- [ ] **Step 1: Add the schema**

In `web/lib/schemas/auth.ts`, add:

```ts
export const registerFirstUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
```

- [ ] **Step 2: Add the server action**

In `web/app/(auth)/actions.ts`, add the import and the action. Extend the existing register import line:

```ts
import { registerWithPassword } from "@/lib/auth/register";
import { registerFirstUser } from "@/lib/auth/first-run";
```

Add to the schema import from `@/lib/schemas/auth`: `registerFirstUserSchema`.

Add the action (next to `registerPasswordAction`):

```ts
export async function registerFirstUserPasswordAction(input: unknown): Promise<Result> {
  try {
    const { email, password } = registerFirstUserSchema.parse(input);
    const user = await registerFirstUser(db, { email, password }, new Date());
    await setSessionCookie(user.id);
    return { ok: true, user: serializeUser(db, user) };
  } catch (e) {
    return fail(e);
  }
}
```

- [ ] **Step 3: Branch the passkey begin route**

Rewrite the body of `web/app/api/auth/webauthn/register/begin/route.ts` so a missing invite code falls back to first-run when the table is empty:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginFirstRunPasskeyRegistration, beginPasskeyRegistration } from "@/lib/auth/passkey-auth";
import { hasAnyUser } from "@/lib/auth/first-run";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId } from "@/lib/auth/session";
import { passkeyBeginSchema } from "@/lib/schemas/auth";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { email, inviteCode } = passkeyBeginSchema.parse(await req.json());
    const rpId = await currentRpId();
    let result;
    if (inviteCode) {
      result = await beginPasskeyRegistration(db, { email, inviteCode }, rpId, new Date());
    } else if (!hasAnyUser(db)) {
      result = await beginFirstRunPasskeyRegistration(db, { email }, rpId);
    } else {
      throw new AuthError(400, "Invite code is required.");
    }
    await setCeremonyCookie(result.ceremony);
    return NextResponse.json(result.options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

The complete route needs no change — `completePasskeyRegistration` reads `ceremony.firstRun` itself.

- [ ] **Step 4: Add the client helper**

In `web/lib/auth-client/webauthn.ts`, add after `passkeyRegister`:

```ts
export async function passkeyRegisterFirstRun<T = unknown>(email: string): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/register/begin", { email });
  const credential = await startRegistration({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/register/complete", {
    credential: JSON.stringify(credential),
    deviceName: navigator.userAgent,
  });
}
```

- [ ] **Step 5: Typecheck + lint (gate)**

Run: `cd web && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/schemas/auth.ts "web/app/(auth)/actions.ts" web/app/api/auth/webauthn/register/begin/route.ts web/lib/auth-client/webauthn.ts
git commit -m "feat(web): wire first-run register action, begin route, and client helper"
```

---

### Task 4: `/setup` route + form + i18n

**Files:**
- Create: `web/app/(auth)/setup/page.tsx`
- Create: `web/app/(auth)/setup/setup-form.tsx`
- Modify: `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`

**Interfaces:**
- Consumes: `hasAnyUser` (Task 1); `registerFirstUserPasswordAction` (Task 3); `passkeyRegisterFirstRun` (Task 3); existing `AuthCard`, form primitives, `useT`.

- [ ] **Step 1: Add i18n keys (en + de)**

In `web/lib/i18n/locales/en.json`, add a top-level `firstRun` namespace (e.g. after the `invite` block):

```json
  "firstRun": {
    "title": "Welcome to Cookless",
    "prompt": "No account exists yet. Create the first one — you'll become the owner of your new home."
  },
```

In `web/lib/i18n/locales/de.json`, add the parallel block:

```json
  "firstRun": {
    "title": "Willkommen bei Cookless",
    "prompt": "Es existiert noch kein Konto. Erstelle das erste — du wirst Eigentümer:in deines neuen Zuhauses."
  },
```

The form reuses existing `auth.*` and `password.*` keys for field labels and buttons.

- [ ] **Step 2: Create the setup form (mirrors invite-form)**

```tsx
// web/app/(auth)/setup/setup-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n/provider";
import { passkeyRegisterFirstRun } from "@/lib/auth-client/webauthn";
import { registerFirstUserPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";

const schema = z
  .object({
    email: z.string().email(),
    password: z.string().optional(),
    confirm: z.string().optional(),
  })
  .refine((v) => !v.password || v.password === v.confirm, {
    path: ["confirm"],
    message: "password.passwordMismatch",
  });
type Values = z.infer<typeof schema>;

export function SetupForm() {
  const { t } = useT();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", confirm: "" },
  });

  function done() {
    router.push("/");
    router.refresh();
  }

  async function onSubmit(values: Values) {
    form.clearErrors("root");
    try {
      if (showPassword) {
        const res = await registerFirstUserPasswordAction({
          email: values.email,
          password: values.password ?? "",
        });
        if (!res.ok) {
          form.setError("root", { message: res.message });
          return;
        }
      } else {
        await passkeyRegisterFirstRun(values.email);
      }
      done();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      form.setError("root", {
        message: e instanceof Error ? e.message : t("invite.registerFailed"),
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="username webauthn"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showPassword && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("auth.passwordPlaceholder")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("password.confirmPassword")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {form.formState.errors.root && (
          <p className="text-center text-xs text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {showPassword ? t("auth.register") : t("auth.signInWithPasskey")}
        </Button>

        <div className="my-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-muted" />
          <span className="text-xs text-muted-foreground">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-muted" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            form.clearErrors("root");
            setShowPassword((v) => !v);
          }}
        >
          {showPassword ? t("auth.signInWithPasskey") : t("auth.signInWithPassword")}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 3: Create the setup page with the emptiness guard**

```tsx
// web/app/(auth)/setup/page.tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasAnyUser } from "@/lib/auth/first-run";
import { AuthCard } from "@/components/auth/auth-card";
import { getI18n } from "@/lib/i18n/server";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  if (hasAnyUser(db)) redirect("/login");
  const { t } = await getI18n();
  return (
    <AuthCard>
      <h1 className="mb-1 text-center text-lg font-semibold">{t("firstRun.title")}</h1>
      <p className="mb-4 text-center text-sm text-muted-foreground">{t("firstRun.prompt")}</p>
      <SetupForm />
    </AuthCard>
  );
}
```

- [ ] **Step 4: Verify i18n JSON is valid + typecheck**

Run: `cd web && node -e "require('./lib/i18n/locales/en.json'); require('./lib/i18n/locales/de.json'); console.log('json ok')" && npm run typecheck`
Expected: `json ok` and no type errors.

- [ ] **Step 5: Commit**

```bash
git add "web/app/(auth)/setup" web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "feat(web): /setup first-run screen (passkey + password) with i18n"
```

---

### Task 5: Routing guard — send logged-out visitors to /setup when empty

**Files:**
- Modify: `web/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `hasAnyUser` (Task 1).

- [ ] **Step 1: Add the redirect to the login page**

Rewrite `web/app/(auth)/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasAnyUser } from "@/lib/auth/first-run";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  if (!hasAnyUser(db)) redirect("/setup");
  return (
    <AuthCard>
      <LoginForm />
    </AuthCard>
  );
}
```

Note: the logged-out root (`/`) already routes through `(app)/layout` → `requireUser()` → `/login`, so this single redirect covers the whole "empty database" entry path. `/setup` already redirects back to `/login` once a user exists (Task 4).

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(auth)/login/page.tsx"
git commit -m "feat(web): redirect to /setup while the app has no users"
```

---

### Task 6: Cleanup, README, and full manual verification

**Files:**
- Modify: `README.md`
- (Investigate) `web/lib/auth/register.ts`, `web/lib/auth/passkey-auth.ts` — `roleForInviteCreator`

- [ ] **Step 1: Decide the fate of `roleForInviteCreator`**

Run: `cd web && grep -rn "roleForInviteCreator" lib app --include="*.ts" | grep -v ".test."`
- If it is still called by the normal invite path (`register.ts`, `passkey-auth.ts`) — which it is — **leave it in place**. It still governs OWNER-vs-MEMBER for legacy Django-migrated invites created by an inactive user. Do not remove it. (The inactive-`system@cookless.local` *bootstrapping* is what we retire, not this function.)
- Record the decision in the commit message.

- [ ] **Step 2: Update the README bootstrap note**

In `README.md`, replace the "Bootstrap (first deployment)" block (the `python manage.py create_first_household` instructions) with the web-app first-run flow:

```markdown
### Bootstrap (first deployment)

On a fresh install (no users yet), open the app in a browser. The first visitor
is redirected to `/setup`, where they create the first account (passkey or
password) and are guided through creating their household — becoming its OWNER.
Once a user exists, `/setup` is closed and registration is invite-only.
```

- [ ] **Step 3: Reset the dev DB to empty**

```bash
cd web && rm -f data/cookless.db data/cookless.db-shm data/cookless.db-wal \
  && npm run db:migrate && npm run db:seed
```
Expected: "migrations applied" then "Seeded 8 units and 81 ingredients".

- [ ] **Step 4: Full test + lint + typecheck sweep**

Run: `cd web && npm test && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Manual verification (preview)**

Start the `web` server and verify the flow end-to-end:
1. Visit `/` → expect redirect to `/setup` (empty DB).
2. On `/setup`, toggle to password mode, register with a valid email + strong password.
3. Expect to land in onboarding at the **Add a Passkey** step → skip → **Create Your Home** step → name it → reach the app as OWNER.
4. Confirm in the DB: `users` has 1 row (`onboardingStep = COMPLETED`), `households` has 1 row, `household_members` has that user with `role = OWNER`.
5. Log out, visit `/setup` again → expect redirect to `/login` (setup now closed).

DB check command:
```bash
cd /Users/skrug/PycharmProjects/cookless && .venv/bin/python -c "
import sqlite3; c=sqlite3.connect('web/data/cookless.db')
print('users', c.execute('select email,onboarding_step,active_household_id from users').fetchall())
print('members', c.execute('select role from household_members').fetchall())
print('households', c.execute('select name from households').fetchall())
"
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: replace Django bootstrap note with web first-run flow"
```

---

## Self-Review Notes

- **Spec coverage:** `/setup` route (T4), first-run actions with transaction guard (T1/T2/T3), password→ADD_PASSKEY & passkey→CREATE_HOUSEHOLD steps (T1/T2), reuse of onboarding+`createHousehold` (no code — verified existing), routing guards (T4/T5), trigger = zero users (T1 `hasAnyUser`), cleanup + README + DB reset (T6). All spec sections map to a task.
- **`roleForInviteCreator`:** spec flagged it as possibly dead; T6 Step 1 confirms it is still used by the invite path and is retained. No removal.
- **Type consistency:** `hasAnyUser(db)` used identically in T1/T2/T3/T4/T5; `registerFirstUser` returns `User`; `CeremonyState.firstRun?: boolean` defined in T2 and read in T2/T3; `registerFirstUserPasswordAction` returns the shared `Result` type.
- **No placeholders:** every code step carries full code; every run step has a command + expected output.
