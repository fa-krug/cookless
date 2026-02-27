import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES, type GroupedTags, type TagCategory } from "../api/types";
import { useCreateTag } from "../hooks/useTags";
import { useCloseDetailsOnClickOutside } from "../hooks/useCloseDetailsOnClickOutside";
import { useDropUp } from "../hooks/useDropUp";

interface TagSelectorProps {
  groupedTags: GroupedTags;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export default function TagSelector({ groupedTags, selectedTagIds, onChange }: TagSelectorProps) {
  const { t, i18n } = useTranslation();
  const createTag = useCreateTag();
  const tagSectionRef = useCloseDetailsOnClickOutside<HTMLDivElement>();
  const tagDropUp = useDropUp();
  const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
  const [newTagEn, setNewTagEn] = useState("");
  const [newTagDe, setNewTagDe] = useState("");

  return (
    <div ref={tagSectionRef} className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">{t("tags.title")}</h3>
      <div className="flex flex-wrap gap-2">
        {TAG_CATEGORIES.map((category) => {
          const tags = groupedTags[category] || [];
          const selected = tags.filter((tag) => selectedTagIds.includes(tag.id));
          return (
            <details
              key={category}
              className="relative"
              ref={tagDropUp(category).ref}
              onToggle={tagDropUp(category).onToggle}
            >
              <summary className="cursor-pointer select-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                {t(`tags.${category}`)}
                {selected.length > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">
                    {selected.length}
                  </span>
                )}
              </summary>
              <div
                className={`absolute z-10 max-h-60 min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${tagDropUp(category).openUp ? "bottom-full mb-1" : "mt-1"}`}
              >
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={(e) => {
                        onChange(
                          e.target.checked
                            ? [...selectedTagIds, tag.id]
                            : selectedTagIds.filter((tid) => tid !== tag.id),
                        );
                      }}
                      className="rounded accent-orange-500"
                    />
                    <span className="text-sm">
                      {i18n.language === "de" ? tag.name_de : tag.name_en}
                    </span>
                  </label>
                ))}
                {addingCategory === category ? (
                  <div className="mt-1 space-y-1 border-t pt-1">
                    <input
                      type="text"
                      placeholder={t("tags.nameEn")}
                      value={newTagEn}
                      onChange={(e) => setNewTagEn(e.target.value)}
                      className="w-full rounded border px-2 py-1"
                    />
                    <input
                      type="text"
                      placeholder={t("tags.nameDe")}
                      value={newTagDe}
                      onChange={(e) => setNewTagDe(e.target.value)}
                      className="w-full rounded border px-2 py-1"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          if (newTagEn.trim() && newTagDe.trim()) {
                            const tag = await createTag.mutateAsync({
                              category,
                              name_en: newTagEn.trim(),
                              name_de: newTagDe.trim(),
                            });
                            onChange([...selectedTagIds, tag.id]);
                            setNewTagEn("");
                            setNewTagDe("");
                            setAddingCategory(null);
                          }
                        }}
                        className="rounded bg-orange-500 px-2 py-1 text-xs text-white hover:bg-orange-600"
                      >
                        {t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingCategory(null);
                          setNewTagEn("");
                          setNewTagDe("");
                        }}
                        className="px-2 py-1 text-xs text-gray-500"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingCategory(category)}
                    className="mt-1 w-full border-t px-2 py-1 text-left text-sm text-orange-600 hover:text-orange-700"
                  >
                    + {t("tags.addTag")}
                  </button>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
