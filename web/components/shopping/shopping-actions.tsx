"use client";

import { useTransition } from "react";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { uncheckAllShoppingAction } from "@/app/(app)/actions";

export function UncheckAllButton({ itemIds }: { itemIds: string[] }) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending || itemIds.length === 0}
      onClick={() =>
        startTransition(async () => {
          const res = await uncheckAllShoppingAction(itemIds);
          if (!res.ok) toast.error(t("common.errorRetry"));
        })
      }
      className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
    >
      {t("shopping.uncheckAll")}
    </button>
  );
}
