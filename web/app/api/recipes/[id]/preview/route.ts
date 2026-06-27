import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { getRecipe, listIngredients, listUnits } from "@/lib/queries/recipes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { householdId } = await requireHousehold();
    const recipe = getRecipe(db, householdId, id);
    if (!recipe) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Include ingredient and unit name maps so the client can display names
    // without extra fetches. listIngredients/listUnits are global (not household-scoped).
    const ingredients = listIngredients(db);
    const units = listUnits(db);

    return NextResponse.json({ recipe, ingredients, units });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
