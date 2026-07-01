import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { households, users } from "@/lib/db/schema";
import { createInvite } from "@/lib/households/invites";
import { registerWithPassword } from "./register";
import { loginWithPassword } from "./login";
import { createSession, loadSession } from "./session-store";
import { serializeUser } from "./serialize";
import { isHouseholdMember } from "./scoping";

const now = new Date("2026-06-27T12:00:00Z");

describe("password auth end-to-end (lib level)", () => {
  it("register -> login -> session -> scoped access", async () => {
    const db = createTestDb();
    db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
    db.insert(users).values({ id: "owner", email: "o@x.test", isActive: false, createdAt: now }).run();
    const invite = createInvite(db, { householdId: "h1", createdById: "owner" }, now);

    // Register (bootstrap invite -> OWNER).
    const registered = await registerWithPassword(
      db,
      { email: "me@x.test", password: "Tr0ub4dour&3", inviteCode: invite.code },
      now,
    );
    expect(serializeUser(db, registered)).toMatchObject({
      hasPassword: true,
      activeHousehold: { id: "h1", name: "Home" },
    });

    // Login with the same credentials.
    const loggedIn = await loginWithPassword(db, { email: "me@x.test", password: "Tr0ub4dour&3" });
    expect(loggedIn.id).toBe(registered.id);

    // Establish + reload a session.
    const sid = createSession(db, loggedIn.id, now);
    const sessionUser = loadSession(db, sid, now);
    expect(sessionUser?.id).toBe(registered.id);

    // Household scoping passes for the active household.
    expect(isHouseholdMember(db, registered.id, "h1")).toBe(true);
  });
});
