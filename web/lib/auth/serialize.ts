import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, passkeyCredentials } from "@/lib/db/schema";
import { hasUsablePassword } from "./password";
import type { User } from "./session-store";

export interface UserDto {
  id: string;
  email: string;
  preferredLanguage: string;
  onboardingStep: string;
  isStaff: boolean;
  hasPassword: boolean;
  hasPasskey: boolean;
  activeHousehold: { id: string; name: string } | null;
}

export function serializeUser(db: Db, user: User): UserDto {
  const passkey = db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, user.id))
    .get();

  let activeHousehold: { id: string; name: string } | null = null;
  if (user.activeHouseholdId) {
    const h = db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(eq(households.id, user.activeHouseholdId))
      .get();
    activeHousehold = h ?? null;
  }

  return {
    id: user.id,
    email: user.email,
    preferredLanguage: user.preferredLanguage,
    onboardingStep: user.onboardingStep,
    isStaff: user.isStaff,
    hasPassword: hasUsablePassword(user.password),
    hasPasskey: passkey != null,
    activeHousehold,
  };
}
