import { describe, expect, it } from "vitest";
import { shoppingSyncSchema } from "./shopping";

describe("shoppingSyncSchema", () => {
  it("accepts a toggle op", () => {
    const parsed = shoppingSyncSchema.safeParse({ kind: "toggle", itemId: "i1" });
    expect(parsed.success).toBe(true);
  });

  it("accepts an uncheck-all op", () => {
    const parsed = shoppingSyncSchema.safeParse({ kind: "uncheck-all", itemIds: ["i1", "i2"] });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(shoppingSyncSchema.safeParse({ kind: "delete", itemId: "i1" }).success).toBe(false);
  });

  it("rejects a toggle missing itemId", () => {
    expect(shoppingSyncSchema.safeParse({ kind: "toggle" }).success).toBe(false);
  });

  it("rejects an uncheck-all with a non-array itemIds", () => {
    expect(shoppingSyncSchema.safeParse({ kind: "uncheck-all", itemIds: "i1" }).success).toBe(false);
  });
});
