import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginFirstRunPasskeyRegistration, beginPasskeyRegistration } from "@/lib/auth/passkey-auth";
import { hasAnyUser } from "@/lib/auth/first-run";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId } from "@/lib/auth/session";
import { passkeyBeginSchema } from "@/lib/schemas/auth";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { email, inviteCode } = passkeyBeginSchema.parse(await req.json());
    const rpId = await currentRpId();
    let result;
    if (inviteCode) {
      result = await beginPasskeyRegistration(db, { email, inviteCode }, rpId, new Date());
    } else if (!hasAnyUser(db)) {
      result = await beginFirstRunPasskeyRegistration(db, { email }, rpId);
    } else {
      throw new AuthError(400, "Invite code is required.");
    }
    await setCeremonyCookie(result.ceremony);
    return NextResponse.json(result.options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
