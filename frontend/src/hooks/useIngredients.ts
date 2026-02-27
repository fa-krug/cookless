import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Ingredient } from "../api/types";
import { queryKeys } from "./queryKeys";

export function useIngredients() {
  return useQuery<Ingredient[]>({
    queryKey: queryKeys.ingredients,
    queryFn: () => api.get<Ingredient[]>("/api/v1/ingredients/"),
    staleTime: 5 * 60_000,
  });
}

export async function createIngredient(name: string): Promise<Ingredient> {
  return api.post<Ingredient>("/api/v1/ingredients/", {
    name_en: name,
    name_de: name,
    category: "OTHER",
  });
}
