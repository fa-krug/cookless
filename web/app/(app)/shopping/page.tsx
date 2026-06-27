import { ShoppingCart } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ShoppingPage() {
  const { t } = await getI18n();
  return <EmptyState icon={ShoppingCart} title={t("nav.shopping")} subtitle={t("common.loading")} />;
}
