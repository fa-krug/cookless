import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES, type GroupedTags } from "../api/types";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";

interface TagFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  groupedTags: GroupedTags;
  selectedTags: string[];
  onChange: (tagIds: string[]) => void;
}

export default function TagFilterDrawer({
  open,
  onClose,
  groupedTags,
  selectedTags,
  onChange,
}: TagFilterDrawerProps) {
  const { t, i18n } = useTranslation();

  return (
    <ResponsiveOverlay open={open} onClose={onClose} title={t("tags.filter")}>
      <div className="space-y-4">
        {TAG_CATEGORIES.map((category) => {
          const tags = groupedTags[category] || [];
          if (tags.length === 0) return null;
          return (
            <div key={category}>
              <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">
                {t(`tags.${category}`)}
              </h4>
              <div className="space-y-0.5">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag.id)}
                      onChange={(e) => {
                        onChange(
                          e.target.checked
                            ? [...selectedTags, tag.id]
                            : selectedTags.filter((id) => id !== tag.id),
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
            </div>
          );
        })}

        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {t("tags.clearFilters")}
          </button>
        )}
      </div>
    </ResponsiveOverlay>
  );
}
