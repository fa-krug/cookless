import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { beginAddPasskey } from "@/lib/auth/passkey-management";
import { setCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { currentRpId, requireUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const rpId = await currentRpId();
    const { options, ceremony } = await beginAddPasskey(db, user.id, rpId);
    await setCeremonyCookie(ceremony);
    return NextResponse.json(options);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
