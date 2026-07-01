import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "./schema";

export type Db = BetterSQLite3Database<typeof schemaTypes>;

export { db, sqlite, getDbPath } from "./client";
export * as schema from "./schema";
