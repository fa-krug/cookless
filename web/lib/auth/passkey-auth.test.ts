import { describe, expect, it, vi } from "vitest";
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
  beginFirstRunPasskeyRegistration,
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
