import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./db";

describe("createTestDb", () => {
  it("applies migrations and exposes the sessions table", () => {
    const db = createTestDb();
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'`,
    );
    expect(rows.map((r) => r.name)).toContain("sessions");
  });

  it("enforces foreign keys", () => {
    const db = createTestDb();
    const rows = db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
    expect(rows[0].foreign_keys).toBe(1);
  });
});
