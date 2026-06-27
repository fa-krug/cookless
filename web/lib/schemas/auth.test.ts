import { describe, expect, it } from "vitest";
import { loginPasswordSchema, registerPasswordSchema } from "./auth";

describe("auth schemas", () => {
  it("accepts valid login input", () => {
    expect(loginPasswordSchema.parse({ email: "a@x.test", password: "x" })).toEqual({
      email: "a@x.test",
      password: "x",
    });
  });

  it("rejects a bad email", () => {
    expect(loginPasswordSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("requires an invite code on registration", () => {
    expect(
      registerPasswordSchema.safeParse({ email: "a@x.test", password: "x" }).success,
    ).toBe(false);
  });
});
