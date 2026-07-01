import { describe, expect, it } from "vitest";
import {
  b64urlToBuf,
  bufToB64url,
  getAuthenticationOptions,
  getRegistrationOptions,
} from "./webauthn";

describe("buffer/base64url conversions", () => {
  it("round-trips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 255]);
    expect(b64urlToBuf(bufToB64url(buf)).equals(buf)).toBe(true);
  });
});

describe("getRegistrationOptions", () => {
  it("returns a challenge and excludes existing credentials", async () => {
    const opts = await getRegistrationOptions({
      userId: "temp-id",
      userEmail: "a@x.test",
      rpId: "localhost",
      excludeCredentialIds: [Buffer.from([9, 9, 9])],
    });
    expect(typeof opts.challenge).toBe("string");
    expect(opts.rp.id).toBe("localhost");
    expect(opts.excludeCredentials?.[0]?.id).toBe(bufToB64url(Buffer.from([9, 9, 9])));
  });
});

describe("getAuthenticationOptions", () => {
  it("returns a challenge and allows the given credentials", async () => {
    const opts = await getAuthenticationOptions({
      rpId: "localhost",
      allowCredentialIds: [Buffer.from([1, 2, 3])],
    });
    expect(typeof opts.challenge).toBe("string");
    expect(opts.allowCredentials?.[0]?.id).toBe(bufToB64url(Buffer.from([1, 2, 3])));
  });
});
