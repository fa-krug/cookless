import { z } from "zod";

export const tokenCreateSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  preset: z.string(),
  customDate: z.string(),
});

export type TokenCreateFormValues = z.infer<typeof tokenCreateSchema>;
