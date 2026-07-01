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
