import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function CookingViewPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">
        {t("cooking.title")} {id}
      </h1>
    </div>
  );
}
