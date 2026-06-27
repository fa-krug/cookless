import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { householdMembers, passkeyCredentials, users } from "@/lib/db/schema";
import { consumeInvite, validateInvite } from "@/lib/households/invites";
import type { CeremonyState } from "./ceremony";
import { AuthError } from "./errors";
import { roleForInviteCreator } from "./register";
import type { User } from "./session-store";
import {
  b64urlToBuf,
  getAuthenticationOptions,
  getRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn";

export async function beginPasskeyRegistration(
  db: Db,
  args: { email: string; inviteCode: string },
  rpId: string,
  now: Date,
): Promise<{ options: Awaited<ReturnType<typeof getRegistrationOptions>>; ceremony: CeremonyState }> {
  validateInvite(db, args.inviteCode, now);
  if (db.select().from(users).where(eq(users.email, args.email)).get()) {
    throw new AuthError(409, "A user with this email already exists.");
  }
  const tempUserId = randomUUID();
  const options = await getRegistrationOptions({
    userId: tempUserId,
    userEmail: args.email,
    rpId,
    excludeCredentialIds: [],
  });
  return {
    options,
    ceremony: {
      type: "register",
      challenge: options.challenge,
      email: args.email,
      inviteCode: args.inviteCode,
      tempUserId,
    },
  };
}

export async function completePasskeyRegistration(
  db: Db,
  args: { responseJson: string; deviceName: string },
  ceremony: CeremonyState,
  rpId: string,
  now: Date,
): Promise<User> {
  if (ceremony.type !== "register" || !ceremony.email || !ceremony.inviteCode) {
    throw new AuthError(400, "No registration in progress.");
  }
  const verified = await verifyRegistration({
    responseJson: args.responseJson,
    expectedChallenge: ceremony.challenge,
    rpId,
  });
  const invite = validateInvite(db, ceremony.inviteCode, now);
  if (db.select().from(users).where(eq(users.email, ceremony.email)).get()) {
    throw new AuthError(409, "A user with this email already exists.");
  }
  const user = db
    .insert(users)
    .values({
      id: randomUUID(),
      email: ceremony.email,
      password: "",
      activeHouseholdId: invite.householdId,
      onboardingStep: "COMPLETED",
      createdAt: now,
    })
    .returning()
    .get();

  db.insert(passkeyCredentials)
    .values({
      id: randomUUID(),
      userId: user.id,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      signCount: verified.signCount,
      deviceName: args.deviceName,
      createdAt: now,
    })
    .run();

  db.insert(householdMembers)
    .values({
      householdId: invite.householdId,
      userId: user.id,
      role: roleForInviteCreator(db, invite.createdById),
      joinedAt: now,
    })
    .run();

  consumeInvite(db, invite.id, user.id);
  return user;
}

export async function beginPasskeyLogin(
  db: Db,
  args: { email: string },
  rpId: string,
): Promise<{ options: Awaited<ReturnType<typeof getAuthenticationOptions>>; ceremony: CeremonyState }> {
  const user = db.select().from(users).where(eq(users.email, args.email)).get();
  if (!user) throw new AuthError(400, "No account found with this email.");
  const creds = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, user.id))
    .all();
  if (creds.length === 0) throw new AuthError(400, "No passkeys registered for this account.");

  const options = await getAuthenticationOptions({
    rpId,
    allowCredentialIds: creds.map((c) => c.credentialId as Buffer),
  });
  return { options, ceremony: { type: "login", challenge: options.challenge, email: args.email } };
}

export async function completePasskeyLogin(
  db: Db,
  args: { responseJson: string },
  ceremony: CeremonyState,
  rpId: string,
): Promise<User> {
  if (ceremony.type !== "login" || !ceremony.email) {
    throw new AuthError(400, "No login in progress.");
  }
  const parsed = JSON.parse(args.responseJson) as { rawId?: string; id?: string };
  const rawId = parsed.rawId ?? parsed.id;
  if (!rawId) throw new AuthError(400, "Missing credential ID in response.");
  const credentialId = b64urlToBuf(rawId);

  const stored = db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.credentialId, credentialId))
    .get();
  if (!stored) throw new AuthError(400, "Credential not recognized.");

  const user = db.select().from(users).where(eq(users.id, stored.userId)).get();
  if (!user || user.email !== ceremony.email) {
    throw new AuthError(400, "Credential does not belong to this user.");
  }

  const { newSignCount } = await verifyAuthentication({
    responseJson: args.responseJson,
    expectedChallenge: ceremony.challenge,
    rpId,
    credentialId: stored.credentialId as Buffer,
    publicKey: stored.publicKey as Buffer,
    signCount: stored.signCount,
  });

  db.update(passkeyCredentials)
    .set({ signCount: newSignCount })
    .where(eq(passkeyCredentials.id, stored.id))
    .run();

  return user;
}
