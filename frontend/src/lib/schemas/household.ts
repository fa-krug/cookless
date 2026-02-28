import { z } from "zod";

export const householdNameSchema = z.object({
  name: z.string().min(1),
});

export type HouseholdNameFormValues = z.infer<typeof householdNameSchema>;

export const joinHouseholdSchema = z.object({
  code: z.string().min(1),
});

export type JoinHouseholdFormValues = z.infer<typeof joinHouseholdSchema>;
