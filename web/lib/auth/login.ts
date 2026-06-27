import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { verifyPassword } from "./password";
import type { User } from "./session-store";

export async function loginWithPassword(
  db: Db,
  args: { email: string; password: string },
): Promise<User> {
  const user = db.select().from(users).where(eq(users.email, args.email)).get();
  if (!user || !(await verifyPassword(user.password, args.password))) {
    throw new AuthError(401, "Invalid email or password.");
  }
  return user;
}
