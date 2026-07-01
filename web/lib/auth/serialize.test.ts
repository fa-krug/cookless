import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, passkeyCredentials, users } from "@/lib/db/schema";
import { serializeUser } from "./serialize";
import type { User } from "./session-store";

const now = new Date("2026-06-27T12:00:00Z");

describe("serializeUser", () => {
  it("computes hasPassword/hasPasskey and embeds the active household", () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    const u: User = {
      id: "u1", email: "a@x.test", password: "$argon2id$x", preferredLanguage: "de",
      activeHouseholdId: "h1", onboardingStep: "COMPLETED", isActive: true, isStaff: false,
      createdAt: now,
    };
    db.insert(users).values(u).run();
    db.insert(passkeyCredentials).values({
      id: "p1", userId: "u1", credentialId: Buffer.from([1, 2, 3]),
      publicKey: Buffer.from([4, 5]), signCount: 0, deviceName: "Phone", createdAt: now,
    }).run();

    const dto = serializeUser(db, u);
    expect(dto).toMatchObject({
      id: "u1", email: "a@x.test", preferredLanguage: "de", onboardingStep: "COMPLETED",
      isStaff: false, hasPassword: true, hasPasskey: true,
      activeHousehold: { id: "h1", name: "Home" },
    });
  });

  it("reports no password/passkey/household for a bare user", () => {
    const db = createTestDb();
    const u: User = {
      id: "u2", email: "b@x.test", password: "", preferredLanguage: "en",
      activeHouseholdId: null, onboardingStep: "CHANGE_PASSWORD", isActive: true, isStaff: false,
      createdAt: now,
    };
    db.insert(users).values(u).run();
    const dto = serializeUser(db, u);
    expect(dto.hasPassword).toBe(false);
    expect(dto.hasPasskey).toBe(false);
    expect(dto.activeHousehold).toBeNull();
  });
});
