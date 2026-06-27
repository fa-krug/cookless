"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  uploadRecipeImageAction,
  generateRecipeImageAction,
  removeRecipeImageAction,
} from "@/app/(app)/actions";

interface Props {
  recipeId: string;
  hasImage: boolean;
  aiEnabled: boolean;
}

export function RecipeImageActions({ recipeId, hasImage, aiEnabled }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    startTransition(async () => {
      const res = await uploadRecipeImageAction(recipeId, fd);
      if (res.ok) router.refresh();
      else toast.error(t("recipeImage.uploadFailed"));
    });
  }

  function onGenerate() {
    startTransition(async () => {
      const res = await generateRecipeImageAction(recipeId);
      if (res.ok) router.refresh();
      else toast.error(t("recipeImage.generateFailed"));
    });
  }

  function onRemove() {
    startTransition(async () => {
      const res = await removeRecipeImageAction(recipeId);
      if (res.ok) {
        toast.success(t("recipeImage.removed"));
        router.refresh();
      } else {
        toast.error(t("common.errorRetry"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
        <ImagePlus size={16} />
        {t("recipeImage.upload")}
      </Button>
      {aiEnabled && (
        <Button variant="outline" size="sm" disabled={pending} onClick={onGenerate}>
          <Sparkles size={16} />
          {pending ? t("recipeImage.generating") : t("recipeImage.generate")}
        </Button>
      )}
      {hasImage && (
        <Button variant="outline" size="sm" disabled={pending} onClick={onRemove} className="text-destructive">
          <Trash2 size={16} />
          {t("recipeImage.remove")}
        </Button>
      )}
    </div>
  );
}
