import { useTranslation } from "react-i18next";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

export default function InstallBanner() {
  const { t } = useTranslation();
  const { isInstallable, promptInstall, dismiss } = useInstallPrompt();

  if (!isInstallable) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-orange-500 px-4 py-3 text-white shadow-md">
      <p className="min-w-0 text-sm font-medium">{t("install.message")}</p>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={promptInstall}
          className="rounded-md bg-white px-3 py-1 text-sm font-semibold text-orange-600 transition hover:bg-orange-50"
        >
          {t("install.install")}
        </button>
        <button
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-sm text-orange-100 transition hover:text-white"
          aria-label={t("common.close")}
        >
          {t("install.dismiss")}
        </button>
      </div>
    </div>
  );
}
