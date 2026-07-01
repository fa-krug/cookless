import { afterEach, describe, expect, it, vi } from "vitest";
import { callGeminiText, generateGeminiImage } from "./gemini";

afterEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body }) as unknown as Response),
  );
}

describe("callGeminiText", () => {
  it("parses the JSON array from candidates[0].content.parts[0].text", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: '[{"title":"A"}]' }] } }] });
    const out = await callGeminiText("k", "p");
    expect(out).toEqual([{ title: "A" }]);
  });
  it("throws AuthError 502 on non-ok response", async () => {
    mockFetch({}, false, 500);
    await expect(callGeminiText("k", "p")).rejects.toMatchObject({ status: 502 });
  });
  it("throws when the model text is not a JSON array", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: '{"not":"array"}' }] } }] });
    await expect(callGeminiText("k", "p")).rejects.toMatchObject({ status: 502 });
  });
});

describe("generateGeminiImage", () => {
  it("returns a Buffer from inlineData.data", async () => {
    const b64 = Buffer.from("hello").toString("base64");
    mockFetch({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: b64 } }] } }] });
    const buf = await generateGeminiImage("k", "p");
    expect(buf.toString()).toBe("hello");
  });
  it("throws AuthError 502 when no image part is present", async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: "nope" }] } }] });
    await expect(generateGeminiImage("k", "p")).rejects.toMatchObject({ status: 502 });
  });
});
