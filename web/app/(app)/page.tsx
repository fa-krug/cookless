import { Home } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function HomePage() {
  const { t } = await getI18n();
  return <EmptyState icon={Home} title={t("common.appName")} subtitle={t("nav.recipes")} />;
}
