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
