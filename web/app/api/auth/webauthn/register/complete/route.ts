import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { completePasskeyRegistration } from "@/lib/auth/passkey-auth";
import { clearCeremonyCookie, readCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { serializeUser } from "@/lib/auth/serialize";
import { currentRpId, setSessionCookie } from "@/lib/auth/session";
import { passkeyCompleteSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  const ceremony = await readCeremonyCookie();
  try {
    const { credential, deviceName } = passkeyCompleteSchema.parse(await req.json());
    if (!ceremony) throw new AuthError(400, "No registration in progress.");
    const rpId = await currentRpId();
    const user = await completePasskeyRegistration(
      db,
      { responseJson: credential, deviceName },
      ceremony,
      rpId,
      new Date(),
    );
    await setSessionCookie(user.id);
    return NextResponse.json(serializeUser(db, user));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  } finally {
    await clearCeremonyCookie();
  }
}
