import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginPasskeyRegistration } from "@/lib/auth/passkey-auth";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId } from "@/lib/auth/session";
import { passkeyBeginSchema } from "@/lib/schemas/auth";

export async function POST(req: Request) {
  try {
    const { email, inviteCode } = passkeyBeginSchema.parse(await req.json());
    if (!inviteCode) throw new AuthError(400, "Invite code is required.");
    const rpId = await currentRpId();
    const { options, ceremony } = await beginPasskeyRegistration(
      db,
      { email, inviteCode },
      rpId,
      new Date(),
    );
    await setCeremonyCookie(ceremony);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
