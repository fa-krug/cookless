import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ListType } from "../api/types";
import RecipeCard from "../components/RecipeCard";
import { useDeleteRecipe, useRecipes } from "../hooks/useRecipes";
import { useToast } from "../hooks/useToast";

const TABS: { key: ListType; labelKey: string }[] = [
  { key: "KNOWN", labelKey: "recipes.known" },
  { key: "TO_TRY", labelKey: "recipes.toTry" },
];

export default function RecipeListPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ListType>("KNOWN");
  const [search, setSearch] = useState("");

  const { data: recipes, isLoading } = useRecipes(activeTab);
  const deleteRecipe = useDeleteRecipe();

  const filteredRecipes = (recipes ?? []).filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  );

  function handleDelete(id: string) {
    if (!window.confirm(t("recipes.deleteConfirm"))) return;
    deleteRecipe.mutate(id, {
      onError: () => addToast(t("errors.recipeDelete"), "error"),
    });
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

      {/* Add recipe button + Search */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("common.search")}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
        {isLoading && (
          <p className="text-center text-sm text-gray-500">{t("common.loading")}</p>
        )}

        {!isLoading && filteredRecipes.length === 0 && (
          <p className="text-center text-sm text-gray-500">{t("recipes.noRecipes")}</p>
        )}

        {filteredRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
