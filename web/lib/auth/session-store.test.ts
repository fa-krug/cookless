import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { users } from "@/lib/db/schema";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  loadSession,
} from "./session-store";

function makeUser(db: ReturnType<typeof createTestDb>, now: Date) {
  const id = crypto.randomUUID();
  db.insert(users).values({ id, email: `${id}@x.test`, createdAt: now }).run();
  return id;
}

describe("session store", () => {
  const now = new Date("2026-06-27T12:00:00Z");

  it("creates and loads a session", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const sid = createSession(db, userId, now);
    const user = loadSession(db, sid, now);
    expect(user?.id).toBe(userId);
  });

  it("returns null for an unknown session", () => {
    const db = createTestDb();
    expect(loadSession(db, "nope", now)).toBeNull();
  });

  it("expires and deletes a stale session", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const sid = createSession(db, userId, now);
    const later = new Date("2026-07-20T12:00:00Z"); // > 14 days later
    expect(loadSession(db, sid, later)).toBeNull();
    // second load confirms the row was deleted (still null, no throw)
    expect(loadSession(db, sid, later)).toBeNull();
  });

  it("deletes a session explicitly", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const sid = createSession(db, userId, now);
    deleteSession(db, sid);
    expect(loadSession(db, sid, now)).toBeNull();
  });

  it("deletes all sessions for a user", () => {
    const db = createTestDb();
    const userId = makeUser(db, now);
    const a = createSession(db, userId, now);
    const b = createSession(db, userId, now);
    deleteUserSessions(db, userId);
    expect(loadSession(db, a, now)).toBeNull();
    expect(loadSession(db, b, now)).toBeNull();
  });
});
