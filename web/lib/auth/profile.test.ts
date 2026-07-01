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
