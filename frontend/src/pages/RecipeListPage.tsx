import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { type GenerateRecipesPayload, type ListType, type RecipeSummary } from "../api/types";
import GenerateRecipesDrawer from "../components/GenerateRecipesDrawer";
import { GenerateRecipesPreview } from "../components/GenerateRecipesPreview";
import RecipeCard from "../components/RecipeCard";
import TagFilterDrawer from "../components/TagFilterDrawer";
import { EmptyState } from "../components/ui/EmptyState";
import { RecipeListSkeleton } from "../components/ui/RecipeListSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import { queryKeys } from "../hooks/queryKeys";
import { useDeleteRecipe, useRecipes } from "../hooks/useRecipes";
import { usePersistedState } from "../hooks/usePersistedState";
import { useTags } from "../hooks/useTags";
import { useUndoDelete } from "../hooks/useUndoDelete";
import { toast } from "sonner";

type SortOption = "name-asc" | "name-desc" | "newest" | "updated";

const SORT_OPTIONS: SortOption[] = ["name-asc", "name-desc", "newest", "updated"];

function isSortOption(v: string | null): v is SortOption {
  return v !== null && SORT_OPTIONS.includes(v as SortOption);
}

function sortRecipes(recipes: RecipeSummary[], sort: SortOption, locale: string): RecipeSummary[] {
  const sorted = [...recipes];
  switch (sort) {
    case "name-asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, locale));
    case "name-desc":
      return sorted.sort((a, b) => b.title.localeCompare(a.title, locale));
    case "newest":
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "updated":
      return sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

export default function RecipeListPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const aiEnabled = user?.active_household?.ai_enabled ?? false;
  const aiConfigured = aiEnabled && (user?.active_household?.gemini_api_key ?? "") !== "";
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const newRecipeId = (location.state as { newRecipeId?: string })?.newRecipeId;
  const [activeTab, setActiveTab] = useState<ListType>("KNOWN");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = usePersistedState("cookless-recipe-sort", "name-asc" as SortOption, isSortOption);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { pendingDeletes, softDelete } = useUndoDelete();
  const [showGenerateDrawer, setShowGenerateDrawer] = useState(false);
  const [generateConfig, setGenerateConfig] = useState<GenerateRecipesPayload | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (newRecipeId) {
      window.history.replaceState({}, "");
    }
  }, [newRecipeId]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useRecipes(
    activeTab,
    selectedTags.length > 0 ? selectedTags : undefined,
    deferredSearch || undefined,
  );
  const { data: groupedTags } = useTags();
  const deleteRecipe = useDeleteRecipe();

  const allRecipes = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSortChange = useCallback((value: string) => {
    setSort(value as SortOption);
  }, [setSort]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as ListType);
  }, []);

  const filteredRecipes = useMemo(
    () =>
      sortRecipes(
        allRecipes.filter((r) => !pendingDeletes.has(r.id)),
        sort,
        i18n.language,
      ),
    [allRecipes, pendingDeletes, sort, i18n.language],
  );

  const hasRecipes = filteredRecipes.length > 0;
  const isSearchEmpty = deferredSearch.length > 0 && filteredRecipes.length === 0 && !isLoading;
  const isCollectionEmpty = !hasRecipes && !isLoading && deferredSearch.length === 0;

  const sortOptions = useMemo(
    () => [
      { value: "name-asc", label: t("recipes.sortNameAZ") },
      { value: "name-desc", label: t("recipes.sortNameZA") },
      { value: "newest", label: t("recipes.sortNewest") },
      { value: "updated", label: t("recipes.sortUpdated") },
    ],
    [t],
  );

  const handleDelete = useCallback((id: string) => {
    const recipe = allRecipes.find((r) => r.id === id);
    if (!recipe) return;

    softDelete(id, {
      toastMessage: t("recipes.deleted", { title: recipe.title }),
      undoLabel: t("common.undo"),
      onConfirm: (deletedId: string) => {
        deleteRecipe.mutate(deletedId, {
          onError: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
            toast.error(t("errors.recipeDelete"));
          },
        });
      },
    });
  }, [allRecipes, softDelete, t, deleteRecipe, queryClient]);

  function handleGenerate(config: {
    count: number;
    tagIds: string[];
    freeText: string;
    generateImages: boolean;
  }) {
    setShowGenerateDrawer(false);
    setGenerateConfig({
      count: config.count,
      tag_ids: config.tagIds,
      free_text: config.freeText,
      generate_images: config.generateImages,
    });
  }

  function handleGenerateClick() {
    if (!aiConfigured) {
      navigate("/household");
      return;
    }
    setShowGenerateDrawer(true);
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-3">
        <TabsList className="w-full">
          <TabsTrigger value="KNOWN" className="flex-1">
            {t("recipes.known")}
          </TabsTrigger>
          <TabsTrigger value="TO_TRY" className="flex-1">
            {t("recipes.toTry")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + actions */}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className={search ? "pl-9 pr-9" : "pl-9"}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("common.clearSearch")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => navigate(`/recipes/new?list=${activeTab}`)}
          aria-label={t("recipes.newRecipe")}
        >
          <Plus size={18} />
          <span className="hidden sm:inline">{t("recipes.newRecipe")}</span>
        </Button>
        {aiEnabled && (
          <Button
            size="sm"
            className="shrink-0"
            onClick={handleGenerateClick}
            aria-label={t("generateRecipes.button")}
          >
            <Sparkles size={18} />
            <span className="hidden sm:inline">{t("generateRecipes.button")}</span>
          </Button>
        )}
      </div>

      {/* Sort + Filter */}
      <div className="mt-2 flex items-center gap-2">
        <Select value={sort} onValueChange={handleSortChange}>
          <SelectTrigger className="w-auto" aria-label={t("recipes.sortLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {groupedTags && (
          <TagFilterDrawer
            groupedTags={groupedTags}
            selectedTags={selectedTags}
            onChange={setSelectedTags}
          >
            <Button variant="outline" size="sm">
              <SlidersHorizontal size={14} />
              {t("tags.filter")}
              {selectedTags.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {selectedTags.length}
                </span>
              )}
            </Button>
          </TagFilterDrawer>
        )}
      </div>

      {/* Recipe list */}
      <div className="mt-4 space-y-3">
        {isLoading && <RecipeListSkeleton />}

        {isCollectionEmpty && (
          <EmptyState
            icon={BookOpen}
            title={t("recipes.noRecipesTitle")}
            subtitle={t("recipes.noRecipesSubtitle")}
            action={{ label: t("recipes.addFirstRecipe"), to: `/recipes/new?list=${activeTab}` }}
          />
        )}

        {isSearchEmpty && (
          <EmptyState
            icon={Search}
            title={t("recipes.noSearchResults")}
            subtitle={t("recipes.noSearchResultsSubtitle")}
          />
        )}

        {filteredRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onDelete={handleDelete}
            highlight={recipe.id === newRecipeId}
          />
        ))}

        {hasNextPage && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {isFetchingNextPage && <Spinner size={24} />}
          </div>
        )}
      </div>

      <GenerateRecipesDrawer
        isOpen={showGenerateDrawer}
        onClose={() => setShowGenerateDrawer(false)}
        onGenerate={handleGenerate}
      />

      {generateConfig && (
        <GenerateRecipesPreview
          config={generateConfig}
          onClose={() => setGenerateConfig(null)}
        />
      )}
    </div>
  );
}
