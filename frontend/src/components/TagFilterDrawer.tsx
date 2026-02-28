import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES, type GroupedTags } from "../api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TagFilterPopoverProps {
  groupedTags: GroupedTags;
  selectedTags: string[];
  onChange: (tagIds: string[]) => void;
  children: React.ReactNode;
}

export default function TagFilterPopover({
  groupedTags,
  selectedTags,
  onChange,
  children,
}: TagFilterPopoverProps) {
  const { t, i18n } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <ScrollArea className="max-h-80 p-4">
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
        </ScrollArea>

        {selectedTags.length > 0 && (
          <div className="border-t p-2">
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
      </PopoverContent>
    </Popover>
  );
}
