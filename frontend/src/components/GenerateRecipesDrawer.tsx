import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

import Drawer from "./ui/Drawer";
import { useTags } from "../hooks/useTags";
import { TAG_CATEGORIES } from "../api/types";

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

  const [count, setCount] = useState(10);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [generateImages, setGenerateImages] = useState(true);

  function handleGenerate() {
    onGenerate({
      count,
      tagIds: selectedTagIds,
      freeText,
      generateImages,
    });
  }

  return (
    <Drawer open={isOpen} onClose={onClose} title={t("generateRecipes.title")}>
      <div className="space-y-5">
        {/* Count slider */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              {t("generateRecipes.count")}
            </label>
            <span className="text-sm font-semibold text-orange-600">{count}</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-2 w-full accent-orange-500"
          />
        </div>

        {/* Tags */}
        {groupedTags && (
          <div>
            <label className="text-sm font-medium text-gray-700">
              {t("generateRecipes.tags")}
            </label>
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
                    <div className="absolute z-10 mt-1 max-h-60 min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      {tags.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={(e) => {
                              setSelectedTagIds((prev) =>
                                e.target.checked
                                  ? [...prev, tag.id]
                                  : prev.filter((id) => id !== tag.id),
                              );
                            }}
                            className="rounded accent-orange-500"
                          />
                          <span className="text-sm">
                            {i18n.language === "de" ? tag.name_de : tag.name_en}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {/* Free text */}
        <div>
          <label className="text-sm font-medium text-gray-700">
            {t("generateRecipes.freeText")}
          </label>
          <textarea
            rows={3}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={t("generateRecipes.freeTextPlaceholder")}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Generate images checkbox */}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            className="rounded accent-orange-500"
          />
          <span className="text-sm text-gray-700">
            {t("generateRecipes.generateImages")}
          </span>
        </label>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-600"
        >
          <Sparkles size={16} />
          {t("generateRecipes.generate")}
        </button>
      </div>
    </Drawer>
  );
}
