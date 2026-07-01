import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { count, all } from "./queue";
import { submitToggle, submitUncheckAll } from "./submit";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitToggle", () => {
  it("returns synced with the server's checked value online", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ checked: true }), { status: 200 })));
    const res = await submitToggle("i1");
    expect(res).toEqual({ result: "synced", checked: true });
    expect(await count()).toBe(0);
  });

  it("returns error on a non-2xx response and does not enqueue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const res = await submitToggle("i1");
    expect(res.result).toBe("error");
    expect(await count()).toBe(0);
  });

  it("enqueues and returns queued when the network is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await submitToggle("i1");
    expect(res.result).toBe("queued");
    const ops = await all();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "toggle", payload: { itemId: "i1" } });
  });
});

describe("submitUncheckAll", () => {
  it("enqueues an uncheck-all op when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await submitUncheckAll(["i1", "i2"]);
    expect(res).toBe("queued");
    const ops = await all();
    expect(ops[0]).toMatchObject({ kind: "uncheck-all", payload: { itemIds: ["i1", "i2"] } });
  });
});
