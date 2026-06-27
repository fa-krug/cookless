import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { serializeUser } from "@/lib/auth/serialize";
import { getI18n } from "@/lib/i18n/server";
import { Providers } from "@/components/providers";
import { AppNav } from "@/components/nav/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const dto = serializeUser(db, user);
  if (dto.onboardingStep !== "COMPLETED") redirect("/onboarding");
  const { locale, dict } = await getI18n();
  return (
    <Providers locale={locale} dict={dict}>
      <div className="flex min-h-screen bg-background md:flex-row">
        <AppNav email={dto.email} householdName={dto.activeHousehold?.name ?? ""} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:pb-8">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
