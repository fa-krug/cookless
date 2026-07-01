import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/lib/test/db";
import { households, tags } from "@/lib/db/schema";
import { seedDefaultTags, createTag, updateTag, deleteTag, resetTags } from "./tags";
import { DEFAULT_TAG_COUNT } from "./tag-defaults";
import { AuthError } from "@/lib/auth/errors";

const now = new Date("2026-06-27T12:00:00Z");

function seedHousehold() {
  const db = createTestDb();
  db.insert(households).values({ id: "h1", name: "Home", createdAt: now }).run();
  return db;
}

function twoHouseholds() {
  const db = createTestDb();
  db.insert(households).values([
    { id: "h1", name: "Home", createdAt: now },
    { id: "h2", name: "Other", createdAt: now },
  ]).run();
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

describe("createTag", () => {
  it("creates a custom (non-default) tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    const row = db.select().from(tags).where(eq(tags.id, id)).get();
    expect(row?.isDefault).toBe(false);
    expect(row?.nameEn).toBe("Greek");
  });
  it("rejects an invalid category", () => {
    const db = twoHouseholds();
    expect(() => createTag(db, "h1", { category: "BOGUS", nameEn: "X", nameDe: "X" })).toThrow(AuthError);
  });
});

describe("updateTag", () => {
  it("updates name fields only", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    updateTag(db, "h1", id, { nameEn: "Hellenic", nameDe: "Hellenisch" });
    const row = db.select().from(tags).where(eq(tags.id, id)).get();
    expect(row?.nameEn).toBe("Hellenic");
    expect(row?.category).toBe("CUISINE");
  });
  it("refuses a cross-household tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h2", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    expect(() => updateTag(db, "h1", id, { nameEn: "X", nameDe: "X" })).toThrow(AuthError);
  });
});

describe("deleteTag", () => {
  it("deletes an owned tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    deleteTag(db, "h1", id);
    expect(db.select().from(tags).where(eq(tags.id, id)).get()).toBeUndefined();
  });
  it("refuses a cross-household tag", () => {
    const db = twoHouseholds();
    const { id } = createTag(db, "h2", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    expect(() => deleteTag(db, "h1", id)).toThrow(AuthError);
    expect(db.select().from(tags).where(eq(tags.id, id)).get()).toBeDefined();
  });
});

describe("resetTags", () => {
  it("removes all household tags and reseeds defaults", () => {
    const db = twoHouseholds();
    createTag(db, "h1", { category: "CUISINE", nameEn: "Greek", nameDe: "Griechisch" });
    resetTags(db, "h1");
    const rows = db.select().from(tags).where(eq(tags.householdId, "h1")).all();
    expect(rows).toHaveLength(DEFAULT_TAG_COUNT);
    expect(rows.some((r) => r.nameEn === "Greek")).toBe(false);
  });
});
