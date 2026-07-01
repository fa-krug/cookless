// web/lib/offline/submit.ts
// Client helpers that POST shopping ops to the route handler, falling back
// to the offline queue when the network is unavailable.
import { enqueue } from "./queue";

const ENDPOINT = "/api/shopping/toggle";

export type SubmitResult = "synced" | "queued" | "error";

export async function submitToggle(
  itemId: string,
): Promise<{ result: SubmitResult; checked?: boolean }> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "toggle", itemId }),
    });
    if (!res.ok) return { result: "error" };
    const data = (await res.json()) as { checked: boolean };
    return { result: "synced", checked: data.checked };
  } catch {
    await enqueue({ kind: "toggle", payload: { itemId } });
    return { result: "queued" };
  }
}

export async function submitUncheckAll(itemIds: string[]): Promise<SubmitResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "uncheck-all", itemIds }),
    });
    if (!res.ok) return "error";
    return "synced";
  } catch {
    await enqueue({ kind: "uncheck-all", payload: { itemIds } });
    return "queued";
  }
}
