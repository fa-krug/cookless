import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth/errors";
import { completeAddPasskey } from "@/lib/auth/passkey-management";
import { clearCeremonyCookie, readCeremonyCookie } from "@/lib/auth/ceremony-cookie";
import { requireUser, currentRpId } from "@/lib/auth/session";
import { passkeyCompleteSchema } from "@/lib/schemas/auth";
import { assertSameOrigin } from "@/lib/auth/origin";

export async function POST(req: Request) {
  const ceremony = await readCeremonyCookie();
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const { credential, deviceName } = passkeyCompleteSchema.parse(await req.json());
    if (!ceremony) throw new AuthError(400, "No pending passkey addition.");
    const rpId = await currentRpId();
    const dto = await completeAddPasskey(
      db,
      { userId: user.id, responseJson: credential, deviceName },
      ceremony,
      rpId,
      new Date(),
    );
    return NextResponse.json(dto);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  } finally {
    await clearCeremonyCookie();
  }
}
