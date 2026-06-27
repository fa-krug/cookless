import { cookies } from "next/headers";
import { CEREMONY_COOKIE, CEREMONY_TTL_MS, getAuthSecret } from "./config";
import { type CeremonyState, decodeCeremony, encodeCeremony } from "./ceremony";

export async function setCeremonyCookie(state: CeremonyState): Promise<void> {
  (await cookies()).set(CEREMONY_COOKIE, encodeCeremony(state, getAuthSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(CEREMONY_TTL_MS / 1000),
  });
}

export async function readCeremonyCookie(): Promise<CeremonyState | null> {
  const raw = (await cookies()).get(CEREMONY_COOKIE)?.value;
  return raw ? decodeCeremony(raw, getAuthSecret()) : null;
}

export async function clearCeremonyCookie(): Promise<void> {
  (await cookies()).delete(CEREMONY_COOKIE);
}
