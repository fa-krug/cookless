import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { serializeUser } from "@/lib/auth/serialize";
import { getI18n } from "@/lib/i18n/server";
import { Providers } from "@/components/providers";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage() {
  const user = await requireUser();
  const dto = serializeUser(db, user);
  if (dto.onboardingStep === "COMPLETED") redirect("/");
  const { locale, dict } = await getI18n();
  return (
    <Providers locale={locale} dict={dict}>
      <main className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-bold text-primary">
            Cookless
          </h1>
          <OnboardingWizard step={dto.onboardingStep} email={dto.email} />
        </div>
      </main>
    </Providers>
  );
}
