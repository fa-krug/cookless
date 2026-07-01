"use client";

import { useRouter } from "next/navigation";
import { Languages, Palette, Tag, Sparkles, Users } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useTheme, type Theme } from "@/components/theme/use-theme";
import { updateProfileAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/lib/i18n/config";
import { SettingsSection, SettingsNavRow } from "./settings-section";
import { AccountSection } from "./account-section";

export function SettingsClient({
  currentLanguage,
  email,
  hasPassword,
  hasPasskey,
}: {
  currentLanguage: Locale;
  email: string;
  hasPassword: boolean;
  hasPasskey: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function changeLanguage(lang: string) {
    if (lang !== "en" && lang !== "de") return;
    const res = await updateProfileAction({ preferredLanguage: lang });
    if (!res.ok) {
      toast.error(t("common.error"));
      return;
    }
    await fetch("/set-language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.preferences")}
        </h2>
        <SettingsSection
          icon={Languages}
          title={t("settings.language")}
          description={t("settings.languageDescription")}
        >
          <ToggleGroup
            type="single"
            value={currentLanguage}
            onValueChange={(v) => v && changeLanguage(v)}
          >
            {(["en", "de"] as const).map((lang) => (
              <ToggleGroupItem key={lang} value={lang}>
                {t(`settings.languages.${lang}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsSection>
        <SettingsSection
          icon={Palette}
          title={t("settings.theme")}
          description={t("settings.themeDescription")}
        >
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={(v) => v && setTheme(v as Theme)}
          >
            {(["light", "dark", "system"] as const).map((th) => (
              <ToggleGroupItem key={th} value={th}>
                {t(`settings.themes.${th}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsSection>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.dataGroup")}
        </h2>
        <SettingsNavRow
          icon={Tag}
          title={t("tags.manageTags")}
          description={t("tags.manageDescription")}
          href="/settings/tags"
        />
        <SettingsNavRow
          icon={Sparkles}
          title={t("aiSettings.title")}
          description={t("aiSettings.navDescription")}
          href="/settings/ai"
        />
        <SettingsNavRow
          icon={Users}
          title={t("nav.manageHousehold")}
          description={t("nav.householdDescription")}
          href="/settings/household"
        />
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.accountGroup")}
        </h2>
        <AccountSection email={email} hasPassword={hasPassword} hasPasskey={hasPasskey} />
      </section>
    </div>
  );
}
