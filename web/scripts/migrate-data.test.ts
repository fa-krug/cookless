import { describe, it, expect } from "vitest";
import { transformValue } from "./migrate-data";

describe("transformValue password reset", () => {
  it("maps a Django pbkdf2 hash to the unusable marker", () => {
    expect(transformValue("password", "pbkdf2_sha256$870000$abc$def==")).toBe("");
  });
  it("maps a Django unusable (!) hash to the unusable marker", () => {
    expect(transformValue("password", "!someRandomUnusableMarker")).toBe("");
  });
  it("leaves null untouched", () => {
    expect(transformValue("password", null)).toBeNull();
  });
  it("does not alter non-password columns", () => {
    expect(transformValue("email", "a@b.test")).toBe("a@b.test");
  });
});
