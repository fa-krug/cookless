import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, UserPlus } from "lucide-react";

const LINKS = [
  { to: "/recipes", icon: BookOpen, titleKey: "welcome.addRecipe", descKey: "welcome.addRecipeDescription" },
  { to: "/plan", icon: CalendarDays, titleKey: "welcome.createPlan", descKey: "welcome.createPlanDescription" },
  { to: "/household", icon: UserPlus, titleKey: "welcome.inviteMember", descKey: "welcome.inviteMemberDescription" },
] as const;

export default function WelcomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          {t("welcome.title")}
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          {t("welcome.subtitle")}
        </p>

        <div className="mt-6 space-y-3">
          {LINKS.map(({ to, icon: Icon, titleKey, descKey }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 transition-colors hover:border-orange-300 hover:bg-orange-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                <Icon size={20} />
              </div>
              <div>
                <div className="font-medium text-gray-900">{t(titleKey)}</div>
                <div className="text-sm text-gray-500">{t(descKey)}</div>
              </div>
            </Link>
          ))}
        </div>

        <Link
          to="/recipes"
          className="mt-6 block w-full rounded-md bg-orange-500 px-4 py-2 text-center font-medium text-white hover:bg-orange-600"
        >
          {t("welcome.getStarted")}
        </Link>
      </div>
    </div>
  );
}
