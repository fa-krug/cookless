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
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
