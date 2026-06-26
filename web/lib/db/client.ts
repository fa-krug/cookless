import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function getDbPath(): string {
  return process.env.DATABASE_FILE ?? "./data/cookless.db";
}

export const sqlite = new Database(getDbPath());
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
