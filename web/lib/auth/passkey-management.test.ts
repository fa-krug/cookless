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
