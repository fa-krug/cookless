import { sign, unsign } from "./signing";

export interface CeremonyState {
  type: "register" | "login" | "add";
  challenge: string;
  email?: string;
  inviteCode?: string;
  tempUserId?: string;
  firstRun?: boolean;
}

export function encodeCeremony(state: CeremonyState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return sign(payload, secret);
}

export function decodeCeremony(cookieValue: string, secret: string): CeremonyState | null {
  const payload = unsign(cookieValue, secret);
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CeremonyState;
  } catch {
    return null;
  }
}
