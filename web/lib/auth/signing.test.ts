import { describe, expect, it } from "vitest";
import { sign, unsign } from "./signing";

const SECRET = "test-secret-please-change";

describe("sign/unsign", () => {
  it("round-trips a value", () => {
    const signed = sign("session-id-123", SECRET);
    expect(signed).not.toBe("session-id-123");
    expect(unsign(signed, SECRET)).toBe("session-id-123");
  });

  it("rejects a tampered value", () => {
    const signed = sign("session-id-123", SECRET);
    const tampered = signed.replace("session-id-123", "session-id-999");
    expect(unsign(tampered, SECRET)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const signed = sign("abc", SECRET);
    expect(unsign(signed, "other-secret")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(unsign("no-dot-here", SECRET)).toBeNull();
    expect(unsign("", SECRET)).toBeNull();
  });
});
