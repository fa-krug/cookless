import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ListType, Recipe } from "../api/types";

export function useRecipes(listType?: ListType) {
  return useQuery<Recipe[]>({
    queryKey: ["recipes", listType],
    queryFn: () => {
      const params = listType ? `?list_type=${listType}` : "";
      return api.get<Recipe[]>(`/api/v1/recipes/${params}`);
    },
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; list_type: ListType }) =>
      api.post<Recipe>("/api/v1/recipes/", {
        title: data.title,
        list_type: data.list_type,
        ingredients: [],
        manual_steps: [],
        machine_steps: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/recipes/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
