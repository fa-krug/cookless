import { describe, expect, it } from "vitest";
import { getDbPath, sqlite } from "./client";

describe("getDbPath", () => {
  it("defaults to ./data/cookless.db when DATABASE_FILE is unset", () => {
    delete process.env.DATABASE_FILE;
    expect(getDbPath()).toBe("./data/cookless.db");
  });

  it("honours DATABASE_FILE when set", () => {
    process.env.DATABASE_FILE = "/tmp/x.db";
    expect(getDbPath()).toBe("/tmp/x.db");
  });
});

describe("SQLite pragmas", () => {
  it("sets synchronous = NORMAL", () => {
    const synchronous = sqlite.pragma("synchronous", { simple: true });
    expect(synchronous).toBe(1); // 1 = NORMAL
  });

  it("maintains journal_mode = WAL", () => {
    const journalMode = sqlite.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");
  });

  it("maintains foreign_keys = ON", () => {
    const foreignKeys = sqlite.pragma("foreign_keys", { simple: true });
    expect(foreignKeys).toBe(1); // 1 = ON
  });

  it("sets cache_size = -64000", () => {
    const cacheSize = sqlite.pragma("cache_size", { simple: true });
    expect(cacheSize).toBe(-64000);
  });

  it("sets mmap_size = 268435456", () => {
    const mmapSize = sqlite.pragma("mmap_size", { simple: true });
    expect(mmapSize).toBe(268435456);
  });

  it("sets temp_store = MEMORY", () => {
    const tempStore = sqlite.pragma("temp_store", { simple: true });
    expect(tempStore).toBe(2); // 2 = MEMORY
  });
});
