import { BookOpen } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function RecipesPage() {
  const { t } = await getI18n();
  return <EmptyState icon={BookOpen} title={t("nav.recipes")} subtitle={t("common.loading")} />;
}
