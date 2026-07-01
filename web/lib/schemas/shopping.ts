import { z } from "zod";

export const shoppingSyncSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("toggle"), itemId: z.string().min(1) }),
  z.object({ kind: z.literal("uncheck-all"), itemIds: z.array(z.string().min(1)) }),
]);

export type ShoppingSyncInput = z.infer<typeof shoppingSyncSchema>;
