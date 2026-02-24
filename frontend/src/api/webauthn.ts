import { api } from "./client.ts";
import type { User } from "./types.ts";

/**
 * Convert a base64url-encoded string to an ArrayBuffer.
 */
export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Convert an ArrayBuffer to a base64url-encoded string.
 */
export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Full passkey registration flow:
 * 1. POST /api/v1/auth/register/ with email + invite_code
 * 2. Call navigator.credentials.create with returned options
 * 3. POST /api/v1/auth/passkey/register/complete/ with serialized credential
 */
export async function registerPasskey(
  email: string,
  inviteCode: string,
  deviceName: string,
): Promise<User> {
  // Step 1: Begin registration — get WebAuthn creation options
  const options = await api.post<Record<string, unknown>>("/api/v1/auth/register/", {
    email,
    invite_code: inviteCode,
  });

  // Step 2: Prepare publicKey options for navigator.credentials.create
  const publicKey = options as unknown as PublicKeyCredentialCreationOptions;

  // Convert challenge from base64url to ArrayBuffer
  publicKey.challenge = base64urlToBuffer(options.challenge as string);

  // Convert user.id from base64url to ArrayBuffer
  const user = publicKey.user as PublicKeyCredentialUserEntity;
  user.id = base64urlToBuffer((options.user as Record<string, unknown>).id as string);

  // Convert excludeCredentials IDs if present
  if (publicKey.excludeCredentials) {
    publicKey.excludeCredentials = (
      options.excludeCredentials as Array<Record<string, unknown>>
    ).map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id as string),
      type: "public-key" as const,
    }));
  }

  // Step 3: Call the browser WebAuthn API
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  if (!credential) {
    throw new Error("Passkey creation was cancelled or failed.");
  }

  const attestationResponse = credential.response as AuthenticatorAttestationResponse;

  // Step 4: Serialize the credential response
  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(attestationResponse.attestationObject),
      clientDataJSON: bufferToBase64url(attestationResponse.clientDataJSON),
    },
  });

  // Step 5: Complete registration
  return api.post<User>("/api/v1/auth/passkey/register/complete/", {
    credential: credentialJSON,
    device_name: deviceName,
  });
}

/**
 * Full passkey login flow:
 * 1. POST /api/v1/auth/login/begin/ with email
 * 2. Call navigator.credentials.get with returned options
 * 3. POST /api/v1/auth/login/complete/ with serialized credential
 */
export async function loginWithPasskey(email: string): Promise<User> {
  // Step 1: Begin login — get WebAuthn request options
  const options = await api.post<Record<string, unknown>>("/api/v1/auth/login/begin/", {
    email,
  });

  // Step 2: Prepare publicKey options for navigator.credentials.get
  const publicKey = options as unknown as PublicKeyCredentialRequestOptions;

  // Convert challenge from base64url to ArrayBuffer
  publicKey.challenge = base64urlToBuffer(options.challenge as string);

  // Convert allowCredentials IDs from base64url to ArrayBuffer
  if (publicKey.allowCredentials) {
    publicKey.allowCredentials = (
      options.allowCredentials as Array<Record<string, unknown>>
    ).map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id as string),
      type: "public-key" as const,
    }));
  }

  // Step 3: Call the browser WebAuthn API
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  if (!credential) {
    throw new Error("Passkey authentication was cancelled or failed.");
  }

  const assertionResponse = credential.response as AuthenticatorAssertionResponse;

  // Step 4: Serialize the credential response
  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
      signature: bufferToBase64url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle
        ? bufferToBase64url(assertionResponse.userHandle)
        : null,
    },
  });

  // Step 5: Complete login
  return api.post<User>("/api/v1/auth/login/complete/", {
    credential: credentialJSON,
  });
}

/**
 * Add a new passkey to the current user's account.
 * Used from the Settings page.
 */
export async function addPasskey(deviceName: string): Promise<void> {
  // Step 1: Begin — get registration options
  const options = await api.post<Record<string, unknown>>("/api/v1/users/me/passkeys/add/begin/");

  // Step 2: Prepare publicKey options
  const publicKey = options as unknown as PublicKeyCredentialCreationOptions;
  publicKey.challenge = base64urlToBuffer(options.challenge as string);

  const user = publicKey.user as PublicKeyCredentialUserEntity;
  user.id = base64urlToBuffer((options.user as Record<string, unknown>).id as string);

  if (publicKey.excludeCredentials) {
    publicKey.excludeCredentials = (
      options.excludeCredentials as Array<Record<string, unknown>>
    ).map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id as string),
      type: "public-key" as const,
    }));
  }

  // Step 3: Call browser WebAuthn API
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  if (!credential) {
    throw new Error("Passkey creation was cancelled or failed.");
  }

  const attestationResponse = credential.response as AuthenticatorAttestationResponse;

  const credentialJSON = JSON.stringify({
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(attestationResponse.attestationObject),
      clientDataJSON: bufferToBase64url(attestationResponse.clientDataJSON),
    },
  });

  // Step 4: Complete
  await api.post("/api/v1/users/me/passkeys/add/complete/", {
    credential: credentialJSON,
    device_name: deviceName,
  });
}
