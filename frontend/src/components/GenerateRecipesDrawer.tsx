import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  generateRecipesSchema,
  type GenerateRecipesFormValues,
} from "@/lib/schemas/generate-recipes";

import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { useTags } from "../hooks/useTags";
import { TAG_CATEGORIES } from "../api/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface GenerateRecipesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: {
    count: number;
    tagIds: string[];
    freeText: string;
    generateImages: boolean;
  }) => void;
}

export default function GenerateRecipesDrawer({
  isOpen,
  onClose,
  onGenerate,
}: GenerateRecipesDrawerProps) {
  const { t, i18n } = useTranslation();
  const { data: groupedTags } = useTags();

  const form = useForm<GenerateRecipesFormValues>({
    resolver: zodResolver(generateRecipesSchema),
    defaultValues: {
      count: 10,
      selectedTagIds: [],
      freeText: "",
      generateImages: true,
    },
  });

  const count = form.watch("count");
  const selectedTagIds = form.watch("selectedTagIds");
  const generateImages = form.watch("generateImages");

  function handleGenerate(values: GenerateRecipesFormValues) {
    onGenerate({
      count: values.count,
      tagIds: values.selectedTagIds,
      freeText: values.freeText,
      generateImages: values.generateImages,
    });
  }

  return (
    <ResponsiveOverlay open={isOpen} onClose={onClose} title={t("generateRecipes.title")} size="md">
      <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-5">
        {/* Count slider */}
        <div>
          <div className="flex items-center justify-between">
            <Label>
              {t("generateRecipes.count")}
            </Label>
            <span className="text-sm font-semibold text-primary">{count}</span>
          </div>
          <Slider
            min={1}
            max={20}
            step={1}
            value={[count]}
            onValueChange={([val]) => form.setValue("count", val)}
            className="mt-2"
          />
        </div>

        {/* Tags */}
        {groupedTags && (
          <div className="space-y-3">
            <Label>{t("generateRecipes.tags")}</Label>
            {TAG_CATEGORIES.map((category) => {
              const tags = groupedTags[category] || [];
              if (tags.length === 0) return null;
              return (
                <div key={category}>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    {t(`tags.${category}`)}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <label
                          key={tag.id}
                          className={cn(
                            "flex items-center gap-1.5 text-sm px-2 py-1 rounded-lg border cursor-pointer",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card text-muted-foreground",
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              const prev = form.getValues("selectedTagIds");
                              const next = checked
                                ? [...prev, tag.id]
                                : prev.filter((id) => id !== tag.id);
                              form.setValue("selectedTagIds", next);
                            }}
                          />
                          {i18n.language === "de" ? tag.name_de : tag.name_en}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Free text */}
        <div>
          <Label>
            {t("generateRecipes.freeText")}
          </Label>
          <Textarea
            rows={3}
            {...form.register("freeText")}
            placeholder={t("generateRecipes.freeTextPlaceholder")}
            className="mt-1"
          />
        </div>

        {/* Generate images checkbox */}
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={generateImages}
            onCheckedChange={(checked) => form.setValue("generateImages", checked === true)}
          />
          <span className="text-sm text-foreground">
            {t("generateRecipes.generateImages")}
          </span>
        </label>

        {/* Generate button */}
        <Button type="submit" className="w-full">
          <Sparkles size={16} />
          {t("generateRecipes.generate")}
        </Button>
      </form>
    </ResponsiveOverlay>
  );
}
