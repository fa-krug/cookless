import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Ingredient } from "../api/types";

export function useIngredients() {
  return useQuery<Ingredient[]>({
    queryKey: ["ingredients"],
    queryFn: () => api.get<Ingredient[]>("/api/v1/ingredients/"),
  });
}
