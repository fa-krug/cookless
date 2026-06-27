import { z } from "zod";

export const bulkToggleSchema = z.object({
  itemIds: z.array(z.string().uuid()),
  isChecked: z.boolean(),
});
export type BulkToggleInput = z.infer<typeof bulkToggleSchema>;
