import { describe, expect, it } from "vitest";
import { getDbPath } from "./client";

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
