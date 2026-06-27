"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, UtensilsCrossed, ArrowRightLeft, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { moveRecipeAction, deleteRecipeAction } from "@/app/(app)/actions";
import { ExportRecipeDialog } from "./export-recipe-dialog";

interface Props {
  recipeId: string;
  listType: string;
  exportText: string;
  exportTitle: string;
}

export function RecipeDetailActions({ recipeId, listType, exportText, exportTitle }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onMove() {
    startTransition(async () => {
      const res = await moveRecipeAction(recipeId);
      if (res.ok) router.refresh();
      else toast.error(t("common.errorRetry"));
    });
  }

  function onDelete() {
    if (!confirm(t("recipes.confirmDelete"))) return;
    startTransition(async () => {
      const res = await deleteRecipeAction(recipeId);
      if (res.ok) {
        toast.success(t("recipes.deleted"));
        router.push("/recipes");
      } else {
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      <Button variant="default" asChild>
        <Link href={`/recipes/${recipeId}/edit`}>
          <Edit size={16} />
          {t("common.edit")}
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href={`/cook/${recipeId}`}>
          <UtensilsCrossed size={16} />
          {t("cooking.start")}
        </Link>
      </Button>
      <ExportRecipeDialog title={exportTitle} text={exportText} />
      <Button variant="outline" disabled={pending} onClick={onMove}>
        <ArrowRightLeft size={16} />
        {listType === "KNOWN" ? t("recipes.moveToTry") : t("recipes.moveToKnown")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={onDelete} className="text-destructive">
        <Trash2 size={16} />
        {t("common.delete")}
      </Button>
    </div>
  );
}
