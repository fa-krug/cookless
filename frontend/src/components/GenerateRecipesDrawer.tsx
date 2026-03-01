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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

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
          <div>
            <Label>
              {t("generateRecipes.tags")}
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TAG_CATEGORIES.map((category) => {
                const tags = groupedTags[category] || [];
                const selectedInCategory = tags.filter((tag) =>
                  selectedTagIds.includes(tag.id),
                );
                return (
                  <Popover key={category}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex cursor-pointer select-none items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                      >
                        {t(`tags.${category}`)}
                        {selectedInCategory.length > 0 && (
                          <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                            {selectedInCategory.length}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="min-w-48 p-0" align="start">
                      <ScrollArea className="max-h-60 p-2">
                        {tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted"
                          >
                            <Checkbox
                              checked={selectedTagIds.includes(tag.id)}
                              onCheckedChange={(checked) => {
                                const prev = form.getValues("selectedTagIds");
                                const next = checked
                                  ? [...prev, tag.id]
                                  : prev.filter((id) => id !== tag.id);
                                form.setValue("selectedTagIds", next);
                              }}
                            />
                            <span className="text-sm">
                              {i18n.language === "de" ? tag.name_de : tag.name_en}
                            </span>
                          </label>
                        ))}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
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
