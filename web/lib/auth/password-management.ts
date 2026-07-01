import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { passkeyCredentials, users } from "@/lib/db/schema";
import { AuthError } from "./errors";
import { hashPassword, hasUsablePassword, validatePassword, verifyPassword } from "./password";
import { deleteUserSessions } from "./session-store";

function requireUser(db: Db, userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AuthError(404, "User not found.");
  return user;
}

export async function setPassword(
  db: Db,
  userId: string,
  args: { currentPassword?: string; newPassword: string },
): Promise<void> {
  const user = requireUser(db, userId);
  if (hasUsablePassword(user.password)) {
    if (!args.currentPassword || !(await verifyPassword(user.password, args.currentPassword))) {
      throw new AuthError(400, "Current password is incorrect.");
    }
  }
  validatePassword(args.newPassword, { email: user.email });

  const onboardingStep =
    user.onboardingStep === "CHANGE_PASSWORD" ? "ADD_PASSKEY" : user.onboardingStep;
  db.update(users)
    .set({ password: await hashPassword(args.newPassword), onboardingStep })
    .where(eq(users.id, userId))
    .run();
  deleteUserSessions(db, userId);
}

export async function removePassword(
  db: Db,
  userId: string,
  args: { currentPassword: string },
): Promise<void> {
  const user = requireUser(db, userId);
  if (!hasUsablePassword(user.password)) {
    throw new AuthError(400, "No password is set.");
  }
  if (!(await verifyPassword(user.password, args.currentPassword))) {
    throw new AuthError(400, "Current password is incorrect.");
  }
  const passkey = db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .get();
  if (!passkey) {
    throw new AuthError(400, "Cannot remove your password without a passkey set.");
  }
  db.update(users).set({ password: "" }).where(eq(users.id, userId)).run();
  deleteUserSessions(db, userId);
}

export function skipPasskey(db: Db, userId: string): void {
  const user = requireUser(db, userId);
  if (user.onboardingStep === "ADD_PASSKEY") {
    db.update(users).set({ onboardingStep: "CREATE_HOUSEHOLD" }).where(eq(users.id, userId)).run();
  }
}
