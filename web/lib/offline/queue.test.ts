import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { enqueue, all, remove, count, clear } from "./queue";

beforeEach(() => {
  // Fresh in-memory IndexedDB per test.
  globalThis.indexedDB = new IDBFactory();
});

describe("offline queue", () => {
  it("enqueues ops and returns them in insertion order", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    const ops = await all();
    expect(ops.map((o) => o.payload.itemId)).toEqual(["a", "b"]);
    expect(ops[0].id).toBeLessThan(ops[1].id);
  });

  it("counts pending ops", async () => {
    expect(await count()).toBe(0);
    await enqueue({ kind: "uncheck-all", payload: { itemIds: ["a", "b"] } });
    expect(await count()).toBe(1);
  });

  it("removes a single op by id", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    const [first] = await all();
    await remove(first.id);
    const ops = await all();
    expect(ops.map((o) => o.payload.itemId)).toEqual(["b"]);
  });

  it("clears all ops", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await clear();
    expect(await count()).toBe(0);
  });
});
