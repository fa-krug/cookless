"use server";

import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { deletePasskey, listPasskeys } from "@/lib/auth/passkey-management";
import { updateUser } from "@/lib/auth/profile";
import { serializeUser } from "@/lib/auth/serialize";
import { requireUser } from "@/lib/auth/session";
import {
  createHousehold,
  listHouseholds,
  switchHousehold,
  updateHousehold,
  updateHouseholdSettings,
} from "@/lib/households/manage";
import {
  createHouseholdInvite,
  deleteHousehold,
  leaveHousehold,
  listMembers,
  removeMember,
  transferOwnership,
} from "@/lib/households/membership";
import { isHouseholdMember } from "@/lib/auth/scoping";
import {
  householdCreateSchema,
  householdSettingsSchema,
  householdUpdateSchema,
} from "@/lib/schemas/auth";

type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function run<T>(fn: (userId: string) => Promise<T> | T): Promise<Result<T>> {
  try {
    const user = await requireUser();
    return { ok: true, data: await fn(user.id) };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, status: e.status, message: e.message };
    throw e;
  }
}

export const updateProfileAction = async (input: { preferredLanguage?: string; activeHouseholdId?: string }) =>
  run((uid) => serializeUser(db, updateUser(db, uid, input)));

export const listPasskeysAction = async () => run((uid) => listPasskeys(db, uid));
export const deletePasskeyAction = async (passkeyId: string) =>
  run((uid) => deletePasskey(db, uid, passkeyId));

export const createHouseholdAction = async (input: unknown) =>
  run((uid) => createHousehold(db, uid, householdCreateSchema.parse(input), new Date()));
export const listHouseholdsAction = async () => run((uid) => listHouseholds(db, uid));
export const updateHouseholdAction = async (id: string, input: unknown) =>
  run((uid) => updateHousehold(db, uid, id, householdUpdateSchema.parse(input)));
export const updateHouseholdSettingsAction = async (id: string, input: unknown) =>
  run((uid) => updateHouseholdSettings(db, uid, id, householdSettingsSchema.parse(input)));
export const switchHouseholdAction = async (id: string) => run((uid) => switchHousehold(db, uid, id));
export const listMembersAction = async (id: string) =>
  run((uid) => {
    if (!isHouseholdMember(db, uid, id)) {
      throw new AuthError(403, "Not a member of that household.");
    }
    return listMembers(db, id);
  });
export const leaveHouseholdAction = async (id: string) => run((uid) => leaveHousehold(db, uid, id));
export const removeMemberAction = async (id: string, memberId: number) =>
  run((uid) => removeMember(db, uid, id, memberId));
export const transferOwnershipAction = async (id: string, memberId: number) =>
  run((uid) => transferOwnership(db, uid, id, memberId));
export const deleteHouseholdAction = async (id: string) => run((uid) => deleteHousehold(db, uid, id));
export const createHouseholdInviteAction = async (id: string) =>
  run((uid) => createHouseholdInvite(db, uid, id, new Date()));
