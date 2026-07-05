import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function getDbPath(): string {
  return process.env.DATABASE_FILE ?? "./data/cookless.db";
}

const dbPath = getDbPath();
// Ensure the parent directory exists before opening — better-sqlite3 throws if it
// doesn't. Prod already mounts /app/data, so this is a no-op there; it matters for
// fresh checkouts (CI, first dev run) where ./data has not been created yet.
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);
// Wait (instead of throwing SQLITE_BUSY) when another connection briefly holds a
// lock. This matters during `next build`, where page-data collection spawns
// multiple worker processes that each open this DB and race on the exclusive lock
// the WAL journal-mode conversion needs; it also hardens runtime concurrency.
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("cache_size = -64000"); // 64 MB page cache (negative = KiB)
sqlite.pragma("mmap_size = 268435456"); // 256 MB memory-mapped I/O
sqlite.pragma("temp_store = MEMORY");

export const db = drizzle(sqlite, { schema });
