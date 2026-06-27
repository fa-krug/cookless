# Next.js Migration — Plan 3: Auth & Household Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Django authentication system (passkeys + password fallback + cookie sessions + multi-tenant household scoping) and the full household-management surface into `web/lib/auth/` and `web/lib/households/` as dependency-injected, Vitest-tested TypeScript, plus the thin Next.js wiring (server actions + WebAuthn route handlers + session glue). **No React UI** — login/onboarding pages are deferred to a later plan.

**Architecture:** All real logic lives in `web/lib/auth/` and `web/lib/households/` as functions that take the Drizzle `db` handle (and an explicit `now: Date` where time matters) as parameters, so they are unit-testable against a fresh in-memory SQLite DB with no Next.js request context. The Next.js glue (`getSession`, `requireUser`, `requireHousehold`, server actions, route handlers) is a thin layer that reads cookies, calls a lib function, and sets cookies. Sessions are an opaque random id stored in a new `sessions` table; the browser holds a **signed, httpOnly cookie** carrying that id. WebAuthn uses `@simplewebauthn/server@^13`; passwords use `argon2`. Personal Access Tokens are **dropped** (per design spec) — there is no bearer auth.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM + better-sqlite3 (all from Plan 1), `@simplewebauthn/server@^13`, `argon2`, `zod`. Node `crypto` for HMAC / random ids.

## Global Constraints

- **Dependency-inject the DB.** Every function in `lib/auth/` and `lib/households/` that touches the database takes the Drizzle db handle as its first parameter (`db: Db`). The Next.js glue passes the real `db` from `@/lib/db`; tests pass a fresh in-memory db. No lib function imports the singleton `db` from `@/lib/db`. (spec: "pure, framework-free … unit-testable in isolation … before wiring into any page")
- **Inject `now`, never call `new Date()` in logic.** Any function whose behavior depends on the current time takes `now: Date` as a parameter. Only the thin Next.js wrappers call `new Date()`. (Matches Plan 2's injected-RNG/injected-date discipline.)
- **No bearer auth / no Personal Access Tokens.** PATs are dropped. Auth is session-cookie only. (spec: "Personal Access Tokens dropped")
- **Binary at the DB boundary only.** `credential_id` and `public_key` are Node `Buffer` (BLOB) in the DB — matching Django's raw bytes so migrated passkeys keep working. `@simplewebauthn/server` speaks base64url strings / `Uint8Array`; convert at the boundary with `isoBase64URL` from `@simplewebauthn/server/helpers`. A credential id must never be compared as a string in the DB. (spec: Data layer — "Binary … stored as BLOB")
- **Unusable password = empty string `""`.** The `users.password` column defaults to `""` meaning "no usable password" (matches the Drizzle schema from Plan 1 and Django's `set_unusable_password`). A real argon2 hash always starts with `$argon2`. `hasUsablePassword(hash)` is `hash !== ""`. (web: `lib/db/schema.ts` users.password)
- **Errors carry an HTTP status.** Lib functions throw `AuthError(status, message)` (defined in Task 2) instead of returning error tuples, mirroring Django Ninja's `HttpError`. Tests assert both `status` and `message`. Wrappers translate `AuthError` to HTTP responses.
- **camelCase throughout.** Internal functions and DTOs use camelCase TS. The old snake_case REST wire shape is NOT reproduced — the React frontend that consumed it is being replaced, so there is no compatibility contract to keep.
- **IDs.** User / household / passkey / invite primary keys are `crypto.randomUUID()`. Session ids and invite codes are `crypto.randomBytes(...).toString("base64url")`.
- **All paths below are relative to repo root.** The Next.js app root is `web/`. Run all commands from `web/` unless noted.
- **Tests are co-located** as `<module>.test.ts` next to the source, matching Plans 1–2.
- **Weekday/decimal constraints from Plan 2 do not apply here** — this plan touches no quantity math.

---

### Task 1: Auth dependencies + `sessions` table + `Db` type + test-DB helper

**Files:**
- Modify: `web/package.json` (add deps)
- Modify: `web/lib/db/schema.ts` (add `sessions` table)
- Modify: `web/lib/db/index.ts` (export `Db` type)
- Create: `web/drizzle/0001_*.sql` (generated)
- Create: `web/lib/test/db.ts` (test-DB helper)
- Test: `web/lib/test/db.test.ts`

**Interfaces:**
- Produces:
  - `sessions` table: `{ id: text PK, userId: text FK→users (cascade), expiresAt: timestamp, createdAt: timestamp }`.
  - `type Db` — the Drizzle better-sqlite3 database type, exported from `@/lib/db`.
  - `createTestDb(): Db` — opens a fresh in-memory SQLite db, applies all migrations, enables foreign keys, returns a Drizzle handle. Used by every later test.

- [ ] **Step 1: Install dependencies**

```bash
cd web && npm install @simplewebauthn/server@^13 argon2@^0.41 zod@^3
```
Expected: `package.json` gains `@simplewebauthn/server`, `argon2`, `zod` under `dependencies`.

- [ ] **Step 2: Add the `sessions` table to the schema**

In `web/lib/db/schema.ts`, after the `passkeyCredentials` table, add:
```ts
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```
(If `integer`/`text`/`sqliteTable` are not already imported at the top of the file, they are — this file defines 19 tables already. Do not re-import.)

- [ ] **Step 3: Export the `Db` type**

In `web/lib/db/index.ts`, add:
```ts
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "./schema";

export type Db = BetterSQLite3Database<typeof schemaTypes>;
```
(Keep the existing `export { db, sqlite, getDbPath } from "./client";` and `export * as schema from "./schema";` lines.)

- [ ] **Step 4: Generate the migration**

```bash
cd web && npm run db:generate
```
Expected: a new file `web/drizzle/0001_*.sql` containing `CREATE TABLE \`sessions\` ( ... )`. Verify it references `users(id)` with `ON DELETE cascade`.

- [ ] **Step 5: Write the test-DB helper**

Create `web/lib/test/db.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** A fresh in-memory SQLite DB with all migrations applied. */
export function createTestDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
```

- [ ] **Step 6: Write the failing test**

Create `web/lib/test/db.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./db";

describe("createTestDb", () => {
  it("applies migrations and exposes the sessions table", () => {
    const db = createTestDb();
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'`,
    );
    expect(rows.map((r) => r.name)).toContain("sessions");
  });

  it("enforces foreign keys", () => {
    const db = createTestDb();
    const rows = db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
    expect(rows[0].foreign_keys).toBe(1);
  });
});
```

- [ ] **Step 7: Run the test**

Run: `cd web && npx vitest run lib/test/db.test.ts`
Expected: PASS (2 tests). If `migrate` cannot find migrations, confirm `web/drizzle/` holds both `0000_*.sql` and `0001_*.sql` plus the `meta/` journal.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/db/schema.ts web/lib/db/index.ts web/drizzle web/lib/test/db.ts web/lib/test/db.test.ts
git commit -m "feat: add auth deps, sessions table, and in-memory test-db helper"
```

---

### Task 2: `AuthError` + signed-cookie HMAC helper

**Files:**
- Create: `web/lib/auth/errors.ts`
- Create: `web/lib/auth/signing.ts`
- Test: `web/lib/auth/signing.test.ts`

**Interfaces:**
- Produces:
  - `class AuthError extends Error { status: number }` — `new AuthError(401, "Invalid email or password.")`.
  - `sign(value: string, secret: string): string` — returns `"<value>.<base64url-hmac>"`.
  - `unsign(signed: string, secret: string): string | null` — returns the original value if the HMAC verifies (constant-time), else `null`.

- [ ] **Step 1: Write `AuthError`**

Create `web/lib/auth/errors.ts`:
```ts
/** Mirrors Django Ninja's HttpError: an error that carries an HTTP status code. */
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `web/lib/auth/signing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { sign, unsign } from "./signing";

const SECRET = "test-secret-please-change";

