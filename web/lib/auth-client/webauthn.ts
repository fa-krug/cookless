"use client";

import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? "Request failed");
  }
  return data as T;
}

// Returns the UserDto from /complete.
export async function passkeyLogin<T = unknown>(email: string): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/login/begin", { email });
  const credential = await startAuthentication({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/login/complete", {
    credential: JSON.stringify(credential),
    deviceName: "",
  });
}

export async function passkeyRegister<T = unknown>(
  email: string,
  inviteCode: string,
): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/register/begin", {
    email,
    inviteCode,
  });
  const credential = await startRegistration({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/register/complete", {
    credential: JSON.stringify(credential),
    deviceName: navigator.userAgent,
  });
}

export async function addPasskey<T = unknown>(): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/add/begin");
  const credential = await startRegistration({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/add/complete", {
    credential: JSON.stringify(credential),
    deviceName: navigator.userAgent,
  });
}
