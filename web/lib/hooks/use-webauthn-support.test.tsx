// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useWebAuthnSupport } from "./use-webauthn-support";

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: vi.fn(),
}));

const mockedSupportsWebAuthn = vi.mocked(browserSupportsWebAuthn);

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", { value, configurable: true });
}

describe("useWebAuthnSupport", () => {
  beforeEach(() => {
    mockedSupportsWebAuthn.mockReset();
  });

  afterEach(() => {
    setSecureContext(true);
  });

  it("returns true in a secure context that supports WebAuthn", () => {
    setSecureContext(true);
    mockedSupportsWebAuthn.mockReturnValue(true);

    const { result } = renderHook(() => useWebAuthnSupport());

    expect(result.current).toBe(true);
  });

  it("returns false in an insecure context (e.g. http on a LAN IP)", () => {
    setSecureContext(false);
    mockedSupportsWebAuthn.mockReturnValue(true);

    const { result } = renderHook(() => useWebAuthnSupport());

    expect(result.current).toBe(false);
  });

  it("returns false when the browser lacks WebAuthn support", () => {
    setSecureContext(true);
    mockedSupportsWebAuthn.mockReturnValue(false);

    const { result } = renderHook(() => useWebAuthnSupport());

    expect(result.current).toBe(false);
  });
});
