import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { validatePassword, hashPassword } from "@/lib/auth/password";
import { AuthError } from "@/lib/auth/errors";

/**
 * Looks up a user by email and sets a new hashed password.
 * Throws AuthError(404) if the user is not found.
 * Throws AuthError(400) if the password fails validation (propagated from validatePassword).
 */
export async function setUserPassword(db: Db, email: string, newPassword: string): Promise<void> {
  const [user] = db.select({ id: users.id }).from(users).where(eq(users.email, email)).all();
  if (!user) {
    throw new AuthError(404, `No user found with email: ${email}`);
  }

  // Validate before hashing — throws AuthError(400) on weak password
  validatePassword(newPassword, { email });

  const hash = await hashPassword(newPassword);

  db.update(users).set({ password: hash }).where(eq(users.email, email)).run();
}

if (process.env.VITEST !== "true") {
  const [email, newPassword] = process.argv.slice(2);

  if (!email || !newPassword) {
    console.error("Usage: npx tsx scripts/set-password.ts <email> <newPassword>");
    process.exit(1);
  }

  const dbPath = process.env.DATABASE_FILE ?? "./data/cookless.db";
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema }) as Db;

  setUserPassword(db, email, newPassword).then(() => {
    console.log(`Password updated for ${email}`);
  }).catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
