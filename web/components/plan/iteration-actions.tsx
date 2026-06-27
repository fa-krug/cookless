"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { renewIterationAction, nextIterationAction } from "@/app/(app)/actions";

export function RenewButton({ iterationId }: { iterationId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await renewIterationAction(iterationId);
          if (res.ok) router.refresh();
          else toast.error(t("common.errorRetry"));
        })
      }
      className="rounded border border-primary/50 px-3 py-1 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {t("plan.renew")}
    </button>
  );
}

export function NextIterationButton({ className }: { className?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await nextIterationAction();
          if (res.ok) router.refresh();
          else toast.error(t("common.errorRetry"));
        })
      }
      className={
        className ??
        "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      }
    >
      {t("plan.nextIteration")}
    </button>
  );
}
