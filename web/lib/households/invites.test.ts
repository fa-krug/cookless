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
