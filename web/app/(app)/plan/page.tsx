import { Calendar } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function PlanPage() {
  const { t } = await getI18n();
  return <EmptyState icon={Calendar} title={t("nav.plan")} subtitle={t("common.loading")} />;
}
