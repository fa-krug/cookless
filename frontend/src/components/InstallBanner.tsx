import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

export default function InstallBanner() {
  const { t } = useTranslation();
  const { isInstallable, promptInstall, dismiss } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-orange-500 px-4 py-3 text-white shadow-md">
      <p className="min-w-0 text-sm font-medium">{t("install.message")}</p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" className="bg-white text-orange-600 hover:bg-orange-50" onClick={promptInstall}>
          {t("install.install")}
        </Button>
        <Button variant="ghost" size="sm" className="text-orange-100 hover:bg-transparent hover:text-white" onClick={dismiss} aria-label={t("common.close")}>
          {t("install.dismiss")}
        </Button>
      </div>
    </div>
  );
}
