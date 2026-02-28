import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { type GenerateRecipesPayload, type ListType, type RecipeSummary } from "../api/types";
import GenerateRecipesDrawer from "../components/GenerateRecipesDrawer";
import { GenerateRecipesPreview } from "../components/GenerateRecipesPreview";
import RecipeCard from "../components/RecipeCard";
import TagFilterPopover from "../components/TagFilterDrawer";
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
import { useTags } from "../hooks/useTags";
import { toast } from "sonner";

type SortOption = "name-asc" | "name-desc" | "newest" | "updated";

const SORT_STORAGE_KEY = "cookless-recipe-sort";

function getSavedSort(): SortOption {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved === "name-asc" || saved === "name-desc" || saved === "newest" || saved === "updated") {
      return saved;
    }
  } catch {
    // localStorage unavailable
  }
  return "name-asc";
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
  const [sort, setSort] = useState<SortOption>(getSavedSort);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [showGenerateDrawer, setShowGenerateDrawer] = useState(false);
  const [generateConfig, setGenerateConfig] = useState<GenerateRecipesPayload | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (newRecipeId) {
      window.history.replaceState({}, "");
    }
  }, [newRecipeId]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useRecipes(
    activeTab,
    selectedTags.length > 0 ? selectedTags : undefined,
  );
  const { data: groupedTags } = useTags();
  const deleteRecipe = useDeleteRecipe();

  const allRecipes = data?.pages.flatMap((page) => page.items) ?? [];

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

  function handleSortChange(value: string) {
    const newSort = value as SortOption;
    setSort(newSort);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, newSort);
    } catch {
      // localStorage unavailable
    }
  }

  function handleTabChange(value: string) {
    setActiveTab(value as ListType);
  }

  const filteredRecipes = sortRecipes(
    allRecipes.filter(
      (r) => r.title.toLowerCase().includes(search.toLowerCase()) && !pendingDeletes.has(r.id),
    ),
    sort,
    i18n.language,
  );

  const hasRecipes = allRecipes.filter((r) => !pendingDeletes.has(r.id)).length > 0;
  const isSearchEmpty = search.length > 0 && filteredRecipes.length === 0 && hasRecipes;
  const isCollectionEmpty = !hasRecipes && !isLoading;

  const sortOptions = [
    { value: "name-asc", label: t("recipes.sortNameAZ") },
    { value: "name-desc", label: t("recipes.sortNameZA") },
    { value: "newest", label: t("recipes.sortNewest") },
    { value: "updated", label: t("recipes.sortUpdated") },
  ];

  function handleDelete(id: string) {
    const recipe = allRecipes.find((r) => r.id === id);
    if (!recipe) return;

    // Track pending delete in state (for filtering) and ref (for timer cleanup)
    setPendingDeletes((prev) => new Set(prev).add(id));

    let undone = false;

    // Show undo toast
    toast.success(t("recipes.deleted", { title: recipe.title }), {
      duration: 5000,
      action: {
        label: t("common.undo"),
        onClick: () => {
          undone = true;
          const timer = timersRef.current.get(id);
          if (timer) clearTimeout(timer);
          timersRef.current.delete(id);
          setPendingDeletes((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    });

    // Schedule actual delete after 5 seconds
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!undone) {
        deleteRecipe.mutate(id, {
          onError: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
            toast.error(t("errors.recipeDelete"));
          },
        });
      }
    }, 5000);

    timersRef.current.set(id, timer);
  }

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
            className="pl-9"
          />
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
          <TagFilterPopover
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
          </TagFilterPopover>
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
