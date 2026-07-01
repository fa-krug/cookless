import Link from "next/link";
import { BookOpen, CalendarDays, UserPlus } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

const LINKS = [
  {
    href: "/recipes",
    icon: BookOpen,
    titleKey: "welcome.addRecipe" as const,
    descKey: "welcome.addRecipeDescription" as const,
  },
  {
    href: "/plan",
    icon: CalendarDays,
    titleKey: "welcome.createPlan" as const,
    descKey: "welcome.createPlanDescription" as const,
  },
  {
    href: "/settings/household",
    icon: UserPlus,
    titleKey: "welcome.inviteMember" as const,
    descKey: "welcome.inviteMemberDescription" as const,
  },
];

export default async function WelcomePage() {
  await requireUser();
  const { t } = await getI18n();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-foreground">{t("welcome.title")}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("welcome.subtitle")}</p>

        <div className="mt-6 space-y-3">
          {LINKS.map(({ href, icon: Icon, titleKey, descKey }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon size={20} />
              </div>
              <div>
                <div className="font-medium text-foreground">{t(titleKey)}</div>
                <div className="text-sm text-muted-foreground">{t(descKey)}</div>
              </div>
            </Link>
          ))}
        </div>

        <Link
          href="/recipes"
          className="mt-6 block w-full rounded-md bg-primary px-4 py-2 text-center font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("welcome.getStarted")}
        </Link>
      </div>
    </div>
  );
}
