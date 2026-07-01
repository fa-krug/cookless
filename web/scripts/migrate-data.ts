import Database from "better-sqlite3";
import { UNUSABLE_PASSWORD } from "../lib/auth/password";
import { TABLE_MAP } from "./lib/table-map";

// Destination column names that hold datetimes (Drizzle mode:"timestamp" → epoch seconds integer).
// DateField columns (start_date, end_date, date, shopping_date) are TEXT YYYY-MM-DD — do NOT convert.
const TIMESTAMP_DEST_COLS = new Set(["created_at", "updated_at", "joined_at", "expires_at"]);

// Destination column names that hold decimals — store as canonical text strings.
const DECIMAL_DEST_COLS = new Set(["quantity", "conversion_factor", "known_ratio"]);

export function transformValue(destCol: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (destCol === "password") return UNUSABLE_PASSWORD; // forced reset: all hashes invalidated
  if (TIMESTAMP_DEST_COLS.has(destCol)) {
    const raw = String(value);
    // Django ISO format: "2026-02-24 21:57:39.919109" — replace space with T and append Z
    const iso = raw.replace(" ", "T") + (raw.endsWith("Z") ? "" : "Z");
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) throw new Error(`unparseable timestamp in ${destCol}: ${raw}`);
    return Math.floor(ms / 1000); // epoch seconds — matches Drizzle mode:"timestamp"
  }
  if (DECIMAL_DEST_COLS.has(destCol)) return String(value);
  return value;
}

// Check if a table exists in the source DB
function sourceTableExists(db: ReturnType<typeof Database>, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { name: string } | undefined;
  return row !== undefined;
}

if (process.env.VITEST !== "true") {
const SOURCE = process.env.SOURCE_DB;
if (!SOURCE) throw new Error("set SOURCE_DB to the old Django db.sqlite3 path");
const DEST = process.env.DATABASE_FILE ?? "./data/cookless.db";

const src = new Database(SOURCE, { readonly: true });
const dest = new Database(DEST);
dest.pragma("foreign_keys = OFF"); // we control insertion order

let ok = true;
for (const entry of TABLE_MAP) {
  // If the source table doesn't exist, verify dest has 0 rows and skip import
  if (!sourceTableExists(src, entry.source)) {
    const got = (dest.prepare(`SELECT count(*) AS n FROM ${entry.dest}`).get() as { n: number }).n;
    const status = got === 0 ? "WARN" : "BAD ";
    if (got !== 0) ok = false;
    console.log(`${status} ${entry.dest.padEnd(24)} ${got}/0 (source table absent)`);
    continue;
  }

  // Intersect the canonical column map with what actually exists in the source table.
  // This ensures columns present in prod (e.g. description) are copied when available,
  // and silently skipped when the source DB is stale/older.
  const sourceColSet = new Set(
    (src.prepare(`PRAGMA table_info("${entry.source}")`).all() as { name: string }[]).map((r) => r.name),
  );
  const presentColumns = Object.entries(entry.columns).filter(([, srcCol]) => sourceColSet.has(srcCol));
  const destCols = presentColumns.map(([d]) => d);
  const srcCols = presentColumns.map(([, s]) => s);
  // Quote column names to handle SQLite reserved words (e.g. "order")
  const rows = src.prepare(`SELECT ${srcCols.map((c) => `"${c}"`).join(", ")} FROM ${entry.source}`).all();
  const placeholders = destCols.map(() => "?").join(", ");
  const insert = dest.prepare(
    `INSERT INTO ${entry.dest} (${destCols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
  );
  const tx = dest.transaction((items: Record<string, unknown>[]) => {
    for (const r of items) {
      insert.run(
        presentColumns.map(([destCol, srcCol]) =>
          transformValue(destCol, (r as Record<string, unknown>)[srcCol]),
        ),
      );
    }
  });
  tx(rows as Record<string, unknown>[]);

  const got = (dest.prepare(`SELECT count(*) AS n FROM ${entry.dest}`).get() as { n: number }).n;
  const want = (src.prepare(`SELECT count(*) AS n FROM ${entry.source}`).get() as { n: number }).n;
  const status = got === want ? "OK " : "BAD";
  if (got !== want) ok = false;
  console.log(`${status} ${entry.dest.padEnd(24)} ${got}/${want}`);
}

dest.pragma("foreign_keys = ON");

// Post-import integrity check: foreign key constraint violations
const fkViolations = dest.prepare("PRAGMA foreign_key_check").all();
if (fkViolations.length > 0) {
  console.error("\nFOREIGN KEY VIOLATIONS:");
  for (const v of fkViolations) console.error(v);
  ok = false;
} else {
  console.log("\nforeign_key_check: clean");
}

// Timestamp round-trip assertion via Drizzle
async function assertTimestampRoundTrip() {
  try {
    const { db, schema } = await import("../lib/db/index.js");
    const rows = await db.select().from(schema.households).limit(1);
    if (rows.length === 0) {
      console.log("timestamp round-trip: skipped (households table empty)");
      return true;
    }
    const row = rows[0];
    const val = row.createdAt;
    if (val instanceof Date && !isNaN(val.getTime())) {
      console.log(`timestamp round-trip: OK (households.createdAt = ${val.toISOString()})`);
      return true;
    } else {
      console.error(`timestamp round-trip: FAILED — createdAt = ${String(val)}`);
      return false;
    }
  } catch (err) {
    console.error(`timestamp round-trip: ERROR — ${String(err)}`);
    return false;
  }
}

void assertTimestampRoundTrip().then((roundTripOk) => {
  if (!roundTripOk) ok = false;
  console.log(ok ? "\nALL ROW COUNTS MATCH" : "\nROW COUNT MISMATCH — investigate");
  process.exit(ok ? 0 : 1);
});
} // end if (process.env.VITEST !== "true")
