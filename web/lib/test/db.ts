import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** A fresh in-memory SQLite DB with all migrations applied. */
export function createTestDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
