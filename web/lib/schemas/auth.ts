import { z } from "zod";

export const loginPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  inviteCode: z.string().min(1),
});

export const setPasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1),
});

export const removePasswordSchema = z.object({
  currentPassword: z.string().min(1),
});

export const passkeyBeginSchema = z.object({
  email: z.string().email(),
  inviteCode: z.string().optional(),
});

export const passkeyCompleteSchema = z.object({
  credential: z.string().min(1), // JSON string of the authenticator response
  deviceName: z.string().default(""),
});

export const householdCreateSchema = z.object({ name: z.string().min(1) });
export const householdUpdateSchema = z.object({ name: z.string().min(1) });
export const householdSettingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  geminiApiKey: z.string().optional(),
});
export const joinHouseholdSchema = z.object({ code: z.string().min(1) });
