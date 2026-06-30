"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { joinHouseholdAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

export function JoinButton({ code }: { code: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      const res = await joinHouseholdAction({ code });
      if (res.ok) {
        toast.success(t("success.householdJoined"));
        router.push("/welcome");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Button className="w-full" disabled={pending} onClick={handleJoin}>
      {t("invite.join")}
    </Button>
  );
}
