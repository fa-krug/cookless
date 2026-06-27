import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { SESSION_TTL_MS } from "./config";

export type User = typeof users.$inferSelect;

export function createSession(db: Db, userId: string, now: Date): string {
  const id = randomBytes(32).toString("base64url");
  db.insert(sessions)
    .values({
      id,
      userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
    .run();
  return id;
}

export function loadSession(db: Db, sessionId: string, now: Date): User | null {
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    deleteSession(db, sessionId);
    return null;
  }
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  return user ?? null;
}

export function deleteSession(db: Db, sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function deleteUserSessions(db: Db, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
