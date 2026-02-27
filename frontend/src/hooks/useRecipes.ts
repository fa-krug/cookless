import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ListType, PaginatedResponse, Recipe, RecipeSummary, RecipeUpdatePayload } from "../api/types";
import { queryKeys } from "./queryKeys";

const PAGE_SIZE = 20;

export function useRecipes(listType?: ListType, tagIds?: string[]) {
  return useInfiniteQuery<PaginatedResponse<RecipeSummary>>({
    queryKey: [...queryKeys.recipes, listType, tagIds],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      if (listType) params.set("list_type", listType);
      if (tagIds && tagIds.length > 0) params.set("tags", tagIds.join(","));
      params.set("limit", PAGE_SIZE.toString());
      params.set("offset", String(pageParam));
      return api.get<PaginatedResponse<RecipeSummary>>(`/api/v1/recipes/?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total_count ? loaded : undefined;
    },
  });
}

export function useAllRecipeSummaries() {
  return useQuery<PaginatedResponse<RecipeSummary>>({
    queryKey: [...queryKeys.recipes, "all-summaries"],
    queryFn: () => api.get<PaginatedResponse<RecipeSummary>>("/api/v1/recipes/"),
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecipeUpdatePayload) => api.post<Recipe>("/api/v1/recipes/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
    },
  });
}

export function useRecipe(id: string) {
  return useQuery<Recipe>({
    queryKey: queryKeys.recipe(id),
    queryFn: () => api.get<Recipe>(`/api/v1/recipes/${id}/`),
    enabled: !!id,
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecipeUpdatePayload }) =>
      api.put<Recipe>(`/api/v1/recipes/${id}/`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipe(variables.id) });
    },
  });
}

export function useMoveRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Recipe>(`/api/v1/recipes/${id}/move/`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipe(id) });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/recipes/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
    },
  });
}
