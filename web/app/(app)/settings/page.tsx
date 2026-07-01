import { requireUser } from "@/lib/auth/session";
import { serializeUser } from "@/lib/auth/serialize";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const current: Locale = isLocale(user.preferredLanguage)
    ? user.preferredLanguage
    : "en";
  const account = serializeUser(db, user);
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>
      <SettingsClient
        currentLanguage={current}
        email={account.email}
        hasPassword={account.hasPassword}
        hasPasskey={account.hasPasskey}
      />
    </div>
  );
}
