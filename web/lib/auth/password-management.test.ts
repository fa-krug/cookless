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
