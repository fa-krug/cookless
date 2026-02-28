import { z } from "zod";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "passwords_mismatch",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export const settingsPasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string().min(1),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "passwords_mismatch",
    path: ["confirmPassword"],
  });

export type SettingsPasswordFormValues = z.infer<typeof settingsPasswordSchema>;
