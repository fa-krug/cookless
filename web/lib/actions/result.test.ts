import { describe, expect, it } from "vitest";
import { fail } from "./result";
import { AuthError } from "@/lib/auth/errors";

describe("fail", () => {
  it("maps AuthError to an error Result", () => {
    expect(fail(new AuthError(422, "bad"))).toEqual({ ok: false, status: 422, message: "bad" });
  });

  it("rethrows non-AuthError", () => {
    expect(() => fail(new Error("boom"))).toThrow("boom");
  });
});
