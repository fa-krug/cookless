import { describe, it, expect, beforeEach } from "vitest";

describe("assertSameOrigin", () => {
  beforeEach(() => {
    process.env.WEBAUTHN_ORIGIN = "https://app.example.test";
  });

  const req = (headers: Record<string, string>) =>
    new Request("https://app.example.test/api/auth/webauthn/add/begin", { method: "POST", headers });

  it("allows same Sec-Fetch-Site", async () => {
    const { assertSameOrigin } = await import("./origin");
    expect(() => assertSameOrigin(req({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });

  it("allows Sec-Fetch-Site: none", async () => {
    const { assertSameOrigin } = await import("./origin");
    expect(() => assertSameOrigin(req({ "sec-fetch-site": "none" }))).not.toThrow();
  });

  it("allows matching Origin in allowlist", async () => {
    const { assertSameOrigin } = await import("./origin");
    expect(() =>
      assertSameOrigin(req({ origin: "https://app.example.test", "sec-fetch-site": "cross-site" }))
    ).not.toThrow();
  });

  it("rejects a cross-site Origin", async () => {
    const { assertSameOrigin } = await import("./origin");
    expect(() =>
      assertSameOrigin(req({ origin: "https://evil.test", "sec-fetch-site": "cross-site" }))
    ).toThrow(/Cross-origin/);
  });

  it("rejects request with no Origin and no Sec-Fetch-Site", async () => {
    const { assertSameOrigin } = await import("./origin");
    expect(() => assertSameOrigin(req({}))).toThrow(/Cross-origin/);
  });
});
