import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, tags } from "@/lib/db/schema";
import { seedDefaultTags } from "./tags";
import { DEFAULT_TAG_COUNT } from "./tag-defaults";

const now = new Date("2026-06-27T12:00:00Z");

function seedHousehold() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  return db;
}

describe("seedDefaultTags", () => {
  it("seeds all default tags marked is_default", () => {
    const db = seedHousehold();
    seedDefaultTags(db, "h1");
    const rows = db.select().from(tags).where(eq(tags.householdId, "h1")).all();
    expect(rows).toHaveLength(DEFAULT_TAG_COUNT);
    expect(rows.every((r) => r.isDefault)).toBe(true);
  });

  it("is idempotent — running twice does not duplicate", () => {
    const db = seedHousehold();
    seedDefaultTags(db, "h1");
    seedDefaultTags(db, "h1");
    const rows = db.select().from(tags).where(eq(tags.householdId, "h1")).all();
    expect(rows).toHaveLength(DEFAULT_TAG_COUNT);
  });
});
