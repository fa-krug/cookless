"use client";

import { useRouter } from "next/navigation";
import { Check, Home, KeyRound, Lock } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { ChangePasswordStep, AddPasskeyStep, CreateHouseholdStep } from "./steps";

const STEPS = ["CHANGE_PASSWORD", "ADD_PASSKEY", "CREATE_HOUSEHOLD"] as const;
const ICONS = [Lock, KeyRound, Home];

export function OnboardingWizard({ step, email }: { step: string; email: string }) {
  const { t } = useT();
  const router = useRouter();
  const currentIndex = STEPS.indexOf(step as (typeof STEPS)[number]);

  // Each step calls this after its action succeeds; re-running the server
  // component reads the advanced onboardingStep (or redirects when COMPLETED).
  const advance = () => router.refresh();

  return (
    <div>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        {t("setup.step", { current: currentIndex + 1, total: 3 })}
      </p>
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = ICONS[i];
          const isActive = i === currentIndex;
          const isDone = i < currentIndex;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`h-0.5 w-8 ${isDone ? "bg-primary" : "bg-muted"}`} />
              )}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check size={20} /> : <Icon size={20} />}
              </div>
            </div>
          );
        })}
      </div>

      {step === "CHANGE_PASSWORD" && <ChangePasswordStep email={email} onDone={advance} />}
      {step === "ADD_PASSKEY" && <AddPasskeyStep onDone={advance} />}
      {step === "CREATE_HOUSEHOLD" && <CreateHouseholdStep onDone={advance} />}
    </div>
  );
}
