import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import type { ListType, RecipeSummary } from "../api/types";
import RecipeCard from "../components/RecipeCard";
import { EmptyState } from "../components/ui/EmptyState";
import { RecipeListSkeleton } from "../components/ui/RecipeListSkeleton";
import { SortSelect } from "../components/ui/SortSelect";
import { Spinner } from "../components/ui/Spinner";
import { useDeleteRecipe, useRecipes } from "../hooks/useRecipes";
import { useToast } from "../hooks/useToast";

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

const TABS: { key: ListType; labelKey: string }[] = [
  { key: "KNOWN", labelKey: "recipes.known" },
  { key: "TO_TRY", labelKey: "recipes.toTry" },
];

export default function RecipeListPage() {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const newRecipeId = (location.state as { newRecipeId?: string })?.newRecipeId;
  const [activeTab, setActiveTab] = useState<ListType>("KNOWN");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>(getSavedSort);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (newRecipeId) {
      window.history.replaceState({}, "");
    }
  }, [newRecipeId]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecipes(activeTab);
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
    addToast(t("recipes.deleted", { title: recipe.title }), "success", {
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
            queryClient.invalidateQueries({ queryKey: ["recipes"] });
            addToast(t("errors.recipeDelete"), "error");
          },
        });
      }
    }, 5000);

    timersRef.current.set(id, timer);
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-center text-sm font-medium ${
              activeTab === tab.key
                ? "border-b-2 border-orange-500 text-orange-500"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Add recipe button + Search + Sort */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search")}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <SortSelect
          value={sort}
          onChange={handleSortChange}
          options={sortOptions}
          ariaLabel={t("recipes.sortLabel")}
        />
        <button
          type="button"
          onClick={() => navigate(`/recipes/new?list=${activeTab}`)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          <Plus size={16} />
          {t("recipes.newRecipe")}
        </button>
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
    </div>
  );
}
