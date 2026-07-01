import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { Providers } from "@/components/providers";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (user) {
    redirect(user.onboardingStep === "COMPLETED" ? "/" : "/onboarding");
  }
  const { locale, dict } = await getI18n();
  return (
    <Providers locale={locale} dict={dict}>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary/10 via-primary/5 to-background px-4">
        {children}
      </main>
    </Providers>
  );
}
