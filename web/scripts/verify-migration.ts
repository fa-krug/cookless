import type { Db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type CheckResult = { name: string; ok: boolean; detail: string };
export type VerifyResult = { checks: CheckResult[]; ok: boolean };

/**
 * Run all post-migration checks against the given Drizzle db handle.
 * Pure function — no process.exit, no console output.
 */
export function verifyMigration(db: Db): VerifyResult {
  const checks: CheckResult[] = [];

  // 1. Password reset applied — no user should have a non-empty password
  const [{ count: usersWithPassword }] = db.all<{ count: number }>(
    sql`SELECT count(*) AS count FROM users WHERE password != ''`,
  );
  checks.push({
    name: "users.password all reset",
    ok: usersWithPassword === 0,
    detail:
      usersWithPassword === 0
        ? "all passwords are empty (force-reset applied)"
        : `${usersWithPassword} user(s) still have a non-empty password`,
  });

  // 2. Foreign key integrity
  const fkViolations = db.all<Record<string, unknown>>(sql`PRAGMA foreign_key_check`);
  checks.push({
    name: "foreign_key_check",
    ok: fkViolations.length === 0,
    detail:
      fkViolations.length === 0
        ? "no FK violations"
        : `${fkViolations.length} FK violation(s): ${JSON.stringify(fkViolations.slice(0, 3))}`,
  });

  // 3. Image paths must be relative (not /media/... or http...)
  const badImages = db.all<{ id: string; image: string }>(
    sql`SELECT id, image FROM recipes WHERE image != '' AND (image LIKE '/media/%' OR image LIKE 'http%')`,
  );
  checks.push({
    name: "recipes.image paths are relative",
    ok: badImages.length === 0,
    detail:
      badImages.length === 0
        ? "all image paths are relative"
        : `${badImages.length} recipe(s) with absolute/media image paths: ${badImages.slice(0, 3).map((r) => r.image).join(", ")}`,
  });

  // 4a. recipe_ingredients.quantity — all must parse as finite numbers
  const riRows = db.all<{ id: number; quantity: string }>(
    sql`SELECT id, quantity FROM recipe_ingredients`,
  );
  const badRiQuantities = riRows.filter(
    (r) => String(r.quantity).trim() === "" || !Number.isFinite(Number(r.quantity)),
  );
  checks.push({
    name: "recipe_ingredients.quantity all numeric",
    ok: badRiQuantities.length === 0,
    detail:
      badRiQuantities.length === 0
        ? `all ${riRows.length} recipe_ingredient quantities are numeric`
        : `${badRiQuantities.length} non-numeric quantity value(s): ${badRiQuantities.slice(0, 3).map((r) => `${r.id}:${r.quantity}`).join(", ")}`,
  });

  // 4b. shopping_list_items.quantity — all must parse as finite numbers
  const sliRows = db.all<{ id: string; quantity: string }>(
    sql`SELECT id, quantity FROM shopping_list_items`,
  );
  const badSliQuantities = sliRows.filter(
    (r) => String(r.quantity).trim() === "" || !Number.isFinite(Number(r.quantity)),
  );
  checks.push({
    name: "shopping_list_items.quantity all numeric",
    ok: badSliQuantities.length === 0,
    detail:
      badSliQuantities.length === 0
        ? `all ${sliRows.length} shopping_list_item quantities are numeric`
        : `${badSliQuantities.length} non-numeric quantity value(s): ${badSliQuantities.slice(0, 3).map((r) => `${r.id}:${r.quantity}`).join(", ")}`,
  });

  // 4c. meal_plans.known_ratio — null is valid (nullable field); non-null must be finite
  const mpRows = db.all<{ id: string; known_ratio: string | null }>(
    sql`SELECT id, known_ratio FROM meal_plans WHERE known_ratio IS NOT NULL`,
  );
  const badKnownRatio = mpRows.filter(
    (r) => String(r.known_ratio).trim() === "" || !Number.isFinite(Number(r.known_ratio)),
  );
  checks.push({
    name: "meal_plans.known_ratio all numeric (non-null)",
    ok: badKnownRatio.length === 0,
    detail:
      badKnownRatio.length === 0
        ? `all ${mpRows.length} non-null known_ratio values are numeric`
        : `${badKnownRatio.length} non-numeric known_ratio value(s): ${badKnownRatio.slice(0, 3).map((r) => `${r.id}:${r.known_ratio}`).join(", ")}`,
  });

  // 5. Per-table row counts (informational — always ok)
  const tables = [
    "households",
    "users",
    "household_members",
    "invites",
    "passkey_credentials",
    "sessions",
    "ingredients",
    "units",
    "tags",
    "recipes",
    "recipe_ingredients",
    "cooking_steps",
    "step_ingredients",
    "recipe_tags",
    "meal_plans",
    "plan_iterations",
    "meal_plan_entries",
    "meal_plan_excluded_tags",
    "shopping_lists",
    "shopping_list_items",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [{ n }] = db.all<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.raw(table)}`);
    counts[table] = n;
  }
  const countDetail = Object.entries(counts)
    .map(([t, n]) => `${t}=${n}`)
    .join(", ");
  checks.push({
    name: "row counts (informational)",
    ok: true,
    detail: countDetail,
  });

  const nonInfoChecks = checks.slice(0, checks.length - 1); // last is informational
  const ok = nonInfoChecks.every((c) => c.ok);
  return { checks, ok };
}

// Runner — only executes when called directly (not under Vitest)
if (process.env.VITEST !== "true") {
  void (async () => {
    const Database = (await import("better-sqlite3")).default;
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const schema = await import("../lib/db/schema.js");

    const dbPath = process.env.DATABASE_FILE ?? "./data/cookless.db";
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    const { checks, ok } = verifyMigration(db);

    for (const check of checks) {
      const status = check.ok ? "PASS" : "FAIL";
      console.log(`${status}  [${check.name}] ${check.detail}`);
    }

    console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
    process.exit(ok ? 0 : 1);
  })();
}
