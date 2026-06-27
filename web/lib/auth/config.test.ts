import { describe, expect, it } from "vitest";
import { resolveRpId } from "./config";

describe("resolveRpId", () => {
  const allowed = ["localhost", "192.168.1.50"];

  it("strips the port and returns a matching host", () => {
    expect(resolveRpId("localhost:3000", allowed)).toBe("localhost");
    expect(resolveRpId("192.168.1.50:3000", allowed)).toBe("192.168.1.50");
  });

  it("falls back to the first allowed id for an unknown host", () => {
    expect(resolveRpId("evil.example.com", allowed)).toBe("localhost");
  });

  it("handles a host with no port", () => {
    expect(resolveRpId("localhost", allowed)).toBe("localhost");
  });
});
