import { useTranslation } from "react-i18next";

export default function RecipeListPage() {
  const { t } = useTranslation();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
    </div>
  );
}
