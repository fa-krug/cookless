"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, UtensilsCrossed, ArrowRightLeft, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { moveRecipeAction } from "@/app/(app)/actions";
import { ExportRecipeDialog } from "./export-recipe-dialog";
import type { RecipeExportModel } from "@/lib/recipes/export";

interface Props {
  recipeId: string;
  listType: string;
  model: RecipeExportModel;
  locale: string;
}

export function RecipeDetailActions({ recipeId, listType, model, locale }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();

  function onMove() {
    startTransition(async () => {
      const res = await moveRecipeAction(recipeId);
      if (res.ok) router.refresh();
      else toast.error(t("common.errorRetry"));
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("recipes.confirmDeleteTitle"),
      message: t("recipes.confirmDelete"),
      destructive: true,
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    router.push(`/recipes?deleted=${recipeId}`);
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
      <ExportRecipeDialog model={model} locale={locale} />
      <Button variant="outline" disabled={pending} onClick={onMove}>
        <ArrowRightLeft size={16} />
        {listType === "KNOWN" ? t("recipes.moveToTry") : t("recipes.moveToKnown")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={onDelete} className="text-destructive">
        <Trash2 size={16} />
        {t("common.delete")}
      </Button>
      {dialog}
    </div>
  );
}
