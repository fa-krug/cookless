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
  it("throws AuthError(400) on empty name", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "CREATE_HOUSEHOLD", createdAt: now }).run();
    expect(() => createHousehold(db, "u1", { name: "" }, now)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => createHousehold(db, "u1", { name: "   " }, now)).toThrow(expect.objectContaining({ status: 400 }));
  });

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

  it("throws AuthError(400) on empty name for updateHousehold", () => {
    const db = createTestDb();
    const hid = ownerWithHousehold(db);
    expect(() => updateHousehold(db, "u1", hid, { name: "" })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => updateHousehold(db, "u1", hid, { name: "  " })).toThrow(expect.objectContaining({ status: 400 }));
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
