import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";
import { setUserPassword } from "./set-password";

function seedUser(db: Db, email: string, password = "") {
  db.run(
    sql`INSERT INTO users (id, email, password, created_at)
        VALUES (${`u-${email}`}, ${email}, ${password}, ${Math.floor(Date.now() / 1000)})`,
  );
}

describe("setUserPassword", () => {
  it("updates the password hash for an existing user", async () => {
    const db = createTestDb();
    seedUser(db, "alice@test.test", "");

    await setUserPassword(db, "alice@test.test", "Br4nd!newpass");

    const [row] = db.select({ password: users.password }).from(users).where(eq(users.email, "alice@test.test")).all();
    expect(await verifyPassword(row.password, "Br4nd!newpass")).toBe(true);
  });

  it("throws for an unknown email", async () => {
    const db = createTestDb();

    await expect(setUserPassword(db, "nobody@test.test", "Br4nd!newpass")).rejects.toThrow();
  });

  it("throws and does NOT update for a weak password (too short)", async () => {
    const db = createTestDb();
    const initialHash = await hashPassword("OldValid1!");
    seedUser(db, "bob@test.test", initialHash);

    await expect(setUserPassword(db, "bob@test.test", "short")).rejects.toThrow();

    // Password must be unchanged
    const [row] = db.select({ password: users.password }).from(users).where(eq(users.email, "bob@test.test")).all();
    expect(await verifyPassword(row.password, "OldValid1!")).toBe(true);
  });

  it("throws and does NOT update for a password too similar to the email", async () => {
    const db = createTestDb();
    const initialHash = await hashPassword("OldValid1!");
    seedUser(db, "charlie@test.test", initialHash);

    // "charlie" is a part of the email and will be flagged as too similar
    await expect(setUserPassword(db, "charlie@test.test", "charlie123")).rejects.toThrow();

    const [row] = db.select({ password: users.password }).from(users).where(eq(users.email, "charlie@test.test")).all();
    expect(await verifyPassword(row.password, "OldValid1!")).toBe(true);
  });
});
