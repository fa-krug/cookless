import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { pickLocale } from "./locale";
import { getDictionary } from "./dictionary";
import { translate, translateList, type TVars } from "./translate";
import type { Locale } from "./config";

export async function resolveLocale(): Promise<Locale> {
  const user = await getSession();
  const cookieLang = (await cookies()).get("lang")?.value;
  const accept = (await headers()).get("accept-language")?.split(",")[0];
  return pickLocale([user?.preferredLanguage, cookieLang, accept]);
}

export async function getI18n() {
  const locale = await resolveLocale();
  const dict = getDictionary(locale);
  return {
    locale,
    dict,
    t: (key: string, vars?: TVars) => translate(dict, key, vars),
    tList: (key: string) => translateList(dict, key),
  };
}
