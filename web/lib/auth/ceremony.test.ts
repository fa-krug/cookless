import { describe, expect, it } from "vitest";
import { decodeCeremony, encodeCeremony, type CeremonyState } from "./ceremony";

const SECRET = "s3cret";

describe("ceremony cookie", () => {
  const state: CeremonyState = {
    type: "register",
    challenge: "abc123",
    email: "a@x.test",
    inviteCode: "inv-1",
    tempUserId: "tmp-1",
  };

  it("round-trips state", () => {
    const cookie = encodeCeremony(state, SECRET);
    expect(decodeCeremony(cookie, SECRET)).toEqual(state);
  });

  it("rejects a tampered cookie", () => {
    const cookie = encodeCeremony(state, SECRET);
    expect(decodeCeremony(cookie + "x", SECRET)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const cookie = encodeCeremony(state, SECRET);
    expect(decodeCeremony(cookie, "other")).toBeNull();
  });
});
