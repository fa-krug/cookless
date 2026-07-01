"use client";

import { useEffect, useState } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

/**
 * Whether passkeys can actually be used in the current browser context.
 *
 * WebAuthn is only exposed in a secure context (HTTPS, or `localhost`). Over
 * plain http on a LAN IP the API is absent, so `navigator.credentials` calls
 * throw before any OS prompt appears. Callers use this to disable passkey
 * actions and explain why, instead of failing silently.
 *
 * Defaults to `true` so the server render and first client render agree; the
 * real value is resolved in an effect after mount (no hydration mismatch).
 */
export function useWebAuthnSupport(): boolean {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(window.isSecureContext && browserSupportsWebAuthn());
  }, []);
  return supported;
}
