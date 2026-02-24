import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <h1 className="mb-2 text-4xl font-bold text-orange-500">
        {t("common.appName")}
      </h1>
      <p className="mb-12 text-gray-500">{t("nav.plan")}</p>

      <button
        onClick={login}
        className="flex w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-black px-6 py-3 text-base font-medium text-white transition-colors hover:bg-gray-800"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
        {t("auth.signInWithApple")}
      </button>
    </div>
  );
}
