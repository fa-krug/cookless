import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  generateRecipesSchema,
  type GenerateRecipesFormValues,
} from "@/lib/schemas/generate-recipes";

import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { useCloseDetailsOnClickOutside } from "../hooks/useCloseDetailsOnClickOutside";
import { useTags } from "../hooks/useTags";
import { TAG_CATEGORIES } from "../api/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const tagSectionRef = useCloseDetailsOnClickOutside<HTMLDivElement>();

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
            <span className="text-sm font-semibold text-orange-600">{count}</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={count}
            onChange={(e) => form.setValue("count", Number(e.target.value))}
            className="mt-2 w-full accent-orange-500"
          />
        </div>

        {/* Tags */}
        {groupedTags && (
          <div ref={tagSectionRef}>
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
                  <details key={category} className="relative">
                    <summary className="flex cursor-pointer select-none items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                      {t(`tags.${category}`)}
                      {selectedInCategory.length > 0 && (
                        <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">
                          {selectedInCategory.length}
                        </span>
                      )}
                    </summary>
                    <div className="absolute z-10 mt-1 min-w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                      <ScrollArea className="max-h-60 p-2">
                        {tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
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
                    </div>
                  </details>
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
          <span className="text-sm text-gray-700">
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
