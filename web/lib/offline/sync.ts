// web/lib/offline/sync.ts
// Replays queued offline shopping ops to the toggle route handler, in order.
import { all, remove } from "./queue";

const ENDPOINT = "/api/shopping/toggle";

export async function drainQueue(
  fetchImpl: typeof fetch = fetch,
): Promise<{ drained: number; remaining: number }> {
  const ops = await all();
  let drained = 0;
  for (const op of ops) {
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: op.kind, ...op.payload }),
        credentials: "include",
      });
      if (!res.ok) break;
      await remove(op.id);
      drained += 1;
    } catch {
      break;
    }
  }
  return { drained, remaining: ops.length - drained };
}
