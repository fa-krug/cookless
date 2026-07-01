import { NextResponse } from "next/server";
import { requireHousehold } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { listRecipes } from "@/lib/queries/recipes";

export async function GET(req: Request) {
  try {
    const { householdId } = await requireHousehold();
    const p = new URL(req.url).searchParams;

    const list = p.get("list") ?? undefined;
    const q = p.get("q") ?? undefined;
    const sort = p.get("sort") ?? "name-asc";
    const locale = p.get("locale") ?? "en";
    const tagsParam = p.get("tags");
    const tagIds = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined;
    const offset = Math.max(0, parseInt(p.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(p.get("limit") ?? "20", 10) || 20));

    const result = listRecipes(db, householdId, {
      listType: list,
      search: q,
      sort,
      locale,
      tagIds,
      offset,
      limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
