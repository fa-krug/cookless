import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { toggleShoppingItem, setShoppingItemsChecked } from "@/lib/shopping/items";
import { shoppingSyncSchema } from "@/lib/schemas/shopping";

export async function POST(req: Request) {
  try {
    const { householdId } = await requireHousehold();
    const raw = await req.json().catch(() => null);
    const parsed = shoppingSyncSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }
    const body = parsed.data;
    if (body.kind === "toggle") {
      const checked = toggleShoppingItem(db, householdId, body.itemId);
      return NextResponse.json({ checked });
    }
    const count = setShoppingItemsChecked(db, householdId, body.itemIds, false);
    return NextResponse.json({ count });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ message: e.message }, { status: e.status });
    }
    throw e;
  }
}
