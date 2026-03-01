import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES, type GroupedTags } from "../api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Drawer from "@/components/ui/Drawer";

interface TagFilterDrawerProps {
  groupedTags: GroupedTags;
  selectedTags: string[];
  onChange: (tagIds: string[]) => void;
  children: React.ReactNode;
}

export default function TagFilterDrawer({
  groupedTags,
  selectedTags,
  onChange,
  children,
}: TagFilterDrawerProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Drawer open={open} onClose={() => setOpen(false)} title={t("tags.filter")}>
        <div className="space-y-4">
          {TAG_CATEGORIES.map((category) => {
            const tags = groupedTags[category] || [];
            if (tags.length === 0) return null;
            return (
              <div key={category}>
                <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  {t(`tags.${category}`)}
                </h4>
                <div className="space-y-0.5">
                  {tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
                    >
                      <Checkbox
                        checked={selectedTags.includes(tag.id)}
                        onCheckedChange={(checked) => {
                          onChange(
                            checked
                              ? [...selectedTags, tag.id]
                              : selectedTags.filter((id) => id !== tag.id),
                          );
                        }}
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
        </div>

        {selectedTags.length > 0 && (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onChange([])}
            >
              {t("tags.clearFilters")}
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}
