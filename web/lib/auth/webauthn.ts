import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { getAllowedOrigins, getRpName } from "./config";
import { AuthError } from "./errors";

export function bufToB64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export async function getRegistrationOptions(args: {
  userId: string;
  userEmail: string;
  rpId: string;
  excludeCredentialIds: Buffer[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: getRpName(),
    rpID: args.rpId,
    userID: new TextEncoder().encode(args.userId),
    userName: args.userEmail,
    attestationType: "none",
    excludeCredentials: args.excludeCredentialIds.map((id) => ({ id: bufToB64url(id) })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
}

export async function verifyRegistration(args: {
  responseJson: string;
  expectedChallenge: string;
  rpId: string;
}): Promise<{ credentialId: Buffer; publicKey: Buffer; signCount: number }> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: JSON.parse(args.responseJson),
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: getAllowedOrigins(),
      expectedRPID: args.rpId,
      requireUserVerification: true,
    });
  } catch (e) {
    throw new AuthError(400, `WebAuthn verification failed: ${(e as Error).message}`);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new AuthError(400, "WebAuthn registration could not be verified.");
  }
  const cred = verification.registrationInfo.credential;
  return {
    credentialId: b64urlToBuf(cred.id),
    publicKey: Buffer.from(cred.publicKey),
    signCount: cred.counter,
  };
}

export async function getAuthenticationOptions(args: {
  rpId: string;
  allowCredentialIds: Buffer[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: args.rpId,
    allowCredentials: args.allowCredentialIds.map((id) => ({ id: bufToB64url(id) })),
    userVerification: "required",
  });
}

export async function verifyAuthentication(args: {
  responseJson: string;
  expectedChallenge: string;
  rpId: string;
  credentialId: Buffer;
  publicKey: Buffer;
  signCount: number;
}): Promise<{ newSignCount: number }> {
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: JSON.parse(args.responseJson),
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: getAllowedOrigins(),
      expectedRPID: args.rpId,
      requireUserVerification: true,
      credential: {
        id: bufToB64url(args.credentialId),
        publicKey: new Uint8Array(args.publicKey),
        counter: args.signCount,
      },
    });
  } catch (e) {
    throw new AuthError(400, `WebAuthn verification failed: ${(e as Error).message}`);
  }
  if (!verification.verified) {
    throw new AuthError(400, "WebAuthn authentication could not be verified.");
  }
  return { newSignCount: verification.authenticationInfo.newCounter };
}
