import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../lib/db/client";

migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
