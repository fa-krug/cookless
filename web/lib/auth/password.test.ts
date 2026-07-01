import { describe, expect, it } from "vitest";
import { AuthError } from "./errors";
import {
  hashPassword,
  hasUsablePassword,
  validatePassword,
  verifyPassword,
} from "./password";

describe("hashPassword/verifyPassword", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("treats empty hash as unusable", async () => {
    expect(hasUsablePassword("")).toBe(false);
    expect(hasUsablePassword("$argon2id$...")).toBe(true);
    expect(await verifyPassword("", "anything")).toBe(false);
  });
});

describe("validatePassword", () => {
  const ok = "Tr0ub4dour&3xplore";

  it("accepts a strong password", () => {
    expect(() => validatePassword(ok, { email: "alice@example.com" })).not.toThrow();
  });

  it("rejects passwords shorter than 8 chars", () => {
    expect(() => validatePassword("Ab1!", {})).toThrow(AuthError);
  });

  it("rejects all-numeric passwords", () => {
    expect(() => validatePassword("48572916", {})).toThrow(/numeric/i);
  });

  it("rejects common passwords", () => {
    expect(() => validatePassword("password123", {})).toThrow(/common/i);
  });

  it("rejects passwords too similar to the email", () => {
    expect(() => validatePassword("alice123", { email: "alice@example.com" })).toThrow(
      /similar/i,
    );
  });

  it("surfaces AuthError status 400", () => {
    try {
      validatePassword("short", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(400);
    }
  });
});