describe("sign/unsign", () => {
  it("round-trips a value", () => {
    const signed = sign("session-id-123", SECRET);
    expect(signed).not.toBe("session-id-123");
    expect(unsign(signed, SECRET)).toBe("session-id-123");
  });

  it("rejects a tampered value", () => {
    const signed = sign("session-id-123", SECRET);
    const tampered = signed.replace("session-id-123", "session-id-999");
    expect(unsign(tampered, SECRET)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const signed = sign("abc", SECRET);
    expect(unsign(signed, "other-secret")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(unsign("no-dot-here", SECRET)).toBeNull();
    expect(unsign("", SECRET)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/signing.test.ts`
Expected: FAIL — cannot find module `./signing`.

- [ ] **Step 4: Write the implementation**

Create `web/lib/auth/signing.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Append an HMAC so the value can be detected if tampered. */
export function sign(value: string, secret: string): string {
  return `${value}.${hmac(value, secret)}`;
}

/** Return the original value iff the signature verifies, else null. */
export function unsign(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const provided = signed.slice(idx + 1);
  const expected = hmac(value, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? value : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/signing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/lib/auth/errors.ts web/lib/auth/signing.ts web/lib/auth/signing.test.ts
git commit -m "feat: add AuthError and HMAC cookie signing helper"
```

---

### Task 3: Auth config + WebAuthn RP resolution

**Files:**
- Create: `web/lib/auth/config.ts`
- Test: `web/lib/auth/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `resolveRpId(host: string, allowedRpIds: string[]): string` — strips the port from `host`; returns it if present in `allowedRpIds`, else `allowedRpIds[0]`. (Port of Django `get_rp_id_for_request`.)
  - `getAuthSecret(): string` — reads `AUTH_SECRET` env (throws if missing in production; falls back to a fixed dev value when `NODE_ENV !== "production"`).
  - `getRpName(): string` — `WEBAUTHN_RP_NAME` env, default `"Cook Less"`.
  - `getAllowedRpIds(): string[]` — `WEBAUTHN_RP_ID` env, comma-split, default `["localhost"]`.
  - `getAllowedOrigins(): string[]` — `WEBAUTHN_ORIGIN` env, comma-split, default `["http://localhost:3000"]`.
  - `SESSION_COOKIE = "cookless_session"`, `SESSION_TTL_MS` (14 days), `CEREMONY_COOKIE = "cookless_ceremony"`, `CEREMONY_TTL_MS` (5 min).

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/config.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveRpId } from "./config";

describe("resolveRpId", () => {
  const allowed = ["localhost", "192.168.1.50"];

  it("strips the port and returns a matching host", () => {
    expect(resolveRpId("localhost:3000", allowed)).toBe("localhost");
    expect(resolveRpId("192.168.1.50:3000", allowed)).toBe("192.168.1.50");
  });

  it("falls back to the first allowed id for an unknown host", () => {
    expect(resolveRpId("evil.example.com", allowed)).toBe("localhost");
  });

  it("handles a host with no port", () => {
    expect(resolveRpId("localhost", allowed)).toBe("localhost");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/config.ts`:
```ts
export const SESSION_COOKIE = "cookless_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (Django default)
export const CEREMONY_COOKIE = "cookless_ceremony";
export const CEREMONY_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DEV_SECRET = "dev-insecure-secret-change-me";

function splitEnv(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return DEV_SECRET;
}

export function getRpName(): string {
  return process.env.WEBAUTHN_RP_NAME ?? "Cook Less";
}

export function getAllowedRpIds(): string[] {
  return splitEnv(process.env.WEBAUTHN_RP_ID, ["localhost"]);
}

export function getAllowedOrigins(): string[] {
  return splitEnv(process.env.WEBAUTHN_ORIGIN, ["http://localhost:3000"]);
}

/** Port of Django get_rp_id_for_request: host without port if allowed, else first allowed id. */
export function resolveRpId(host: string, allowedRpIds: string[]): string {
  const bare = host.split(":")[0];
  return allowedRpIds.includes(bare) ? bare : allowedRpIds[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/config.ts web/lib/auth/config.test.ts
git commit -m "feat: add auth config and WebAuthn RP-id resolution"
```

---

### Task 4: Password hashing + Django-equivalent validation

**Files:**
- Create: `web/lib/auth/common-passwords.ts`
- Create: `web/lib/auth/password.ts`
- Test: `web/lib/auth/password.test.ts`

**Interfaces:**
- Produces:
  - `UNUSABLE_PASSWORD = ""`.
  - `hasUsablePassword(hash: string): boolean` — `hash !== ""`.
  - `hashPassword(plain: string): Promise<string>` — argon2id hash.
  - `verifyPassword(hash: string, plain: string): Promise<boolean>` — false for an unusable (`""`) hash.
  - `validatePassword(password: string, opts?: { email?: string }): void` — throws `AuthError(400, msg)` on the first failing rule. Ports Django's four validators: minimum length 8, not all-numeric, not a common password, not too similar to the email.

- [ ] **Step 1: Write the common-password subset**

Create `web/lib/auth/common-passwords.ts`:
```ts
// Subset of Django's 20k CommonPasswordValidator list — covers the realistic weak
// passwords the ported tests assert against. Fidelity trade-off acknowledged in the
// migration design (we give up the batteries-included Django auth stack).
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password", "password1", "password123", "passw0rd", "123456", "1234567",
  "12345678", "123456789", "1234567890", "qwerty", "qwerty123", "abc123",
  "111111", "123123", "000000", "iloveyou", "admin", "welcome", "monkey",
  "dragon", "letmein", "football", "princess", "sunshine", "shadow",
  "master", "superman", "trustno1", "baseball", "whatever", "starwars",
]);
```

- [ ] **Step 2: Write the failing test**

Create `web/lib/auth/password.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { AuthError } from "./errors";
import {
  hashPassword,
  hasUsablePassword,
  validatePassword,
  verifyPassword,
} from "./password";

describe("hashPassword/verifyPassword", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("treats empty hash as unusable", async () => {
    expect(hasUsablePassword("")).toBe(false);
    expect(hasUsablePassword("$argon2id$...")).toBe(true);
    expect(await verifyPassword("", "anything")).toBe(false);
  });
});

describe("validatePassword", () => {
  const ok = "Tr0ub4dour&3xplore";

  it("accepts a strong password", () => {
    expect(() => validatePassword(ok, { email: "alice@example.com" })).not.toThrow();
  });

  it("rejects passwords shorter than 8 chars", () => {
    expect(() => validatePassword("Ab1!", {})).toThrow(AuthError);
  });

  it("rejects all-numeric passwords", () => {
    expect(() => validatePassword("48572916", {})).toThrow(/numeric/i);
  });

  it("rejects common passwords", () => {
    expect(() => validatePassword("password123", {})).toThrow(/common/i);
  });

  it("rejects passwords too similar to the email", () => {
    expect(() => validatePassword("alice123", { email: "alice@example.com" })).toThrow(
      /similar/i,
    );
  });

  it("surfaces AuthError status 400", () => {
    try {
      validatePassword("short", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(400);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/password.test.ts`
Expected: FAIL — cannot find module `./password`.

- [ ] **Step 4: Write the implementation**

Create `web/lib/auth/password.ts`:
```ts
import argon2 from "argon2";
import { AuthError } from "./errors";
import { COMMON_PASSWORDS } from "./common-passwords";

export const UNUSABLE_PASSWORD = "";

export function hasUsablePassword(hash: string): boolean {
  return hash !== UNUSABLE_PASSWORD;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hasUsablePassword(hash)) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Python difflib.SequenceMatcher.quick_ratio — what Django's similarity validator uses. */
function quickRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const ch of b) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let matches = 0;
  for (const ch of a) {
    const n = counts.get(ch) ?? 0;
    if (n > 0) {
      matches += 1;
      counts.set(ch, n - 1);
    }
  }
  return (2 * matches) / (a.length + b.length);
}

const MAX_SIMILARITY = 0.7;

/** Ports Django's AUTH_PASSWORD_VALIDATORS chain; throws AuthError(400) on first failure. */
export function validatePassword(password: string, opts: { email?: string } = {}): void {
  // 1. UserAttributeSimilarityValidator (against the email and its parts).
  const email = opts.email?.toLowerCase();
  if (email) {
    const parts = new Set<string>([email, ...email.split(/[^a-z0-9]+/i)]);
    for (const part of parts) {
      if (part.length < 3) continue;
      if (quickRatio(password.toLowerCase(), part) >= MAX_SIMILARITY) {
        throw new AuthError(400, "The password is too similar to the email address.");
      }
    }
  }
  // 2. MinimumLengthValidator.
  if (password.length < 8) {
    throw new AuthError(400, "This password is too short. It must contain at least 8 characters.");
  }
  // 3. CommonPasswordValidator.
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new AuthError(400, "This password is too common.");
  }
  // 4. NumericPasswordValidator.
  if (/^\d+$/.test(password)) {
    throw new AuthError(400, "This password is entirely numeric.");
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/password.test.ts`
Expected: PASS (8 tests). argon2 hashing is slow (~100ms/hash); this is fine.

- [ ] **Step 6: Commit**

```bash
git add web/lib/auth/common-passwords.ts web/lib/auth/password.ts web/lib/auth/password.test.ts
git commit -m "feat: add argon2 password hashing and Django-equivalent validation"
```

---

### Task 5: Session store (DB operations)

**Files:**
- Create: `web/lib/auth/session-store.ts`
- Test: `web/lib/auth/session-store.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 1).
- Produces:
  - `createSession(db: Db, userId: string, now: Date): string` — inserts a row with a fresh random id, `expiresAt = now + SESSION_TTL_MS`; returns the session id.
  - `loadSession(db: Db, sessionId: string, now: Date): User | null` — returns the user row if the session exists and has not expired; deletes and returns `null` if expired or missing.
  - `deleteSession(db: Db, sessionId: string): void`.
  - `deleteUserSessions(db: Db, userId: string): void` — used when a user's auth materially changes.
  - `type User` = `typeof users.$inferSelect`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/session-store.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { users } from "@/lib/db/schema";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  loadSession,
} from "./session-store";

function makeUser(db: ReturnType<typeof createTestDb>, now: Date) {
  const id = crypto.randomUUID();
  db.insert(users).values({ id, email: `${id}@x.test`, createdAt: now }).run();
  return id;
}

describe("session store", () => {
  const now = new Date("2026-06-27T12:00:00Z");

  it("creates and loads a session", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const sid = createSession(db, userId, now);
    const user = loadSession(db, sid, now);
    expect(user?.id).toBe(userId);
  });

  it("returns null for an unknown session", () => {
    const db = createTestDb();
    expect(loadSession(db, "nope", now)).toBeNull();
  });

  it("expires and deletes a stale session", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const sid = createSession(db, userId, now);
    const later = new Date("2026-07-20T12:00:00Z"); // > 14 days later
    expect(loadSession(db, sid, later)).toBeNull();
    // second load confirms the row was deleted (still null, no throw)
    expect(loadSession(db, sid, later)).toBeNull();
  });

  it("deletes a session explicitly", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const sid = createSession(db, userId, now);
    deleteSession(db, sid);
    expect(loadSession(db, sid, now)).toBeNull();
  });

  it("deletes all sessions for a user", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const a = createSession(db, userId, now);
    const b = createSession(db, userId, now);
    deleteUserSessions(db, userId);
    expect(loadSession(db, a, now)).toBeNull();
    expect(loadSession(db, b, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/session-store.test.ts`
Expected: FAIL — cannot find module `./session-store`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/session-store.ts`:
```ts
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { SESSION_TTL_MS } from "./config";

export type User = typeof users.$inferSelect;

export function createSession(db: Db, userId: string, now: Date): string {
  const id = randomBytes(32).toString("base64url");
  db.insert(sessions)
    .values({
      id,
      userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
    .run();
  return id;
}

export function loadSession(db: Db, sessionId: string, now: Date): User | null {
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    deleteSession(db, sessionId);
    return null;
  }
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  return user ?? null;
}

export function deleteSession(db: Db, sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function deleteUserSessions(db: Db, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
```
Note: `randomUUID` is imported for parity with other modules but `createSession` uses `randomBytes` for a higher-entropy opaque id. Remove the unused import if your lint config flags it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/session-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/session-store.ts web/lib/auth/session-store.test.ts
git commit -m "feat: add session store DB operations"
```

---

### Task 6: Household-access guard (pure decision logic)

**Files:**
- Create: `web/lib/auth/scoping.ts`
- Test: `web/lib/auth/scoping.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 1), `User` (Task 5), `AuthError` (Task 2).
- Produces:
  - `isHouseholdMember(db: Db, userId: string, householdId: string): boolean`.
  - `assertHouseholdAccess(user: User, isMember: boolean): { user: User; householdId: string }` — pure; throws `AuthError(403, ...)` if the user has no `activeHouseholdId` or `isMember` is false. This is the decision core of `requireHousehold` (the Next glue in Task 20 calls `isHouseholdMember` then this).

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/scoping.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { assertHouseholdAccess, isHouseholdMember } from "./scoping";
import type { User } from "./session-store";

const now = new Date("2026-06-27T12:00:00Z");

function user(over: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "u@x.test",
    password: "",
    preferredLanguage: "en",
    activeHouseholdId: null,
    onboardingStep: "COMPLETED",
    isActive: true,
    isStaff: false,
    createdAt: now,
    ...over,
  };
}

describe("isHouseholdMember", () => {
  it("reflects membership rows", () => {
    const db = createTestDb();
    db.insert(users).values(user()).run();
    db.insert(households).values({ id: "h1", name: "H", createdAt: now }).run();
    expect(isHouseholdMember(db, "u1", "h1")).toBe(false);
    db.insert(householdMembers).values({ householdId: "h1", userId: "u1", joinedAt: now }).run();
    expect(isHouseholdMember(db, "u1", "h1")).toBe(true);
  });
});

describe("assertHouseholdAccess", () => {
  it("returns user + householdId when member of active household", () => {
    const result = assertHouseholdAccess(user({ activeHouseholdId: "h1" }), true);
    expect(result.householdId).toBe("h1");
  });

  it("throws 403 when no active household", () => {
    expect(() => assertHouseholdAccess(user({ activeHouseholdId: null }), true)).toThrow(AuthError);
  });

  it("throws 403 when not a member", () => {
    try {
      assertHouseholdAccess(user({ activeHouseholdId: "h1" }), false);
      throw new Error("should throw");
    } catch (e) {
      expect((e as AuthError).status).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/scoping.test.ts`
Expected: FAIL — cannot find module `./scoping`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/scoping.ts`:
```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers } from "@/lib/db/schema";
import { AuthError } from "./errors";
import type { User } from "./session-store";

export function isHouseholdMember(db: Db, userId: string, householdId: string): boolean {
  const row = db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)))
    .get();
  return row != null;
}

/** Decision core of requireHousehold (port of Django require_household_member). */
export function assertHouseholdAccess(
  user: User,
  isMember: boolean,
): { user: User; householdId: string } {
  if (!user.activeHouseholdId) {
    throw new AuthError(403, "No active household");
  }
  if (!isMember) {
    throw new AuthError(403, "Not a member of active household");
  }
  return { user, householdId: user.activeHouseholdId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/scoping.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/scoping.ts web/lib/auth/scoping.test.ts
git commit -m "feat: add household-access guard logic"
```

---

### Task 7: User serialization (UserDto)

**Files:**
- Create: `web/lib/auth/serialize.ts`
- Test: `web/lib/auth/serialize.test.ts`

**Interfaces:**
- Consumes: `Db`, `User`, `hasUsablePassword` (Task 4).
- Produces:
  - `interface UserDto { id; email; preferredLanguage; onboardingStep; isStaff; hasPassword; hasPasskey; activeHousehold: { id; name } | null }`.
  - `serializeUser(db: Db, user: User): UserDto` — ports Django `UserOut` (computes `hasPassword`, `hasPasskey`, embeds the active household summary).

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/serialize.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, passkeyCredentials, users } from "@/lib/db/schema";
import { serializeUser } from "./serialize";
import type { User } from "./session-store";

const now = new Date("2026-06-27T12:00:00Z");

describe("serializeUser", () => {
  it("computes hasPassword/hasPasskey and embeds the active household", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    const u: User = {
      id: "u1", email: "a@x.test", password: "$argon2id$x", preferredLanguage: "de",
      activeHouseholdId: "h1", onboardingStep: "COMPLETED", isActive: true, isStaff: false,
      createdAt: now,
    };
    db.insert(users).values(u).run();
    db.insert(passkeyCredentials).values({
      id: "p1", userId: "u1", credentialId: Buffer.from([1, 2, 3]),
      publicKey: Buffer.from([4, 5]), signCount: 0, deviceName: "Phone", createdAt: now,
    }).run();

    const dto = serializeUser(db, u);
    expect(dto).toMatchObject({
      id: "u1", email: "a@x.test", preferredLanguage: "de", onboardingStep: "COMPLETED",
      isStaff: false, hasPassword: true, hasPasskey: true,
      activeHousehold: { id: "h1", name: "Home" },
    });
  });

  it("reports no password/passkey/household for a bare user", () => {
    const db = createTestDb();
    const u: User = {
      id: "u2", email: "b@x.test", password: "", preferredLanguage: "en",
      activeHouseholdId: null, onboardingStep: "CHANGE_PASSWORD", isActive: true, isStaff: false,
      createdAt: now,
    };
    db.insert(users).values(u).run();
    const dto = serializeUser(db, u);
    expect(dto.hasPassword).toBe(false);
    expect(dto.hasPasskey).toBe(false);
    expect(dto.activeHousehold).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/serialize.test.ts`
Expected: FAIL — cannot find module `./serialize`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/serialize.ts`:
```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, passkeyCredentials } from "@/lib/db/schema";
import { hasUsablePassword } from "./password";
import type { User } from "./session-store";

export interface UserDto {
  id: string;
  email: string;
  preferredLanguage: string;
  onboardingStep: string;
  isStaff: boolean;
  hasPassword: boolean;
  hasPasskey: boolean;
  activeHousehold: { id: string; name: string } | null;
}

export function serializeUser(db: Db, user: User): UserDto {
  const passkey = db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, user.id))
    .get();

  let activeHousehold: { id: string; name: string } | null = null;
  if (user.activeHouseholdId) {
    const h = db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(eq(households.id, user.activeHouseholdId))
      .get();
    activeHousehold = h ?? null;
  }

  return {
    id: user.id,
    email: user.email,
    preferredLanguage: user.preferredLanguage,
    onboardingStep: user.onboardingStep,
    isStaff: user.isStaff,
    hasPassword: hasUsablePassword(user.password),
    hasPasskey: passkey != null,
    activeHousehold,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/serialize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/serialize.ts web/lib/auth/serialize.test.ts
git commit -m "feat: add user serialization (UserDto)"
```

---

### Task 8: WebAuthn wrappers (`@simplewebauthn/server`)

**Files:**
- Create: `web/lib/auth/webauthn.ts`
- Test: `web/lib/auth/webauthn.test.ts`

**Interfaces:**
- Consumes: `getRpName`, `getAllowedOrigins` (Task 3).
- Produces:
  - `bufToB64url(buf: Buffer): string` and `b64urlToBuf(s: string): Buffer` — DB-blob ⇄ base64url conversions.
  - `getRegistrationOptions(args: { userId: string; userEmail: string; rpId: string; excludeCredentialIds: Buffer[] }): Promise<PublicKeyCredentialCreationOptionsJSON>`.
  - `verifyRegistration(args: { responseJson: string; expectedChallenge: string; rpId: string }): Promise<{ credentialId: Buffer; publicKey: Buffer; signCount: number }>` — throws `AuthError(400, ...)` if `verified` is false.
  - `getAuthenticationOptions(args: { rpId: string; allowCredentialIds: Buffer[] }): Promise<PublicKeyCredentialRequestOptionsJSON>`.
  - `verifyAuthentication(args: { responseJson: string; expectedChallenge: string; rpId: string; credentialId: Buffer; publicKey: Buffer; signCount: number }): Promise<{ newSignCount: number }>` — throws `AuthError(400, ...)` if `verified` is false.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/webauthn.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  b64urlToBuf,
  bufToB64url,
  getAuthenticationOptions,
  getRegistrationOptions,
} from "./webauthn";

describe("buffer/base64url conversions", () => {
  it("round-trips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 255]);
    expect(b64urlToBuf(bufToB64url(buf)).equals(buf)).toBe(true);
  });
});

describe("getRegistrationOptions", () => {
  it("returns a challenge and excludes existing credentials", async () => {
    const opts = await getRegistrationOptions({
      userId: "temp-id",
      userEmail: "a@x.test",
      rpId: "localhost",
      excludeCredentialIds: [Buffer.from([9, 9, 9])],
    });
    expect(typeof opts.challenge).toBe("string");
    expect(opts.rp.id).toBe("localhost");
    expect(opts.excludeCredentials?.[0]?.id).toBe(bufToB64url(Buffer.from([9, 9, 9])));
  });
});

describe("getAuthenticationOptions", () => {
  it("returns a challenge and allows the given credentials", async () => {
    const opts = await getAuthenticationOptions({
      rpId: "localhost",
      allowCredentialIds: [Buffer.from([1, 2, 3])],
    });
    expect(typeof opts.challenge).toBe("string");
    expect(opts.allowCredentials?.[0]?.id).toBe(bufToB64url(Buffer.from([1, 2, 3])));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/webauthn.test.ts`
Expected: FAIL — cannot find module `./webauthn`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/webauthn.ts`:
```ts
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { getAllowedOrigins, getRpName } from "./config";
import { AuthError } from "./errors";

export function bufToB64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export async function getRegistrationOptions(args: {
  userId: string;
  userEmail: string;
  rpId: string;
  excludeCredentialIds: Buffer[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: getRpName(),
    rpID: args.rpId,
    userID: new TextEncoder().encode(args.userId),
    userName: args.userEmail,
    attestationType: "none",
    excludeCredentials: args.excludeCredentialIds.map((id) => ({ id: bufToB64url(id) })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
}

export async function verifyRegistration(args: {
  responseJson: string;
  expectedChallenge: string;
  rpId: string;
}): Promise<{ credentialId: Buffer; publicKey: Buffer; signCount: number }> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: JSON.parse(args.responseJson),
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: getAllowedOrigins(),
      expectedRPID: args.rpId,
      requireUserVerification: true,
    });
  } catch (e) {
    throw new AuthError(400, `WebAuthn verification failed: ${(e as Error).message}`);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new AuthError(400, "WebAuthn registration could not be verified.");
  }
  const cred = verification.registrationInfo.credential;
  return {
    credentialId: b64urlToBuf(cred.id),
    publicKey: Buffer.from(cred.publicKey),
    signCount: cred.counter,
  };
}

export async function getAuthenticationOptions(args: {
  rpId: string;
  allowCredentialIds: Buffer[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: args.rpId,
    allowCredentials: args.allowCredentialIds.map((id) => ({ id: bufToB64url(id) })),
    userVerification: "required",
  });
}

export async function verifyAuthentication(args: {
  responseJson: string;
  expectedChallenge: string;
  rpId: string;
  credentialId: Buffer;
  publicKey: Buffer;
  signCount: number;
}): Promise<{ newSignCount: number }> {
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: JSON.parse(args.responseJson),
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: getAllowedOrigins(),
      expectedRPID: args.rpId,
      requireUserVerification: true,
      credential: {
        id: bufToB64url(args.credentialId),
        publicKey: new Uint8Array(args.publicKey),
        counter: args.signCount,
      },
    });
  } catch (e) {
    throw new AuthError(400, `WebAuthn verification failed: ${(e as Error).message}`);
  }
  if (!verification.verified) {
    throw new AuthError(400, "WebAuthn authentication could not be verified.");
  }
  return { newSignCount: verification.authenticationInfo.newCounter };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/webauthn.test.ts`
Expected: PASS (3 tests). If `@simplewebauthn/server` exposes the option types under a different path in the installed version, import the option-JSON types from `@simplewebauthn/server` (they are re-exported there in v13); do not change behavior.

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/webauthn.ts web/lib/auth/webauthn.test.ts
git commit -m "feat: add @simplewebauthn server wrappers with blob conversions"
```

---

### Task 9: Ceremony-state cookie (in-flight WebAuthn challenge)

**Files:**
- Create: `web/lib/auth/ceremony.ts`
- Test: `web/lib/auth/ceremony.test.ts`

**Interfaces:**
- Consumes: `sign`, `unsign` (Task 2).
- Produces:
  - `interface CeremonyState { type: "register" | "login" | "add"; challenge: string; email?: string; inviteCode?: string; tempUserId?: string }`.
  - `encodeCeremony(state: CeremonyState, secret: string): string` — JSON → base64url → signed cookie value.
  - `decodeCeremony(cookieValue: string, secret: string): CeremonyState | null` — returns `null` on bad signature / malformed JSON.

The Django session stored challenge + email + invite-code + temp user id during a ceremony. With no pre-auth session, we carry that state in a short-lived signed httpOnly cookie instead (the Next glue in Task 20 sets/reads/clears it).

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/ceremony.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { decodeCeremony, encodeCeremony, type CeremonyState } from "./ceremony";

const SECRET = "s3cret";

describe("ceremony cookie", () => {
  const state: CeremonyState = {
    type: "register",
    challenge: "abc123",
    email: "a@x.test",
    inviteCode: "inv-1",
    tempUserId: "tmp-1",
  };

  it("round-trips state", () => {
    const cookie = encodeCeremony(state, SECRET);
    expect(decodeCeremony(cookie, SECRET)).toEqual(state);
  });

  it("rejects a tampered cookie", () => {
    const cookie = encodeCeremony(state, SECRET);
    expect(decodeCeremony(cookie + "x", SECRET)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const cookie = encodeCeremony(state, SECRET);
    expect(decodeCeremony(cookie, "other")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/ceremony.test.ts`
Expected: FAIL — cannot find module `./ceremony`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/ceremony.ts`:
```ts
import { sign, unsign } from "./signing";

export interface CeremonyState {
  type: "register" | "login" | "add";
  challenge: string;
  email?: string;
  inviteCode?: string;
  tempUserId?: string;
}

export function encodeCeremony(state: CeremonyState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return sign(payload, secret);
}

export function decodeCeremony(cookieValue: string, secret: string): CeremonyState | null {
  const payload = unsign(cookieValue, secret);
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CeremonyState;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/ceremony.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/ceremony.ts web/lib/auth/ceremony.test.ts
git commit -m "feat: add signed ceremony-state cookie for WebAuthn flows"
```

---

### Task 10: Invites (validate / generate / create / consume)

**Files:**
- Create: `web/lib/households/invites.ts`
- Test: `web/lib/households/invites.test.ts`

**Interfaces:**
- Consumes: `Db`, `AuthError`.
- Produces:
  - `type Invite = typeof invites.$inferSelect`.
  - `INVITE_TTL_MS` (7 days).
  - `generateInviteCode(): string`.
  - `createInvite(db: Db, args: { householdId: string; createdById: string }, now: Date): Invite`.
  - `validateInvite(db: Db, code: string, now: Date): Invite` — throws `AuthError(400, ...)` for not-found / expired / already-used.
  - `consumeInvite(db: Db, inviteId: string, userId: string): void` — sets `usedById`.
  - `getInviteSummary(db: Db, code: string, now: Date): { householdName: string; expiresAt: Date }` — public invite preview (port of `GET /invites/{code}/`).

- [ ] **Step 1: Write the failing test**

Create `web/lib/households/invites.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, users } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import {
  consumeInvite,
  createInvite,
  generateInviteCode,
  getInviteSummary,
  validateInvite,
} from "./invites";

const now = new Date("2026-06-27T12:00:00Z");

function seed(db: ReturnType<typeof createTestDb>) {
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(users).values({ id: "owner", email: "o@x.test", createdAt: now }).run();
}

describe("invites", () => {
  it("creates a 7-day invite with a unique code", () => {
    const db = createTestDb();
    seed(db);
    const inv = createInvite(db, { householdId: "h1", createdById: "owner" }, now);
    expect(inv.code).toBeTruthy();
    expect(inv.expiresAt.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("validates a good invite", () => {
    const db = createTestDb();
    seed(db);
    const inv = createInvite(db, { householdId: "h1", createdById: "owner" }, now);
    expect(validateInvite(db, inv.code, now).id).toBe(inv.id);
  });

  it("rejects unknown / expired / used invites", () => {
    const db = createTestDb();
    seed(db);
    expect(() => validateInvite(db, "nope", now)).toThrow(/invalid/i);

    const inv = createInvite(db, { householdId: "h1", createdById: "owner" }, now);
    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(() => validateInvite(db, inv.code, later)).toThrow(/expired/i);

    db.insert(users).values({ id: "u2", email: "u2@x.test", createdAt: now }).run();
    consumeInvite(db, inv.id, "u2");
    expect(() => validateInvite(db, inv.code, now)).toThrow(/already/i);
  });

  it("exposes a public summary", () => {
    const db = createTestDb();
    seed(db);
    const inv = createInvite(db, { householdId: "h1", createdById: "owner" }, now);
    expect(getInviteSummary(db, inv.code, now).householdName).toBe("Home");
  });

  it("generates distinct codes", () => {
    expect(generateInviteCode()).not.toBe(generateInviteCode());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/households/invites.test.ts`
Expected: FAIL — cannot find module `./invites`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/households/invites.ts`:
```ts
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, invites } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";

export type Invite = typeof invites.$inferSelect;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteCode(): string {
  return randomBytes(16).toString("base64url");
}

export function createInvite(
  db: Db,
  args: { householdId: string; createdById: string },
  now: Date,
): Invite {
  return db
    .insert(invites)
    .values({
      id: randomUUID(),
      householdId: args.householdId,
      createdById: args.createdById,
      code: generateInviteCode(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .returning()
    .get();
}

export function validateInvite(db: Db, code: string, now: Date): Invite {
  const inv = db.select().from(invites).where(eq(invites.code, code)).get();
  if (!inv) throw new AuthError(400, "Invalid invite code.");
  if (inv.expiresAt.getTime() <= now.getTime()) throw new AuthError(400, "This invite has expired.");
  if (inv.usedById) throw new AuthError(400, "This invite has already been used.");
  return inv;
}

export function consumeInvite(db: Db, inviteId: string, userId: string): void {
  db.update(invites).set({ usedById: userId }).where(eq(invites.id, inviteId)).run();
}

export function getInviteSummary(
  db: Db,
  code: string,
  now: Date,
): { householdName: string; expiresAt: Date } {
  const inv = validateInvite(db, code, now);
  const h = db.select().from(households).where(eq(households.id, inv.householdId)).get();
  if (!h) throw new AuthError(400, "Invalid invite code.");
  return { householdName: h.name, expiresAt: inv.expiresAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/households/invites.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/households/invites.ts web/lib/households/invites.test.ts
git commit -m "feat: add invite create/validate/consume logic"
```

---

### Task 11: Registration — password

**Files:**
- Create: `web/lib/auth/register.ts`
- Test: `web/lib/auth/register.test.ts`

**Interfaces:**
- Consumes: `Db`, `validateInvite`, `consumeInvite`, `hashPassword`, `validatePassword`, `AuthError`.
- Produces:
  - `registerWithPassword(db: Db, args: { email: string; password: string; inviteCode: string }, now: Date): Promise<User>` — validates invite, rejects taken email (409), validates password, creates the user with a hashed password, adds a `householdMembers` row (role `OWNER` if the invite's creator is inactive, else `MEMBER`), sets `activeHouseholdId` to the invite's household, sets `onboardingStep = "COMPLETED"`, consumes the invite. Returns the created user row. **Does not create a session** — the wrapper does that.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/register.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { createInvite } from "@/lib/households/invites";
import { hasUsablePassword, verifyPassword } from "./password";
import { registerWithPassword } from "./register";

const now = new Date("2026-06-27T12:00:00Z");

function seed(db: ReturnType<typeof createTestDb>, ownerActive = true) {
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(users).values({ id: "owner", email: "o@x.test", isActive: ownerActive, createdAt: now }).run();
  return createInvite(db, { householdId: "h1", createdById: "owner" }, now);
}

describe("registerWithPassword", () => {
  it("creates a completed user with a hashed password and MEMBER role", async () => {
    const db = createTestDb();
    const inv = seed(db);
    const user = await registerWithPassword(
      db,
      { email: "new@x.test", password: "Tr0ub4dour&3", inviteCode: inv.code },
      now,
    );
    expect(user.onboardingStep).toBe("COMPLETED");
    expect(user.activeHouseholdId).toBe("h1");
    expect(hasUsablePassword(user.password)).toBe(true);
    expect(await verifyPassword(user.password, "Tr0ub4dour&3")).toBe(true);

    const member = db.select().from(householdMembers).where(eq(householdMembers.userId, user.id)).get();
    expect(member?.role).toBe("MEMBER");
    const consumed = db.select().from(users).where(eq(users.id, user.id)).get();
    expect(consumed).toBeTruthy();
  });

  it("promotes to OWNER when the invite creator is inactive (bootstrap)", async () => {
    const db = createTestDb();
    const inv = seed(db, false);
    const user = await registerWithPassword(
      db,
      { email: "boss@x.test", password: "Tr0ub4dour&3", inviteCode: inv.code },
      now,
    );
    const member = db.select().from(householdMembers).where(eq(householdMembers.userId, user.id)).get();
    expect(member?.role).toBe("OWNER");
  });

  it("rejects a taken email with 409", async () => {
    const db = createTestDb();
    const inv = seed(db);
    db.insert(users).values({ id: "dup", email: "dup@x.test", createdAt: now }).run();
    await expect(
      registerWithPassword(db, { email: "dup@x.test", password: "Tr0ub4dour&3", inviteCode: inv.code }, now),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an invalid invite", async () => {
    const db = createTestDb();
    seed(db);
    await expect(
      registerWithPassword(db, { email: "x@x.test", password: "Tr0ub4dour&3", inviteCode: "bad" }, now),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a weak password", async () => {
    const db = createTestDb();
    const inv = seed(db);
    await expect(
      registerWithPassword(db, { email: "x@x.test", password: "short", inviteCode: inv.code }, now),
    ).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/register.test.ts`
Expected: FAIL — cannot find module `./register`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/register.ts`:
```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { consumeInvite, validateInvite } from "@/lib/households/invites";
import { AuthError } from "./errors";
import { hashPassword, validatePassword } from "./password";
import type { User } from "./session-store";

/** Role for a newly-registered user: OWNER if the invite creator is inactive (bootstrap), else MEMBER. */
export function roleForInviteCreator(db: Db, createdById: string): "OWNER" | "MEMBER" {
  const creator = db.select().from(users).where(eq(users.id, createdById)).get();
  return creator && !creator.isActive ? "OWNER" : "MEMBER";
}

export async function registerWithPassword(
  db: Db,
  args: { email: string; password: string; inviteCode: string },
  now: Date,
): Promise<User> {
  const invite = validateInvite(db, args.inviteCode, now);
  if (db.select().from(users).where(eq(users.email, args.email)).get()) {
    throw new AuthError(409, "A user with this email already exists.");
  }
  validatePassword(args.password, { email: args.email });

  const user = db
    .insert(users)
    .values({
      id: randomUUID(),
      email: args.email,
      password: await hashPassword(args.password),
      activeHouseholdId: invite.householdId,
      onboardingStep: "COMPLETED",
      createdAt: now,
    })
    .returning()
    .get();

  db.insert(householdMembers)
    .values({
      householdId: invite.householdId,
      userId: user.id,
      role: roleForInviteCreator(db, invite.createdById),
      joinedAt: now,
    })
    .run();

  consumeInvite(db, invite.id, user.id);
  return user;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/register.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/register.ts web/lib/auth/register.test.ts
git commit -m "feat: add password registration flow"
```

---

### Task 12: Login — password

**Files:**
- Create: `web/lib/auth/login.ts`
- Test: `web/lib/auth/login.test.ts`

**Interfaces:**
- Consumes: `Db`, `verifyPassword`, `AuthError`, `User`.
- Produces:
  - `loginWithPassword(db: Db, args: { email: string; password: string }): Promise<User>` — throws `AuthError(401, "Invalid email or password.")` for unknown email OR wrong password (no user enumeration). Returns the user row.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/login.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "./password";
import { loginWithPassword } from "./login";

const now = new Date("2026-06-27T12:00:00Z");

describe("loginWithPassword", () => {
  it("returns the user on correct credentials", async () => {
    const db = createTestDb();
    db.insert(users).values({
      id: "u1", email: "a@x.test", password: await hashPassword("Tr0ub4dour&3"), createdAt: now,
    }).run();
    const user = await loginWithPassword(db, { email: "a@x.test", password: "Tr0ub4dour&3" });
    expect(user.id).toBe("u1");
  });

  it("rejects a wrong password with 401", async () => {
    const db = createTestDb();
    db.insert(users).values({
      id: "u1", email: "a@x.test", password: await hashPassword("Tr0ub4dour&3"), createdAt: now,
    }).run();
    await expect(loginWithPassword(db, { email: "a@x.test", password: "nope" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects an unknown email with 401", async () => {
    const db = createTestDb();
    await expect(loginWithPassword(db, { email: "ghost@x.test", password: "x" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a user with no usable password with 401", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u2", email: "b@x.test", password: "", createdAt: now }).run();
    await expect(loginWithPassword(db, { email: "b@x.test", password: "anything" })).rejects.toMatchObject(
      { status: 401 },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/login.test.ts`
Expected: FAIL — cannot find module `./login`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/login.ts`:
```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { verifyPassword } from "./password";
import type { User } from "./session-store";

export async function loginWithPassword(
  db: Db,
  args: { email: string; password: string },
): Promise<User> {
  const user = db.select().from(users).where(eq(users.email, args.email)).get();
  if (!user || !(await verifyPassword(user.password, args.password))) {
    throw new AuthError(401, "Invalid email or password.");
  }
  return user;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/login.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/login.ts web/lib/auth/login.test.ts
git commit -m "feat: add password login flow"
```

---

### Task 13: Registration & login — passkey

**Files:**
- Create: `web/lib/auth/passkey-auth.ts`
- Test: `web/lib/auth/passkey-auth.test.ts`

**Interfaces:**
- Consumes: `Db`, `webauthn.ts` wrappers, invites, `CeremonyState`, `AuthError`, `User`.
- Produces:
  - `beginPasskeyRegistration(db, args: { email; inviteCode }, rpId, now): Promise<{ options; ceremony: CeremonyState }>` — validates invite + email-not-taken, generates registration options, returns options + the ceremony state the wrapper will store.
  - `completePasskeyRegistration(db, args: { responseJson; deviceName }, ceremony, rpId, now): Promise<User>` — verifies, re-validates invite + email, creates user + passkey + membership (OWNER/MEMBER as in Task 11) + active household + `COMPLETED`, consumes invite.
  - `beginPasskeyLogin(db, args: { email }, rpId): Promise<{ options; ceremony: CeremonyState }>` — requires the user to have ≥1 passkey.
  - `completePasskeyLogin(db, args: { responseJson }, ceremony, rpId): Promise<User>` — looks up the credential by id, verifies, updates `signCount`, returns the user.

These tasks mock the `webauthn.ts` verify functions (a real authenticator response cannot be fabricated in a unit test) but exercise the real DB side-effects.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/passkey-auth.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, passkeyCredentials, users } from "@/lib/db/schema";
import { createInvite } from "@/lib/households/invites";

vi.mock("./webauthn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./webauthn")>();
  return {
    ...actual,
    getRegistrationOptions: vi.fn(async () => ({ challenge: "chal-reg" })),
    getAuthenticationOptions: vi.fn(async () => ({ challenge: "chal-login" })),
    verifyRegistration: vi.fn(async () => ({
      credentialId: Buffer.from([1, 2, 3]),
      publicKey: Buffer.from([4, 5, 6]),
      signCount: 0,
    })),
    verifyAuthentication: vi.fn(async () => ({ newSignCount: 7 })),
  };
});

import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  completePasskeyLogin,
  completePasskeyRegistration,
} from "./passkey-auth";

const now = new Date("2026-06-27T12:00:00Z");

function seedInvite(db: ReturnType<typeof createTestDb>) {
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(users).values({ id: "owner", email: "o@x.test", createdAt: now }).run();
  return createInvite(db, { householdId: "h1", createdById: "owner" }, now);
}

describe("passkey registration", () => {
  it("begin returns options + ceremony for a fresh email", async () => {
    const db = createTestDb();
    const inv = seedInvite(db);
    const { ceremony } = await beginPasskeyRegistration(db, { email: "new@x.test", inviteCode: inv.code }, "localhost", now);
    expect(ceremony).toMatchObject({ type: "register", challenge: "chal-reg", email: "new@x.test", inviteCode: inv.code });
  });

  it("begin rejects a taken email", async () => {
    const db = createTestDb();
    const inv = seedInvite(db);
    db.insert(users).values({ id: "dup", email: "dup@x.test", createdAt: now }).run();
    await expect(
      beginPasskeyRegistration(db, { email: "dup@x.test", inviteCode: inv.code }, "localhost", now),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("complete creates user + credential + membership", async () => {
    const db = createTestDb();
    const inv = seedInvite(db);
    const ceremony = { type: "register" as const, challenge: "chal-reg", email: "new@x.test", inviteCode: inv.code, tempUserId: "tmp" };
    const user = await completePasskeyRegistration(db, { responseJson: "{}", deviceName: "Phone" }, ceremony, "localhost", now);
    expect(user.onboardingStep).toBe("COMPLETED");
    expect(user.activeHouseholdId).toBe("h1");
    const cred = db.select().from(passkeyCredentials).where(eq(passkeyCredentials.userId, user.id)).get();
    expect(cred?.deviceName).toBe("Phone");
  });
});

describe("passkey login", () => {
  function seedUserWithPasskey(db: ReturnType<typeof createTestDb>) {
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    db.insert(passkeyCredentials).values({
      id: "p1", userId: "u1", credentialId: Buffer.from([1, 2, 3]), publicKey: Buffer.from([4, 5, 6]),
      signCount: 0, deviceName: "Phone", createdAt: now,
    }).run();
  }

  it("begin requires a registered passkey", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    await expect(beginPasskeyLogin(db, { email: "a@x.test" }, "localhost")).rejects.toMatchObject({ status: 400 });
  });

  it("complete verifies, updates sign count, returns user", async () => {
    const db = createTestDb();
    seedUserWithPasskey(db);
    const response = JSON.stringify({ rawId: Buffer.from([1, 2, 3]).toString("base64url") });
    const ceremony = { type: "login" as const, challenge: "chal-login", email: "a@x.test" };
    const user = await completePasskeyLogin(db, { responseJson: response }, ceremony, "localhost");
    expect(user.id).toBe("u1");
    const cred = db.select().from(passkeyCredentials).where(eq(passkeyCredentials.id, "p1")).get();
    expect(cred?.signCount).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/passkey-auth.test.ts`
Expected: FAIL — cannot find module `./passkey-auth`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/passkey-auth.ts`:
```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers, passkeyCredentials, users } from "@/lib/db/schema";
import { consumeInvite, validateInvite } from "@/lib/households/invites";
import type { CeremonyState } from "./ceremony";
import { AuthError } from "./errors";
import { roleForInviteCreator } from "./register";
import type { User } from "./session-store";
import {
  b64urlToBuf,
  getAuthenticationOptions,
  getRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn";

export async function beginPasskeyRegistration(
  db: Db,
  args: { email: string; inviteCode: string },
  rpId: string,
  now: Date,
): Promise<{ options: Awaited<ReturnType<typeof getRegistrationOptions>>; ceremony: CeremonyState }> {
  validateInvite(db, args.inviteCode, now);
  if (db.select().from(users).where(eq(users.email, args.email)).get()) {
    throw new AuthError(409, "A user with this email already exists.");
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
    ceremony: {
      type: "register",
      challenge: options.challenge,
      email: args.email,
      inviteCode: args.inviteCode,
      tempUserId,
    },
  };
}

export async function completePasskeyRegistration(
  db: Db,
  args: { responseJson: string; deviceName: string },
  ceremony: CeremonyState,
  rpId: string,
  now: Date,
): Promise<User> {
  if (ceremony.type !== "register" || !ceremony.email || !ceremony.inviteCode) {
    throw new AuthError(400, "No registration in progress.");
  }
  const verified = await verifyRegistration({
    responseJson: args.responseJson,
    expectedChallenge: ceremony.challenge,
    rpId,
  });
  const invite = validateInvite(db, ceremony.inviteCode, now);
  if (db.select().from(users).where(eq(users.email, ceremony.email)).get()) {
    throw new AuthError(409, "A user with this email already exists.");
  }
  const user = db
    .insert(users)
    .values({
      id: randomUUID(),
      email: ceremony.email,
      password: "",
      activeHouseholdId: invite.householdId,
      onboardingStep: "COMPLETED",
      createdAt: now,
    })
    .returning()
    .get();

  db.insert(passkeyCredentials)
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

  db.insert(householdMembers)
    .values({
      householdId: invite.householdId,
      userId: user.id,
      role: roleForInviteCreator(db, invite.createdById),
      joinedAt: now,
    })
    .run();

  consumeInvite(db, invite.id, user.id);
  return user;
}

export async function beginPasskeyLogin(
  db: Db,
  args: { email: string },
  rpId: string,
): Promise<{ options: Awaited<ReturnType<typeof getAuthenticationOptions>>; ceremony: CeremonyState }> {
  const user = db.select().from(users).where(eq(users.email, args.email)).get();
  if (!user) throw new AuthError(400, "No account found with this email.");
  const creds = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, user.id))
    .all();
  if (creds.length === 0) throw new AuthError(400, "No passkeys registered for this account.");

  const options = await getAuthenticationOptions({
    rpId,
    allowCredentialIds: creds.map((c) => c.credentialId as Buffer),
  });
  return { options, ceremony: { type: "login", challenge: options.challenge, email: args.email } };
}

export async function completePasskeyLogin(
  db: Db,
  args: { responseJson: string },
  ceremony: CeremonyState,
  rpId: string,
): Promise<User> {
  if (ceremony.type !== "login" || !ceremony.email) {
    throw new AuthError(400, "No login in progress.");
  }
  const parsed = JSON.parse(args.responseJson) as { rawId?: string; id?: string };
  const rawId = parsed.rawId ?? parsed.id;
  if (!rawId) throw new AuthError(400, "Missing credential ID in response.");
  const credentialId = b64urlToBuf(rawId);

  const stored = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.credentialId, credentialId))
    .get();
  if (!stored) throw new AuthError(400, "Credential not recognized.");

  const user = db.select().from(users).where(eq(users.id, stored.userId)).get();
  if (!user || user.email !== ceremony.email) {
    throw new AuthError(400, "Credential does not belong to this user.");
  }

  const { newSignCount } = await verifyAuthentication({
    responseJson: args.responseJson,
    expectedChallenge: ceremony.challenge,
    rpId,
    credentialId: stored.credentialId as Buffer,
    publicKey: stored.publicKey as Buffer,
    signCount: stored.signCount,
  });

  db.update(passkeyCredentials)
    .set({ signCount: newSignCount })
    .where(eq(passkeyCredentials.id, stored.id))
    .run();

  return user;
}
```
Note: the unused `and` import may be flagged by lint — remove it if so (kept here for symmetry with sibling modules).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/passkey-auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/passkey-auth.ts web/lib/auth/passkey-auth.test.ts
git commit -m "feat: add passkey registration and login flows"
```

---

### Task 14: Password management (set / change / remove / skip-passkey)

**Files:**
- Create: `web/lib/auth/password-management.ts`
- Test: `web/lib/auth/password-management.test.ts`

**Interfaces:**
- Consumes: `Db`, password helpers, `AuthError`, `User`.
- Produces:
  - `setPassword(db, userId, args: { currentPassword?: string; newPassword: string }): Promise<void>` — if the user already has a usable password, requires & verifies `currentPassword`; validates the new password; hashes & stores it; if `onboardingStep === "CHANGE_PASSWORD"`, advances to `"ADD_PASSKEY"`.
  - `removePassword(db, userId, args: { currentPassword: string }): Promise<void>` — requires a usable password + correct current password + at least one passkey; sets password to `""`.
  - `skipPasskey(db, userId): void` — if `onboardingStep === "ADD_PASSKEY"`, advance to `"CREATE_HOUSEHOLD"`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/password-management.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { passkeyCredentials, users } from "@/lib/db/schema";
import { hashPassword, hasUsablePassword } from "./password";
import { removePassword, setPassword, skipPasskey } from "./password-management";

const now = new Date("2026-06-27T12:00:00Z");
const get = (db: ReturnType<typeof createTestDb>, id: string) =>
  db.select().from(users).where(eq(users.id, id)).get()!;

describe("setPassword", () => {
  it("sets a first password and advances onboarding CHANGE_PASSWORD -> ADD_PASSKEY", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", password: "", onboardingStep: "CHANGE_PASSWORD", createdAt: now }).run();
    await setPassword(db, "u1", { newPassword: "Tr0ub4dour&3" });
    const u = get(db, "u1");
    expect(hasUsablePassword(u.password)).toBe(true);
    expect(u.onboardingStep).toBe("ADD_PASSKEY");
  });

  it("requires the current password when changing", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", password: await hashPassword("OldP4ss!word"), onboardingStep: "COMPLETED", createdAt: now }).run();
    await expect(setPassword(db, "u1", { newPassword: "NewP4ss!word" })).rejects.toMatchObject({ status: 400 });
    await expect(setPassword(db, "u1", { currentPassword: "wrong", newPassword: "NewP4ss!word" })).rejects.toMatchObject({ status: 400 });
    await setPassword(db, "u1", { currentPassword: "OldP4ss!word", newPassword: "NewP4ss!word" });
    expect(get(db, "u1").onboardingStep).toBe("COMPLETED"); // unchanged
  });

  it("rejects a weak new password", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", password: "", onboardingStep: "CHANGE_PASSWORD", createdAt: now }).run();
    await expect(setPassword(db, "u1", { newPassword: "short" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("removePassword", () => {
  it("removes the password when a passkey exists", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", password: await hashPassword("OldP4ss!word"), createdAt: now }).run();
    db.insert(passkeyCredentials).values({ id: "p1", userId: "u1", credentialId: Buffer.from([1]), publicKey: Buffer.from([2]), signCount: 0, deviceName: "", createdAt: now }).run();
    await removePassword(db, "u1", { currentPassword: "OldP4ss!word" });
    expect(hasUsablePassword(get(db, "u1").password)).toBe(false);
  });

  it("refuses to remove the only auth factor (no passkey)", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", password: await hashPassword("OldP4ss!word"), createdAt: now }).run();
    await expect(removePassword(db, "u1", { currentPassword: "OldP4ss!word" })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a wrong current password", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", password: await hashPassword("OldP4ss!word"), createdAt: now }).run();
    db.insert(passkeyCredentials).values({ id: "p1", userId: "u1", credentialId: Buffer.from([1]), publicKey: Buffer.from([2]), signCount: 0, deviceName: "", createdAt: now }).run();
    await expect(removePassword(db, "u1", { currentPassword: "nope" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("skipPasskey", () => {
  it("advances ADD_PASSKEY -> CREATE_HOUSEHOLD", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "ADD_PASSKEY", createdAt: now }).run();
    skipPasskey(db, "u1");
    expect(get(db, "u1").onboardingStep).toBe("CREATE_HOUSEHOLD");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/password-management.test.ts`
Expected: FAIL — cannot find module `./password-management`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/password-management.ts`:
```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { passkeyCredentials, users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { hashPassword, hasUsablePassword, validatePassword, verifyPassword } from "./password";

function requireUser(db: Db, userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AuthError(404, "User not found.");
  return user;
}

export async function setPassword(
  db: Db,
  userId: string,
  args: { currentPassword?: string; newPassword: string },
): Promise<void> {
  const user = requireUser(db, userId);
  if (hasUsablePassword(user.password)) {
    if (!args.currentPassword || !(await verifyPassword(user.password, args.currentPassword))) {
      throw new AuthError(400, "Current password is incorrect.");
    }
  }
  validatePassword(args.newPassword, { email: user.email });

  const onboardingStep =
    user.onboardingStep === "CHANGE_PASSWORD" ? "ADD_PASSKEY" : user.onboardingStep;
  db.update(users)
    .set({ password: await hashPassword(args.newPassword), onboardingStep })
    .where(eq(users.id, userId))
    .run();
}

export async function removePassword(
  db: Db,
  userId: string,
  args: { currentPassword: string },
): Promise<void> {
  const user = requireUser(db, userId);
  if (!hasUsablePassword(user.password)) {
    throw new AuthError(400, "No password is set.");
  }
  if (!(await verifyPassword(user.password, args.currentPassword))) {
    throw new AuthError(400, "Current password is incorrect.");
  }
  const passkey = db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .get();
  if (!passkey) {
    throw new AuthError(400, "Cannot remove your password without a passkey set.");
  }
  db.update(users).set({ password: "" }).where(eq(users.id, userId)).run();
}

export function skipPasskey(db: Db, userId: string): void {
  const user = requireUser(db, userId);
  if (user.onboardingStep === "ADD_PASSKEY") {
    db.update(users).set({ onboardingStep: "CREATE_HOUSEHOLD" }).where(eq(users.id, userId)).run();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/password-management.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/password-management.ts web/lib/auth/password-management.test.ts
git commit -m "feat: add password set/change/remove and skip-passkey flows"
```

---

### Task 15: Passkey management (list / add / delete)

**Files:**
- Create: `web/lib/auth/passkey-management.ts`
- Test: `web/lib/auth/passkey-management.test.ts`

**Interfaces:**
- Consumes: `Db`, `webauthn.ts`, `CeremonyState`, `AuthError`.
- Produces:
  - `interface PasskeyDto { id; deviceName; createdAt }`.
  - `listPasskeys(db, userId): PasskeyDto[]` — ordered newest-first.
  - `beginAddPasskey(db, userId, rpId): Promise<{ options; ceremony: CeremonyState }>` — excludes existing credentials.
  - `completeAddPasskey(db, args: { userId; responseJson; deviceName }, ceremony, rpId, now): Promise<PasskeyDto>` — verifies, stores the credential; if `onboardingStep === "ADD_PASSKEY"`, advance to `"CREATE_HOUSEHOLD"`.
  - `deletePasskey(db, userId, passkeyId): void` — 404 if not owned; refuses to delete the last passkey when the user has no usable password.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/passkey-management.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { passkeyCredentials, users } from "@/lib/db/schema";
import { hashPassword } from "./password";

vi.mock("./webauthn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./webauthn")>();
  return {
    ...actual,
    getRegistrationOptions: vi.fn(async () => ({ challenge: "chal-add" })),
    verifyRegistration: vi.fn(async () => ({
      credentialId: Buffer.from([7, 8, 9]),
      publicKey: Buffer.from([1]),
      signCount: 0,
    })),
  };
});

import {
  beginAddPasskey,
  completeAddPasskey,
  deletePasskey,
  listPasskeys,
} from "./passkey-management";

const now = new Date("2026-06-27T12:00:00Z");

function user(db: ReturnType<typeof createTestDb>, over = {}) {
  db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now, ...over }).run();
}
function passkey(db: ReturnType<typeof createTestDb>, id: string, cid: number[]) {
  db.insert(passkeyCredentials).values({
    id, userId: "u1", credentialId: Buffer.from(cid), publicKey: Buffer.from([0]),
    signCount: 0, deviceName: id, createdAt: now,
  }).run();
}

describe("listPasskeys", () => {
  it("lists the user's passkeys", () => {
    const db = createTestDb();
    user(db);
    passkey(db, "p1", [1]);
    expect(listPasskeys(db, "u1").map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("add passkey", () => {
  it("begin returns ceremony of type add", async () => {
    const db = createTestDb();
    user(db);
    const { ceremony } = await beginAddPasskey(db, "u1", "localhost");
    expect(ceremony).toMatchObject({ type: "add", challenge: "chal-add" });
  });

  it("complete stores the credential and advances onboarding", async () => {
    const db = createTestDb();
    user(db, { onboardingStep: "ADD_PASSKEY" });
    const ceremony = { type: "add" as const, challenge: "chal-add" };
    const dto = await completeAddPasskey(db, { userId: "u1", responseJson: "{}", deviceName: "Laptop" }, ceremony, "localhost", now);
    expect(dto.deviceName).toBe("Laptop");
    expect(db.select().from(users).where(eq(users.id, "u1")).get()?.onboardingStep).toBe("CREATE_HOUSEHOLD");
  });
});

describe("deletePasskey", () => {
  it("deletes a passkey when another factor remains", async () => {
    const db = createTestDb();
    user(db, { password: await hashPassword("Tr0ub4dour&3") });
    passkey(db, "p1", [1]);
    deletePasskey(db, "u1", "p1");
    expect(listPasskeys(db, "u1")).toEqual([]);
  });

  it("refuses to delete the only passkey with no password", () => {
    const db = createTestDb();
    user(db, { password: "" });
    passkey(db, "p1", [1]);
    expect(() => deletePasskey(db, "u1", "p1")).toThrow(/only passkey/i);
  });

  it("404s on a passkey the user does not own", () => {
    const db = createTestDb();
    user(db);
    expect(() => deletePasskey(db, "u1", "ghost")).toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/passkey-management.test.ts`
Expected: FAIL — cannot find module `./passkey-management`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/passkey-management.ts`:
```ts
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { passkeyCredentials, users } from "@/lib/db/schema";
import type { CeremonyState } from "./ceremony";
import { AuthError } from "./errors";
import { hasUsablePassword } from "./password";
import { getRegistrationOptions, verifyRegistration } from "./webauthn";

export interface PasskeyDto {
  id: string;
  deviceName: string;
  createdAt: Date;
}

function requireUser(db: Db, userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AuthError(404, "User not found.");
  return user;
}

export function listPasskeys(db: Db, userId: string): PasskeyDto[] {
  return db
    .select({
      id: passkeyCredentials.id,
      deviceName: passkeyCredentials.deviceName,
      createdAt: passkeyCredentials.createdAt,
    })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .orderBy(desc(passkeyCredentials.createdAt))
    .all();
}

export async function beginAddPasskey(
  db: Db,
  userId: string,
  rpId: string,
): Promise<{ options: Awaited<ReturnType<typeof getRegistrationOptions>>; ceremony: CeremonyState }> {
  const user = requireUser(db, userId);
  const existing = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .all();
  const options = await getRegistrationOptions({
    userId: user.id,
    userEmail: user.email,
    rpId,
    excludeCredentialIds: existing.map((c) => c.credentialId as Buffer),
  });
  return { options, ceremony: { type: "add", challenge: options.challenge } };
}

export async function completeAddPasskey(
  db: Db,
  args: { userId: string; responseJson: string; deviceName: string },
  ceremony: CeremonyState,
  rpId: string,
  now: Date,
): Promise<PasskeyDto> {
  if (ceremony.type !== "add") throw new AuthError(400, "No pending passkey addition.");
  const user = requireUser(db, args.userId);
  const verified = await verifyRegistration({
    responseJson: args.responseJson,
    expectedChallenge: ceremony.challenge,
    rpId,
  });
  const cred = db
    .insert(passkeyCredentials)
    .values({
      id: randomUUID(),
      userId: user.id,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      signCount: verified.signCount,
      deviceName: args.deviceName,
      createdAt: now,
    })
    .returning()
    .get();

  if (user.onboardingStep === "ADD_PASSKEY") {
    db.update(users).set({ onboardingStep: "CREATE_HOUSEHOLD" }).where(eq(users.id, user.id)).run();
  }
  return { id: cred.id, deviceName: cred.deviceName, createdAt: cred.createdAt };
}

export function deletePasskey(db: Db, userId: string, passkeyId: string): void {
  const user = requireUser(db, userId);
  const cred = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.id, passkeyId))
    .get();
  if (!cred || cred.userId !== userId) throw new AuthError(404, "Passkey not found.");

  const count = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .all().length;
  if (count <= 1 && !hasUsablePassword(user.password)) {
    throw new AuthError(400, "Cannot delete your only passkey without a password set.");
  }
  db.delete(passkeyCredentials).where(eq(passkeyCredentials.id, passkeyId)).run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/passkey-management.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/passkey-management.ts web/lib/auth/passkey-management.test.ts
git commit -m "feat: add passkey list/add/delete management"
```

---

### Task 16: User profile updates

**Files:**
- Create: `web/lib/auth/profile.ts`
- Test: `web/lib/auth/profile.test.ts`

**Interfaces:**
- Consumes: `Db`, `isHouseholdMember` (Task 6), `AuthError`, `User`.
- Produces:
  - `updateUser(db, userId, args: { preferredLanguage?: string; activeHouseholdId?: string }): User` — ports Django `PATCH /users/me/`. `preferredLanguage` must be `"en"` or `"de"`. Switching `activeHouseholdId` requires membership (403 otherwise). Returns the updated user row.

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth/profile.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { updateUser } from "./profile";

const now = new Date("2026-06-27T12:00:00Z");

function seed(db: ReturnType<typeof createTestDb>) {
  db.insert(users).values({ id: "u1", email: "a@x.test", preferredLanguage: "en", createdAt: now }).run();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  db.insert(households).values({ id: "h2", name: "Other", createdAt: now }).run();
  db.insert(householdMembers).values({ householdId: "h1", userId: "u1", joinedAt: now }).run();
}

describe("updateUser", () => {
  it("updates the preferred language", () => {
    const db = createTestDb();
    seed(db);
    expect(updateUser(db, "u1", { preferredLanguage: "de" }).preferredLanguage).toBe("de");
  });

  it("rejects an unsupported language", () => {
    const db = createTestDb();
    seed(db);
    expect(() => updateUser(db, "u1", { preferredLanguage: "fr" })).toThrow(/language/i);
  });

  it("switches the active household when a member", () => {
    const db = createTestDb();
    seed(db);
    expect(updateUser(db, "u1", { activeHouseholdId: "h1" }).activeHouseholdId).toBe("h1");
  });

  it("refuses to switch to a household the user does not belong to", () => {
    const db = createTestDb();
    seed(db);
    expect(() => updateUser(db, "u1", { activeHouseholdId: "h2" })).toThrow(/member/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/auth/profile.test.ts`
Expected: FAIL — cannot find module `./profile`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/auth/profile.ts`:
```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { isHouseholdMember } from "./scoping";
import type { User } from "./session-store";

const LANGUAGES = new Set(["en", "de"]);

export function updateUser(
  db: Db,
  userId: string,
  args: { preferredLanguage?: string; activeHouseholdId?: string },
): User {
  const update: Partial<typeof users.$inferInsert> = {};

  if (args.preferredLanguage !== undefined) {
    if (!LANGUAGES.has(args.preferredLanguage)) {
      throw new AuthError(400, "Unsupported language.");
    }
    update.preferredLanguage = args.preferredLanguage;
  }

  if (args.activeHouseholdId !== undefined) {
    if (!isHouseholdMember(db, userId, args.activeHouseholdId)) {
      throw new AuthError(403, "Not a member of that household.");
    }
    update.activeHouseholdId = args.activeHouseholdId;
  }

  const updated = db.update(users).set(update).where(eq(users.id, userId)).returning().get();
  if (!updated) throw new AuthError(404, "User not found.");
  return updated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/auth/profile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/profile.ts web/lib/auth/profile.test.ts
git commit -m "feat: add user profile update (language + active household)"
```

---

### Task 17: Household management — create / list / update / settings / switch

**Files:**
- Create: `web/lib/households/manage.ts`
- Create: `web/lib/households/serialize.ts`
- Test: `web/lib/households/manage.test.ts`

**Interfaces:**
- Consumes: `Db`, `isHouseholdMember`, `AuthError`. Uses `seedDefaultTags` if it exists (see Step 3 note).
- Produces (in `serialize.ts`):
  - `interface HouseholdDto { id; name; aiEnabled; geminiApiKeySet: boolean; role: string; memberCount: number }`.
  - `serializeHousehold(db, householdId, userId): HouseholdDto`.
- Produces (in `manage.ts`):
  - `createHousehold(db, userId, args: { name: string }, now): { id: string }` — creates the household, adds the creator as `OWNER`, sets it active if the user has none, advances onboarding `CREATE_HOUSEHOLD → COMPLETED`. Returns the new id.
  - `listHouseholds(db, userId): HouseholdDto[]`.
  - `requireOwner(db, userId, householdId): void` — 403 unless the user is `OWNER` (port of `require_household_owner`).
  - `updateHousehold(db, userId, householdId, args: { name: string }): void` — OWNER only.
  - `updateHouseholdSettings(db, userId, householdId, args: { aiEnabled?: boolean; geminiApiKey?: string }): void` — OWNER only.
  - `switchHousehold(db, userId, householdId): void` — member only; sets `users.activeHouseholdId`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/households/manage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import {
  createHousehold,
  listHouseholds,
  requireOwner,
  switchHousehold,
  updateHousehold,
  updateHouseholdSettings,
} from "./manage";

const now = new Date("2026-06-27T12:00:00Z");
const getUser = (db: ReturnType<typeof createTestDb>, id: string) =>
  db.select().from(users).where(eq(users.id, id)).get()!;

describe("createHousehold", () => {
  it("creates a household, makes creator OWNER, activates it, completes onboarding", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "CREATE_HOUSEHOLD", createdAt: now }).run();
    const { id } = createHousehold(db, "u1", { name: "Home" }, now);
    const member = db.select().from(householdMembers).where(eq(householdMembers.householdId, id)).get();
    expect(member?.role).toBe("OWNER");
    const u = getUser(db, "u1");
    expect(u.activeHouseholdId).toBe(id);
    expect(u.onboardingStep).toBe("COMPLETED");
  });

  it("does not change an existing active household", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h0", name: "Existing", createdAt: now }).run();
    db.insert(users).values({ id: "u1", email: "a@x.test", activeHouseholdId: "h0", onboardingStep: "COMPLETED", createdAt: now }).run();
    const { id } = createHousehold(db, "u1", { name: "Second" }, now);
    expect(getUser(db, "u1").activeHouseholdId).toBe("h0");
    expect(id).not.toBe("h0");
  });
});

describe("ownership + updates", () => {
  function ownerWithHousehold(db: ReturnType<typeof createTestDb>) {
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "COMPLETED", createdAt: now }).run();
    return createHousehold(db, "u1", { name: "Home" }, now).id;
  }

  it("requireOwner passes for owner, 403s for non-member", () => {
    const db = createTestDb();
    const hid = ownerWithHousehold(db);
    expect(() => requireOwner(db, "u1", hid)).not.toThrow();
    db.insert(users).values({ id: "u2", email: "b@x.test", createdAt: now }).run();
    expect(() => requireOwner(db, "u2", hid)).toThrow(/owner/i);
  });

  it("updates name and settings as owner", () => {
    const db = createTestDb();
    const hid = ownerWithHousehold(db);
    updateHousehold(db, "u1", hid, { name: "Renamed" });
    updateHouseholdSettings(db, "u1", hid, { aiEnabled: true, geminiApiKey: "k" });
    const h = db.select().from(households).where(eq(households.id, hid)).get()!;
    expect(h.name).toBe("Renamed");
    expect(h.aiEnabled).toBe(true);
    expect(h.geminiApiKey).toBe("k");
  });
});

describe("switch + list", () => {
  it("switches the active household for a member", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "COMPLETED", createdAt: now }).run();
    const a = createHousehold(db, "u1", { name: "A" }, now).id;
    const b = createHousehold(db, "u1", { name: "B" }, now).id;
    switchHousehold(db, "u1", b);
    expect(getUser(db, "u1").activeHouseholdId).toBe(b);
    expect(listHouseholds(db, "u1").map((h) => h.id).sort()).toEqual([a, b].sort());
  });

  it("refuses to switch to a non-member household", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", createdAt: now }).run();
    db.insert(households).values({ id: "hX", name: "X", createdAt: now }).run();
    expect(() => switchHousehold(db, "u1", "hX")).toThrow(/member/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/households/manage.test.ts`
Expected: FAIL — cannot find module `./manage`.

- [ ] **Step 3: Write the serializer + manager**

Create `web/lib/households/serialize.ts`:
```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";

export interface HouseholdDto {
  id: string;
  name: string;
  aiEnabled: boolean;
  geminiApiKeySet: boolean;
  role: string;
  memberCount: number;
}

export function serializeHousehold(db: Db, householdId: string, userId: string): HouseholdDto {
  const h = db.select().from(households).where(eq(households.id, householdId)).get();
  if (!h) throw new AuthError(404, "Household not found.");
  const membership = db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .get();
  const memberCount = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .all().length;
  return {
    id: h.id,
    name: h.name,
    aiEnabled: h.aiEnabled,
    geminiApiKeySet: h.geminiApiKey !== "",
    role: membership?.role ?? "",
    memberCount,
  };
}
```

Create `web/lib/households/manage.ts`:
```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { isHouseholdMember } from "@/lib/auth/scoping";
import { type HouseholdDto, serializeHousehold } from "./serialize";

// Optional: seed default tags for a new household. Plan 2's domain layer does not own this;
// if a seeder exists at @/lib/domain or @/lib/households, call it here. Until then this is a no-op.
function seedDefaultTags(_db: Db, _householdId: string): void {
  // Intentionally empty — default-tag seeding is wired in a later plan (recipe tagging).
}

export function createHousehold(
  db: Db,
  userId: string,
  args: { name: string },
  now: Date,
): { id: string } {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AuthError(404, "User not found.");
  if (!args.name.trim()) throw new AuthError(400, "Household name is required.");

  const id = randomUUID();
  db.insert(households).values({ id, name: args.name, createdAt: now }).run();
  db.insert(householdMembers)
    .values({ householdId: id, userId, role: "OWNER", joinedAt: now })
    .run();
  seedDefaultTags(db, id);

  const update: Partial<typeof users.$inferInsert> = {};
  if (!user.activeHouseholdId) update.activeHouseholdId = id;
  if (user.onboardingStep === "CREATE_HOUSEHOLD") update.onboardingStep = "COMPLETED";
  if (Object.keys(update).length > 0) {
    db.update(users).set(update).where(eq(users.id, userId)).run();
  }
  return { id };
}

export function listHouseholds(db: Db, userId: string): HouseholdDto[] {
  const memberships = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all();
  return memberships.map((m) => serializeHousehold(db, m.householdId, userId));
}

export function requireOwner(db: Db, userId: string, householdId: string): void {
  const row = db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .get();
  if (!row || row.role !== "OWNER") throw new AuthError(403, "Owner access required");
}

export function updateHousehold(
  db: Db,
  userId: string,
  householdId: string,
  args: { name: string },
): void {
  requireOwner(db, userId, householdId);
  if (!args.name.trim()) throw new AuthError(400, "Household name is required.");
  db.update(households).set({ name: args.name }).where(eq(households.id, householdId)).run();
}

export function updateHouseholdSettings(
  db: Db,
  userId: string,
  householdId: string,
  args: { aiEnabled?: boolean; geminiApiKey?: string },
): void {
  requireOwner(db, userId, householdId);
  const update: Partial<typeof households.$inferInsert> = {};
  if (args.aiEnabled !== undefined) update.aiEnabled = args.aiEnabled;
  if (args.geminiApiKey !== undefined) update.geminiApiKey = args.geminiApiKey;
  if (Object.keys(update).length > 0) {
    db.update(households).set(update).where(eq(households.id, householdId)).run();
  }
}

export function switchHousehold(db: Db, userId: string, householdId: string): void {
  if (!isHouseholdMember(db, userId, householdId)) {
    throw new AuthError(403, "Not a member of that household.");
  }
  db.update(users).set({ activeHouseholdId: householdId }).where(eq(users.id, userId)).run();
}
```
Note on `seedDefaultTags`: the Django flow calls `seed_default_tags(household)` on creation. That seeder belongs to recipe tagging, which is a later plan. The stub above keeps the contract; a later plan replaces the body. Document this in the commit message.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/households/manage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/households/manage.ts web/lib/households/serialize.ts web/lib/households/manage.test.ts
git commit -m "feat: add household create/list/update/settings/switch (tag-seeding stubbed)"
```

---

### Task 18: Household management — delete / leave / members / transfer / invite-create

**Files:**
- Create: `web/lib/households/membership.ts`
- Test: `web/lib/households/membership.test.ts`

**Interfaces:**
- Consumes: `Db`, `requireOwner`, `isHouseholdMember`, `createInvite`, `AuthError`.
- Produces:
  - `interface MemberDto { id: number; userId; email; role; joinedAt }`.
  - `listMembers(db, householdId): MemberDto[]`.
  - `leaveHousehold(db, userId, householdId): void` — member only; an OWNER cannot leave while other members remain (must transfer first); clears `activeHouseholdId` if it pointed here.
  - `removeMember(db, actorId, householdId, memberId): void` — OWNER only; cannot remove self via this path; clears the removed user's `activeHouseholdId` if it pointed here.
  - `transferOwnership(db, actorId, householdId, memberId): void` — OWNER only; promotes the target member to `OWNER` and demotes the actor to `MEMBER`.
  - `deleteHousehold(db, userId, householdId): void` — OWNER only; only when the actor is the sole member; clears the actor's `activeHouseholdId` if it pointed here.
  - `createHouseholdInvite(db, userId, householdId, now): { code: string; expiresAt: Date }` — OWNER only; wraps `createInvite`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/households/membership.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { createHousehold } from "./manage";
import {
  createHouseholdInvite,
  deleteHousehold,
  leaveHousehold,
  listMembers,
  removeMember,
  transferOwnership,
} from "./membership";

const now = new Date("2026-06-27T12:00:00Z");
const getUser = (db: ReturnType<typeof createTestDb>, id: string) =>
  db.select().from(users).where(eq(users.id, id)).get()!;

/** Owner u1 with household h; member u2 added. Returns household id. */
function ownerAndMember(db: ReturnType<typeof createTestDb>) {
  db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "COMPLETED", createdAt: now }).run();
  const hid = createHousehold(db, "u1", { name: "Home" }, now).id;
  db.insert(users).values({ id: "u2", email: "b@x.test", activeHouseholdId: hid, createdAt: now }).run();
  db.insert(householdMembers).values({ householdId: hid, userId: "u2", role: "MEMBER", joinedAt: now }).run();
  return hid;
}

describe("members + invites", () => {
  it("lists members", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    expect(listMembers(db, hid).map((m) => m.email).sort()).toEqual(["a@x.test", "b@x.test"]);
  });

  it("creates an invite as owner only", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    expect(createHouseholdInvite(db, "u1", hid, now).code).toBeTruthy();
    expect(() => createHouseholdInvite(db, "u2", hid, now)).toThrow(/owner/i);
  });
});

describe("leave", () => {
  it("lets a member leave and clears their active household", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    leaveHousehold(db, "u2", hid);
    expect(listMembers(db, hid).map((m) => m.userId)).toEqual(["u1"]);
    expect(getUser(db, "u2").activeHouseholdId).toBeNull();
  });

  it("forbids an owner leaving while others remain", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    expect(() => leaveHousehold(db, "u1", hid)).toThrow(/transfer/i);
  });
});

describe("remove + transfer", () => {
  it("owner removes a member", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    const member = listMembers(db, hid).find((m) => m.userId === "u2")!;
    removeMember(db, "u1", hid, member.id);
    expect(listMembers(db, hid).map((m) => m.userId)).toEqual(["u1"]);
    expect(getUser(db, "u2").activeHouseholdId).toBeNull();
  });

  it("non-owner cannot remove", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    const owner = listMembers(db, hid).find((m) => m.userId === "u1")!;
    expect(() => removeMember(db, "u2", hid, owner.id)).toThrow(/owner/i);
  });

  it("transfers ownership and demotes the previous owner", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    const member = listMembers(db, hid).find((m) => m.userId === "u2")!;
    transferOwnership(db, "u1", hid, member.id);
    const roles = Object.fromEntries(listMembers(db, hid).map((m) => [m.userId, m.role]));
    expect(roles).toEqual({ u1: "MEMBER", u2: "OWNER" });
  });
});

describe("delete", () => {
  it("deletes only when the owner is the sole member", () => {
    const db = createTestDb();
    const hid = ownerAndMember(db);
    expect(() => deleteHousehold(db, "u1", hid)).toThrow(/sole member/i);
    leaveHousehold(db, "u2", hid);
    deleteHousehold(db, "u1", hid);
    expect(db.select().from(households).where(eq(households.id, hid)).get()).toBeUndefined();
    expect(getUser(db, "u1").activeHouseholdId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/households/membership.test.ts`
Expected: FAIL — cannot find module `./membership`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/households/membership.ts`:
```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { createInvite } from "./invites";
import { requireOwner } from "./manage";

export interface MemberDto {
  id: number;
  userId: string;
  email: string;
  role: string;
  joinedAt: Date;
}

function clearActiveHouseholdIfPointingHere(db: Db, userId: string, householdId: string): void {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (u?.activeHouseholdId === householdId) {
    db.update(users).set({ activeHouseholdId: null }).where(eq(users.id, userId)).run();
  }
}

export function listMembers(db: Db, householdId: string): MemberDto[] {
  return db
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      email: users.email,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .all();
}

function memberById(db: Db, householdId: string, memberId: number) {
  const m = db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)))
    .get();
  if (!m) throw new AuthError(404, "Member not found.");
  return m;
}

export function leaveHousehold(db: Db, userId: string, householdId: string): void {
  const me = db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)))
    .get();
  if (!me) throw new AuthError(403, "Not a member of that household.");

  const others = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .all()
    .filter((m) => m.userId !== userId);
  if (me.role === "OWNER" && others.length > 0) {
    throw new AuthError(400, "Transfer ownership before leaving.");
  }
  db.delete(householdMembers).where(eq(householdMembers.id, me.id)).run();
  clearActiveHouseholdIfPointingHere(db, userId, householdId);
}

export function removeMember(
  db: Db,
  actorId: string,
  householdId: string,
  memberId: number,
): void {
  requireOwner(db, actorId, householdId);
  const member = memberById(db, householdId, memberId);
  if (member.userId === actorId) {
    throw new AuthError(400, "Use leave to remove yourself.");
  }
  db.delete(householdMembers).where(eq(householdMembers.id, member.id)).run();
  clearActiveHouseholdIfPointingHere(db, member.userId, householdId);
}

export function transferOwnership(
  db: Db,
  actorId: string,
  householdId: string,
  memberId: number,
): void {
  requireOwner(db, actorId, householdId);
  const target = memberById(db, householdId, memberId);
  db.update(householdMembers).set({ role: "OWNER" }).where(eq(householdMembers.id, target.id)).run();
  db.update(householdMembers)
    .set({ role: "MEMBER" })
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, actorId)))
    .run();
}

export function deleteHousehold(db: Db, userId: string, householdId: string): void {
  requireOwner(db, userId, householdId);
  const count = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .all().length;
  if (count > 1) throw new AuthError(400, "You must be the sole member to delete a household.");
  db.delete(households).where(eq(households.id, householdId)).run(); // cascades members
  clearActiveHouseholdIfPointingHere(db, userId, householdId);
}

export function createHouseholdInvite(
  db: Db,
  userId: string,
  householdId: string,
  now: Date,
): { code: string; expiresAt: Date } {
  requireOwner(db, userId, householdId);
  const invite = createInvite(db, { householdId, createdById: userId }, now);
  return { code: invite.code, expiresAt: invite.expiresAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/households/membership.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/households/membership.ts web/lib/households/membership.test.ts
git commit -m "feat: add household membership ops (leave/remove/transfer/delete/invite)"
```

---

### Task 19: End-to-end auth flow integration test (lib level)

**Files:**
- Test: `web/lib/auth/flow.integration.test.ts`

**Interfaces:**
- Consumes: everything above. No new production code — this task is a safety net that wires the real functions together (no mocks except WebAuthn, which cannot be exercised without an authenticator) against one DB.

- [ ] **Step 1: Write the integration test**

Create `web/lib/auth/flow.integration.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, users } from "@/lib/db/schema";
import { createInvite } from "@/lib/households/invites";
import { registerWithPassword } from "./register";
import { loginWithPassword } from "./login";
import { createSession, loadSession } from "./session-store";
import { serializeUser } from "./serialize";
import { isHouseholdMember } from "./scoping";

const now = new Date("2026-06-27T12:00:00Z");

describe("password auth end-to-end (lib level)", () => {
  it("register -> login -> session -> scoped access", async () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(users).values({ id: "owner", email: "o@x.test", isActive: false, createdAt: now }).run();
    const invite = createInvite(db, { householdId: "h1", createdById: "owner" }, now);

    // Register (bootstrap invite -> OWNER).
    const registered = await registerWithPassword(
      db,
      { email: "me@x.test", password: "Tr0ub4dour&3", inviteCode: invite.code },
      now,
    );
    expect(serializeUser(db, registered)).toMatchObject({
      hasPassword: true,
      activeHousehold: { id: "h1", name: "Home" },
    });

    // Login with the same credentials.
    const loggedIn = await loginWithPassword(db, { email: "me@x.test", password: "Tr0ub4dour&3" });
    expect(loggedIn.id).toBe(registered.id);

    // Establish + reload a session.
    const sid = createSession(db, loggedIn.id, now);
    const sessionUser = loadSession(db, sid, now);
    expect(sessionUser?.id).toBe(registered.id);

    // Household scoping passes for the active household.
    expect(isHouseholdMember(db, registered.id, "h1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the full suite**

Run: `cd web && npm test`
Expected: PASS — all auth + household + Plan 1/2 tests green (the new file plus everything from Tasks 1–18 and Plans 1–2).

- [ ] **Step 3: Commit**

```bash
git add web/lib/auth/flow.integration.test.ts
git commit -m "test: add end-to-end password auth integration test"
```

---

### Task 20: Next.js wiring — session glue, server actions, WebAuthn route handlers, Zod schemas

**Files:**
- Create: `web/lib/auth/session.ts` (Next glue: `getSession`, `requireUser`, `requireHousehold`, cookie set/clear)
- Create: `web/lib/auth/ceremony-cookie.ts` (Next glue: set/read/clear ceremony cookie)
- Create: `web/lib/schemas/auth.ts` (Zod input schemas)
- Create: `web/app/(auth)/actions.ts` (password login/register, logout, set/remove password, skip passkey)
- Create: `web/app/(account)/actions.ts` (profile + passkey management + household management)
- Create: `web/app/api/auth/webauthn/register/begin/route.ts`
- Create: `web/app/api/auth/webauthn/register/complete/route.ts`
- Create: `web/app/api/auth/webauthn/login/begin/route.ts`
- Create: `web/app/api/auth/webauthn/login/complete/route.ts`
- Create: `web/app/api/auth/webauthn/add/begin/route.ts`
- Create: `web/app/api/auth/webauthn/add/complete/route.ts`
- Test: `web/lib/schemas/auth.test.ts`

**Interfaces:**
- Consumes: all lib functions above.
- Produces:
  - `getSession(): Promise<User | null>` — reads the signed `cookless_session` cookie, unsigns it, calls `loadSession(db, id, new Date())`.
  - `requireUser(): Promise<User>` — `getSession()` or `redirect("/login")`.
  - `requireHousehold(): Promise<{ user: User; householdId: string }>` — `requireUser()` then `assertHouseholdAccess(user, isHouseholdMember(...))`.
  - `setSessionCookie(userId)`, `clearSessionCookie()`.
  - Zod schemas: `loginPasswordSchema`, `registerPasswordSchema`, `setPasswordSchema`, `removePasswordSchema`, `passkeyBeginSchema`, `passkeyCompleteSchema`, `householdCreateSchema`, `householdUpdateSchema`, `householdSettingsSchema`.

This task is wiring; only the Zod schemas get a unit test (they are pure). The glue and the actions/route-handlers are exercised by hand (and by Playwright in a later UI plan). Keep each wrapper a thin translation: parse input with Zod → call the lib function with the real `db` and `new Date()` → set cookies / build the response → translate `AuthError` to a status.

- [ ] **Step 1: Write the Zod schemas + their test**

Create `web/lib/schemas/auth.ts`:
```ts
import { z } from "zod";

export const loginPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  inviteCode: z.string().min(1),
});

export const setPasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1),
});

export const removePasswordSchema = z.object({
  currentPassword: z.string().min(1),
});

export const passkeyBeginSchema = z.object({
  email: z.string().email(),
  inviteCode: z.string().optional(),
});

export const passkeyCompleteSchema = z.object({
  credential: z.string().min(1), // JSON string of the authenticator response
  deviceName: z.string().default(""),
});

export const householdCreateSchema = z.object({ name: z.string().min(1) });
export const householdUpdateSchema = z.object({ name: z.string().min(1) });
export const householdSettingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  geminiApiKey: z.string().optional(),
});
```

Create `web/lib/schemas/auth.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { loginPasswordSchema, registerPasswordSchema } from "./auth";

describe("auth schemas", () => {
  it("accepts valid login input", () => {
    expect(loginPasswordSchema.parse({ email: "a@x.test", password: "x" })).toEqual({
      email: "a@x.test",
      password: "x",
    });
  });

  it("rejects a bad email", () => {
    expect(loginPasswordSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("requires an invite code on registration", () => {
    expect(
      registerPasswordSchema.safeParse({ email: "a@x.test", password: "x" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the schema test**

Run: `cd web && npx vitest run lib/schemas/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Write the session glue**

Create `web/lib/auth/session.ts`:
```ts
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_MS, getAuthSecret, getAllowedRpIds, resolveRpId } from "./config";
import { assertHouseholdAccess, isHouseholdMember } from "./scoping";
import { createSession, deleteSession, loadSession, type User } from "./session-store";
import { sign, unsign } from "./signing";

export async function getSession(): Promise<User | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const id = unsign(raw, getAuthSecret());
  if (!id) return null;
  return loadSession(db, id, new Date());
}

export async function requireUser(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export async function requireHousehold(): Promise<{ user: User; householdId: string }> {
  const user = await requireUser();
  const member = user.activeHouseholdId
    ? isHouseholdMember(db, user.id, user.activeHouseholdId)
    : false;
  return assertHouseholdAccess(user, member);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const id = createSession(db, userId, new Date());
  (await cookies()).set(SESSION_COOKIE, sign(id, getAuthSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    const id = unsign(raw, getAuthSecret());
    if (id) deleteSession(db, id);
  }
  store.delete(SESSION_COOKIE);
}

/** RP id derived from the current request Host header (port-stripped, validated). */
export async function currentRpId(): Promise<string> {
  const host = (await headers()).get("host") ?? "localhost";
  return resolveRpId(host, getAllowedRpIds());
}
```

- [ ] **Step 4: Write the ceremony-cookie glue**

Create `web/lib/auth/ceremony-cookie.ts`:
```ts
import { cookies } from "next/headers";
import { CEREMONY_COOKIE, CEREMONY_TTL_MS, getAuthSecret } from "./config";
import { type CeremonyState, decodeCeremony, encodeCeremony } from "./ceremony";

export async function setCeremonyCookie(state: CeremonyState): Promise<void> {
  (await cookies()).set(CEREMONY_COOKIE, encodeCeremony(state, getAuthSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(CEREMONY_TTL_MS / 1000),
  });
}

export async function readCeremonyCookie(): Promise<CeremonyState | null> {
  const raw = (await cookies()).get(CEREMONY_COOKIE)?.value;
  return raw ? decodeCeremony(raw, getAuthSecret()) : null;
}

export async function clearCeremonyCookie(): Promise<void> {
  (await cookies()).delete(CEREMONY_COOKIE);
}
```

- [ ] **Step 5: Write the auth server actions**

Create `web/app/(auth)/actions.ts`:
```ts
"use server";

import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { loginWithPassword } from "@/lib/auth/login";
import { removePassword, setPassword, skipPasskey } from "@/lib/auth/password-management";
import { registerWithPassword } from "@/lib/auth/register";
import { serializeUser, type UserDto } from "@/lib/auth/serialize";
import { clearSessionCookie, requireUser, setSessionCookie } from "@/lib/auth/session";
import {
  loginPasswordSchema,
  registerPasswordSchema,
  removePasswordSchema,
  setPasswordSchema,
} from "@/lib/schemas/auth";

type Result = { ok: true; user?: UserDto } | { ok: false; status: number; message: string };

function fail(e: unknown): Result {
  if (e instanceof AuthError) return { ok: false, status: e.status, message: e.message };
  throw e;
}

export async function loginPasswordAction(input: unknown): Promise<Result> {
  try {
    const { email, password } = loginPasswordSchema.parse(input);
    const user = await loginWithPassword(db, { email, password });
    await setSessionCookie(user.id);
    return { ok: true, user: serializeUser(db, user) };
  } catch (e) {
    return fail(e);
  }
}

export async function registerPasswordAction(input: unknown): Promise<Result> {
  try {
    const { email, password, inviteCode } = registerPasswordSchema.parse(input);
    const user = await registerWithPassword(db, { email, password, inviteCode }, new Date());
    await setSessionCookie(user.id);
    return { ok: true, user: serializeUser(db, user) };
  } catch (e) {
    return fail(e);
  }
}

export async function logoutAction(): Promise<Result> {
  await clearSessionCookie();
  return { ok: true };
}

export async function setPasswordAction(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    await setPassword(db, user.id, setPasswordSchema.parse(input));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePasswordAction(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    await removePassword(db, user.id, removePasswordSchema.parse(input));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function skipPasskeyAction(): Promise<Result> {
  try {
    const user = await requireUser();
    skipPasskey(db, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
```

- [ ] **Step 6: Write the account/household server actions**

Create `web/app/(account)/actions.ts`:
```ts
"use server";

import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { deletePasskey, listPasskeys } from "@/lib/auth/passkey-management";
import { updateUser } from "@/lib/auth/profile";
import { serializeUser } from "@/lib/auth/serialize";
import { requireUser } from "@/lib/auth/session";
import {
  createHousehold,
  listHouseholds,
  switchHousehold,
  updateHousehold,
  updateHouseholdSettings,
} from "@/lib/households/manage";
import {
  createHouseholdInvite,
  deleteHousehold,
  leaveHousehold,
  listMembers,
  removeMember,
  transferOwnership,
} from "@/lib/households/membership";
import {
  householdCreateSchema,
  householdSettingsSchema,
  householdUpdateSchema,
} from "@/lib/schemas/auth";

type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function run<T>(fn: (userId: string) => Promise<T> | T): Promise<Result<T>> {
  try {
    const user = await requireUser();
    return { ok: true, data: await fn(user.id) };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, status: e.status, message: e.message };
    throw e;
  }
}

export const updateProfileAction = (input: { preferredLanguage?: string; activeHouseholdId?: string }) =>
  run((uid) => serializeUser(db, updateUser(db, uid, input)));

export const listPasskeysAction = () => run((uid) => listPasskeys(db, uid));
export const deletePasskeyAction = (passkeyId: string) =>
  run((uid) => deletePasskey(db, uid, passkeyId));

export const createHouseholdAction = (input: unknown) =>
  run((uid) => createHousehold(db, uid, householdCreateSchema.parse(input), new Date()));
export const listHouseholdsAction = () => run((uid) => listHouseholds(db, uid));
export const updateHouseholdAction = (id: string, input: unknown) =>
  run((uid) => updateHousehold(db, uid, id, householdUpdateSchema.parse(input)));
export const updateHouseholdSettingsAction = (id: string, input: unknown) =>
  run((uid) => updateHouseholdSettings(db, uid, id, householdSettingsSchema.parse(input)));
export const switchHouseholdAction = (id: string) => run((uid) => switchHousehold(db, uid, id));
export const listMembersAction = (id: string) => run(() => listMembers(db, id));
export const leaveHouseholdAction = (id: string) => run((uid) => leaveHousehold(db, uid, id));
export const removeMemberAction = (id: string, memberId: number) =>
  run((uid) => removeMember(db, uid, id, memberId));
export const transferOwnershipAction = (id: string, memberId: number) =>
  run((uid) => transferOwnership(db, uid, id, memberId));
export const deleteHouseholdAction = (id: string) => run((uid) => deleteHousehold(db, uid, id));
export const createHouseholdInviteAction = (id: string) =>
  run((uid) => createHouseholdInvite(db, uid, id, new Date()));
```

- [ ] **Step 7: Write the WebAuthn route handlers**

Create a shared helper inline in each route (keep them small). Create `web/app/api/auth/webauthn/register/begin/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginPasskeyRegistration } from "@/lib/auth/passkey-auth";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId } from "@/lib/auth/session";
import { passkeyBeginSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  try {
    const { email, inviteCode } = passkeyBeginSchema.parse(await req.json());
    if (!inviteCode) throw new AuthError(400, "Invite code is required.");
    const rpId = await currentRpId();
    const { options, ceremony } = await beginPasskeyRegistration(
      db,
      { email, inviteCode },
      rpId,
      new Date(),
    );
    await setCeremonyCookie(ceremony);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

Create `web/app/api/auth/webauthn/register/complete/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { completePasskeyRegistration } from "@/lib/auth/passkey-auth";
import { clearCeremonyCookie, readCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { serializeUser } from "@/lib/auth/serialize";
import { currentRpId, setSessionCookie } from "@/lib/auth/session";
import { passkeyCompleteSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  try {
    const { credential, deviceName } = passkeyCompleteSchema.parse(await req.json());
    const ceremony = await readCeremonyCookie();
    if (!ceremony) throw new AuthError(400, "No registration in progress.");
    const rpId = await currentRpId();
    const user = await completePasskeyRegistration(
      db,
      { responseJson: credential, deviceName },
      ceremony,
      rpId,
      new Date(),
    );
    await clearCeremonyCookie();
    await setSessionCookie(user.id);
    return NextResponse.json(serializeUser(db, user));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

Create `web/app/api/auth/webauthn/login/begin/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginPasskeyLogin } from "@/lib/auth/passkey-auth";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId } from "@/lib/auth/session";
import { passkeyBeginSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  try {
    const { email } = passkeyBeginSchema.parse(await req.json());
    const rpId = await currentRpId();
    const { options, ceremony } = await beginPasskeyLogin(db, { email }, rpId);
    await setCeremonyCookie(ceremony);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

Create `web/app/api/auth/webauthn/login/complete/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { completePasskeyLogin } from "@/lib/auth/passkey-auth";
import { clearCeremonyCookie, readCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { serializeUser } from "@/lib/auth/serialize";
import { currentRpId, setSessionCookie } from "@/lib/auth/session";
import { passkeyCompleteSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  try {
    const { credential } = passkeyCompleteSchema.parse(await req.json());
    const ceremony = await readCeremonyCookie();
    if (!ceremony) throw new AuthError(400, "No login in progress.");
    const rpId = await currentRpId();
    const user = await completePasskeyLogin(db, { responseJson: credential }, ceremony, rpId);
    await clearCeremonyCookie();
    await setSessionCookie(user.id);
    return NextResponse.json(serializeUser(db, user));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

Create `web/app/api/auth/webauthn/add/begin/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginAddPasskey } from "@/lib/auth/passkey-management";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId, requireUser } from "@/lib/auth/session";

export async function POST() {
  try {
    const user = await requireUser();
    const rpId = await currentRpId();
    const { options, ceremony } = await beginAddPasskey(db, user.id, rpId);
    await setCeremonyCookie(ceremony);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

Create `web/app/api/auth/webauthn/add/complete/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { completeAddPasskey } from "@/lib/auth/passkey-management";
import { clearCeremonyCookie, readCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { requireUser, currentRpId } from "@/lib/auth/session";
import { passkeyCompleteSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { credential, deviceName } = passkeyCompleteSchema.parse(await req.json());
    const ceremony = await readCeremonyCookie();
    if (!ceremony) throw new AuthError(400, "No pending passkey addition.");
    const rpId = await currentRpId();
    const dto = await completeAddPasskey(
      db,
      { userId: user.id, responseJson: credential, deviceName },
      ceremony,
      rpId,
      new Date(),
    );
    await clearCeremonyCookie();
    return NextResponse.json(dto);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 8: Type-check and run the full suite**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: type-check clean; all tests PASS. If `tsc` flags the route-handler folder `(auth)`/`(account)` route groups or `next/headers` typing, confirm Next 16's generated types are present (run `npm run build` once to emit `.next/types`, or add `// @ts-expect-error` only as a last resort with a comment — do not silence real type errors).

- [ ] **Step 9: Commit**

```bash
git add web/lib/auth/session.ts web/lib/auth/ceremony-cookie.ts web/lib/schemas/auth.ts web/lib/schemas/auth.test.ts "web/app/(auth)/actions.ts" "web/app/(account)/actions.ts" web/app/api/auth/webauthn
git commit -m "feat: wire auth into Next.js (session glue, server actions, WebAuthn routes)"
```

---

## Self-Review

**Spec coverage (design §Auth):**
- Sessions — signed httpOnly cookie + sessions table → Tasks 1, 2, 5, 20. ✓
- `getSession()` / `requireHousehold()` → Task 20 (glue) over Task 6 (decision logic). ✓
- Passkeys — `@simplewebauthn/server`, 4+2 route handlers, stores credential_id/public_key/sign_count, clone detection → Tasks 8, 13, 15, 20. ✓
- Password fallback — argon2 → Tasks 4, 11, 12, 14. ✓
- Multi-tenant scoping — every query takes householdId; helper enforces filter → Tasks 6, 20. ✓
- Onboarding wizard (change password → add passkey → create household → done) → onboarding-step transitions in Tasks 11, 13, 14, 15, 17. ✓ (UI deferred per scope decision.)
- PATs dropped — no bearer auth implemented. ✓
- Full household management (chosen scope) → Tasks 17, 18. ✓

**Placeholder scan:** `seedDefaultTags` in Task 17 is an intentional, documented stub (its real body belongs to the recipe-tagging plan) — not a plan placeholder; every other step ships real code. No TBD/TODO left.

**Type consistency:** `Db`, `User`, `UserDto`, `CeremonyState`, `Invite`, `HouseholdDto`, `MemberDto`, `PasskeyDto` defined once and reused with consistent names; `roleForInviteCreator` (Task 11) reused by Task 13; `requireOwner` (Task 17) reused by Task 18; `isHouseholdMember`/`assertHouseholdAccess` (Task 6) reused by Tasks 16, 17, 20.

**Known fidelity trade-offs (acknowledged in the design):** common-password list is a subset of Django's 20k; password-similarity uses `quick_ratio` (Django's actual algorithm) but the email-part splitting is simplified. WebAuthn `verify*` paths are unit-tested via mocks (a real authenticator response cannot be fabricated) — end-to-end passkey verification is a Playwright concern for the UI plan.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-27-nextjs-migration-03-auth.md`.
</content>
</invoke>
