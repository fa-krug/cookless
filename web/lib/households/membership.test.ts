import { describe, expect, it, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, householdMembers, users } from "@/lib/db/schema";
import { createHousehold } from "./manage";
import {
  createHouseholdInvite,
  deleteHousehold,
  joinHousehold,
  leaveHousehold,
  listMembers,
  removeMember,
  transferOwnership,
} from "./membership";
import { createInvite } from "./invites";
import { isHouseholdMember } from "@/lib/auth/scoping";

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

describe("joinHousehold", () => {
  test("adds membership, consumes invite, sets active household when joiner had none", () => {
    const db = createTestDb();
    // owner u1 with household h1
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "COMPLETED", createdAt: now }).run();
    const hid = createHousehold(db, "u1", { name: "Home" }, now).id;
    // u2 has no active household
    db.insert(users).values({ id: "u2", email: "b@x.test", createdAt: now }).run();
    // u3 for the "already used" check
    db.insert(users).values({ id: "u3", email: "c@x.test", createdAt: now }).run();

    const inv = createInvite(db, { householdId: hid, createdById: "u1" }, now);
    const res = joinHousehold(db, "u2", inv.code, now);
    expect(res).toEqual({ id: hid, name: "Home" });
    expect(isHouseholdMember(db, "u2", hid)).toBe(true);
    // invite consumed — second join attempt throws
    expect(() => joinHousehold(db, "u3", inv.code, now)).toThrow(/already been used/i);
    // active household set because u2 had none
    const u2 = db.select().from(users).where(eq(users.id, "u2")).get();
    expect(u2!.activeHouseholdId).toBe(hid);
  });

  test("rejects an existing member", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "COMPLETED", createdAt: now }).run();
    const hid = createHousehold(db, "u1", { name: "Home" }, now).id;

    const inv = createInvite(db, { householdId: hid, createdById: "u1" }, now);
    expect(() => joinHousehold(db, "u1", inv.code, now)).toThrow(/already a member/i);
  });

  test("does not change active household when joiner already has one", () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u1", email: "a@x.test", onboardingStep: "COMPLETED", createdAt: now }).run();
    const hid = createHousehold(db, "u1", { name: "Home" }, now).id;
    // u2 already has a different active household
    db.insert(households).values({ id: "other", name: "Other", createdAt: now }).run();
    db.insert(users).values({ id: "u2", email: "b@x.test", activeHouseholdId: "other", createdAt: now }).run();

    const inv = createInvite(db, { householdId: hid, createdById: "u1" }, now);
    joinHousehold(db, "u2", inv.code, now);
    const u2 = db.select().from(users).where(eq(users.id, "u2")).get();
    expect(u2!.activeHouseholdId).toBe("other");
  });
});
