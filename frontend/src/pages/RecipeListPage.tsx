import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ListType } from "../api/types";
import RecipeCard from "../components/RecipeCard";
import { useCreateRecipe, useDeleteRecipe, useRecipes } from "../hooks/useRecipes";
import { useToast } from "../hooks/useToast";

const TABS: { key: ListType; labelKey: string }[] = [
  { key: "KNOWN", labelKey: "recipes.known" },
  { key: "TO_TRY", labelKey: "recipes.toTry" },
];

export default function RecipeListPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<ListType>("KNOWN");
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const { data: recipes, isLoading } = useRecipes(activeTab);
  const createRecipe = useCreateRecipe();
  const deleteRecipe = useDeleteRecipe();

  const filteredRecipes = (recipes ?? []).filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  );

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    createRecipe.mutate({ title, list_type: activeTab }, {
      onError: () => addToast(t("errors.recipeSave"), "error"),
    });
    setNewTitle("");
  }

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

      {/* Quick-add form */}
      <form onSubmit={handleQuickAdd} className="mt-4 flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t("recipes.recipeName")}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={createRecipe.isPending || !newTitle.trim()}
          className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {t("recipes.quickAdd")}
        </button>
      </form>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("common.search")}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />

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
