import { requireHousehold } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getHouseholdAiSettings } from "@/lib/queries/household";
import { AiSettingsForm } from "./ai-settings-form";

export default async function AiSettingsPage() {
  const { householdId } = await requireHousehold();
  const { t } = await getI18n();
  const { aiEnabled, hasKey } = getHouseholdAiSettings(db, householdId);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("aiSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("aiSettings.subtitle")}</p>
      </div>
      <AiSettingsForm aiEnabled={aiEnabled} hasKey={hasKey} />
    </div>
  );
}
