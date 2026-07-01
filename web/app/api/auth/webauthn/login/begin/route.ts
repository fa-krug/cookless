import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginPasskeyLogin } from "@/lib/auth/passkey-auth";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId } from "@/lib/auth/session";
import { passkeyBeginSchema } from "@/lib/schemas/auth";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { email } = passkeyBeginSchema.parse(await req.json());
    const rpId = await currentRpId();
    const { options, ceremony } = await beginPasskeyLogin(db, { email }, rpId);
    await setCeremonyCookie(ceremony);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
