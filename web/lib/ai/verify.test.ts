import { describe, expect, test } from "vitest";
import { verifyGeminiKey } from "./verify";

function fakeFetch(status: number | "throw"): typeof fetch {
  return (async () => {
    if (status === "throw") throw new Error("network");
    return new Response(null, { status });
  }) as unknown as typeof fetch;
}

describe("verifyGeminiKey", () => {
  test("200 → valid", async () => {
    expect(await verifyGeminiKey("k", fakeFetch(200))).toBe("valid");
  });
  test("400/401/403 → invalid", async () => {
    expect(await verifyGeminiKey("k", fakeFetch(400))).toBe("invalid");
    expect(await verifyGeminiKey("k", fakeFetch(401))).toBe("invalid");
    expect(await verifyGeminiKey("k", fakeFetch(403))).toBe("invalid");
  });
  test("network error or 500 → unreachable", async () => {
    expect(await verifyGeminiKey("k", fakeFetch("throw"))).toBe("unreachable");
    expect(await verifyGeminiKey("k", fakeFetch(500))).toBe("unreachable");
  });
});
