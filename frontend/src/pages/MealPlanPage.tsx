import { useTranslation } from "react-i18next";

export default function MealPlanPage() {
  const { t } = useTranslation();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{t("plan.title")}</h1>
    </div>
  );
}
