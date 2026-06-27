import Database from "better-sqlite3";
import { TABLE_MAP } from "./lib/table-map";

const SOURCE = process.env.SOURCE_DB;
if (!SOURCE) throw new Error("set SOURCE_DB to the old Django db.sqlite3 path");
const DEST = process.env.DATABASE_FILE ?? "./data/cookless.db";

const src = new Database(SOURCE, { readonly: true });
const dest = new Database(DEST);
dest.pragma("foreign_keys = OFF"); // we control insertion order

// Check if a table exists in the source DB
function sourceTableExists(db: ReturnType<typeof Database>, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { name: string } | undefined;
  return row !== undefined;
}

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
    for (const r of items) insert.run(srcCols.map((c) => (r as Record<string, unknown>)[c]));
  });
  tx(rows as Record<string, unknown>[]);

  const got = (dest.prepare(`SELECT count(*) AS n FROM ${entry.dest}`).get() as { n: number }).n;
  const want = (src.prepare(`SELECT count(*) AS n FROM ${entry.source}`).get() as { n: number }).n;
  const status = got === want ? "OK " : "BAD";
  if (got !== want) ok = false;
  console.log(`${status} ${entry.dest.padEnd(24)} ${got}/${want}`);
}
dest.pragma("foreign_keys = ON");
console.log(ok ? "\nALL ROW COUNTS MATCH" : "\nROW COUNT MISMATCH — investigate");
process.exit(ok ? 0 : 1);
