import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ShoppingListDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">
        {t("shopping.title")} {id}
      </h1>
    </div>
  );
}
