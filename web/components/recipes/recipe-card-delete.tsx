"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { deleteRecipeAction } from "@/app/(app)/actions";

export function RecipeCardDelete({ recipeId, title }: { recipeId: string; title: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      className="ml-3 shrink-0 text-red-600 hover:bg-red-50"
      aria-label={`${t("common.delete")} ${title}`}
      onClick={() => {
        if (!confirm(t("recipes.confirmDelete"))) return;
        startTransition(async () => {
          const res = await deleteRecipeAction(recipeId);
          if (res.ok) {
            toast.success(t("recipes.deleted"));
            router.refresh();
          } else {
            toast.error(t("common.errorRetry"));
          }
        });
      }}
    >
      <Trash2 size={18} />
    </Button>
  );
}
