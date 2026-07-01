import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { enqueue, all } from "./queue";
import { drainQueue } from "./sync";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ checked: true }), { status: 200 }));
}

describe("drainQueue", () => {
  it("replays all ops and empties the queue on success", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    const fetchImpl = okFetch();
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 2, remaining: 0 });
    expect(await all()).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends kind + payload as the request body", async () => {
    await enqueue({ kind: "uncheck-all", payload: { itemIds: ["a", "b"] } });
    const fetchImpl = okFetch();
    await drainQueue(fetchImpl as unknown as typeof fetch);
    const calls = fetchImpl.mock.calls as Array<unknown[]>;
    const init = calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ kind: "uncheck-all", itemIds: ["a", "b"] });
  });

  it("stops at the first network failure and keeps the remainder", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    await enqueue({ kind: "toggle", payload: { itemId: "b" } });
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("offline");
      return new Response("{}", { status: 200 });
    });
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 1, remaining: 1 });
    expect(await all()).toHaveLength(1);
  });

  it("stops on a non-2xx response", async () => {
    await enqueue({ kind: "toggle", payload: { itemId: "a" } });
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 0, remaining: 1 });
    expect(await all()).toHaveLength(1);
  });

  it("no-ops on an empty queue", async () => {
    const fetchImpl = okFetch();
    const res = await drainQueue(fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ drained: 0, remaining: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
