"use server";

import { revalidatePath } from "next/cache";
import { withHousehold, type Result } from "@/lib/actions/result";
import { toggleShoppingItem, setShoppingItemsChecked } from "@/lib/shopping/items";

export async function toggleShoppingItemAction(itemId: string): Promise<Result<boolean>> {
  const res = await withHousehold(({ db, householdId }) =>
    toggleShoppingItem(db, householdId, itemId),
  );
  if (res.ok) revalidatePath("/shopping");
  return res;
}

export async function uncheckAllShoppingAction(itemIds: string[]): Promise<Result<number>> {
  const res = await withHousehold(({ db, householdId }) =>
    setShoppingItemsChecked(db, householdId, itemIds, false),
  );
  if (res.ok) revalidatePath("/shopping");
  return res;
}
