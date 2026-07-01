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
