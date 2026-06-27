import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";

export async function POST(req: Request) {
  await requireUser();
  const { lang } = await req.json();
  if (!isLocale(lang)) {
    return NextResponse.json({ message: "Unsupported locale" }, { status: 400 });
  }
  (await cookies()).set("lang", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return NextResponse.json({ ok: true });
}
