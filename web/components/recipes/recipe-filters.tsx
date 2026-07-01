"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Search } from "lucide-react";
import type { RecipeTagDto } from "@/lib/queries/recipes";
import { pickName } from "@/lib/display/format";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface RecipeFiltersProps {
  list: string;
  q: string;
  sort: string;
  tags: string[];
  allTags: RecipeTagDto[];
  locale: string;
}

export function RecipeFilters({
  list,
  q,
  sort,
  tags,
  allTags,
  locale,
}: RecipeFiltersProps) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local search state in sync when URL changes (e.g. back navigation)
  useEffect(() => {
    setSearchValue(q);
  }, [q]);

  const pushParams = useCallback(
    (updates: Record<string, string | string[] | undefined>) => {
      const current = new URLSearchParams(searchParams.toString());
      // When any filter changes, reset offset to 0
      current.delete("offset");
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
          current.delete(key);
        } else if (Array.isArray(value)) {
          current.set(key, value.join(","));
        } else {
          current.set(key, value);
        }
      }
      router.push(`${pathname}?${current.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const handleListChange = (value: string) => {
    if (!value) return; // ToggleGroup calls with empty string on deselect — ignore
    pushParams({ list: value });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: value || undefined });
    }, 300);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    pushParams({ sort: e.target.value });
  };

  const handleTagToggle = (tagId: string) => {
    const next = tags.includes(tagId) ? tags.filter((id) => id !== tagId) : [...tags, tagId];
    pushParams({ tags: next.length ? next : undefined });
  };

  const handleClearTags = () => {
    pushParams({ tags: undefined });
  };

  const activeTagCount = tags.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* List type tabs */}
      <ToggleGroup
        type="single"
        value={list}
        onValueChange={handleListChange}
        variant="outline"
      >
        <ToggleGroupItem value="KNOWN">{t("recipes.known")}</ToggleGroupItem>
        <ToggleGroupItem value="TO_TRY">{t("recipes.toTry")}</ToggleGroupItem>
      </ToggleGroup>

      {/* Search input */}
      <div className="relative flex-1 min-w-40">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t("common.search")}
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* Sort select */}
      <select
        value={sort}
        onChange={handleSortChange}
        aria-label={t("recipes.sortLabel")}
        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="name-asc">{t("recipes.sortNameAZ")}</option>
        <option value="name-desc">{t("recipes.sortNameZA")}</option>
        <option value="newest">{t("recipes.sortNewest")}</option>
        <option value="updated">{t("recipes.sortUpdated")}</option>
      </select>

      {/* Tag filter dialog */}
      {allTags.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-4 w-4" />
              {t("tags.filter")}
              {activeTagCount > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {activeTagCount}
                </span>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("tags.filter")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Group tags by category */}
              {(["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"] as const).map((category) => {
                const categoryTags = allTags.filter((tag) => tag.category === category);
                if (categoryTags.length === 0) return null;
                return (
                  <div key={category} className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{t(`tags.${category}`)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {categoryTags.map((tag) => {
                        const isActive = tags.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => handleTagToggle(tag.id)}
                            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "border border-input bg-background hover:bg-accent"
                            }`}
                          >
                            {pickName(locale, tag)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Custom tags */}
              {(() => {
                const customTags = allTags.filter(
                  (tag) => !["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"].includes(tag.category),
                );
                if (customTags.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{t("tags.customTag")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {customTags.map((tag) => {
                        const isActive = tags.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => handleTagToggle(tag.id)}
                            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "border border-input bg-background hover:bg-accent"
                            }`}
                          >
                            {pickName(locale, tag)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {activeTagCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClearTags} className="w-full">
                  {t("tags.clearFilters")}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
