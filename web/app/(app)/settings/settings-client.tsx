"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { useTheme, type Theme } from "@/components/theme/use-theme";
import { updateProfileAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/lib/i18n/config";

export function SettingsClient({ currentLanguage }: { currentLanguage: Locale }) {
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
    router.refresh(); // re-render server components with the new dictionary
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("settings.language")}</h2>
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
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("settings.theme")}</h2>
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
      </section>
    </div>
  );
}
