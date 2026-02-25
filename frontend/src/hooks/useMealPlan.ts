import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { MealPlan, MealPlanEntry, ShoppingList } from "../api/types";

interface GeneratePlanPayload {
  start_date: string;
  days: number;
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
}

interface UpdateEntryPayload {
  entryId: string;
  data: {
    recipe?: string;
    servings?: number;
    is_locked?: boolean;
  };
}

export function useMealPlans() {
  return useQuery<MealPlan[]>({
    queryKey: ["meal-plans"],
    queryFn: () => api.get<MealPlan[]>("/api/v1/meal-plans/"),
  });
}

export function useMealPlan(id: string | undefined) {
  return useQuery<MealPlan>({
    queryKey: ["meal-plans", id],
    queryFn: () => api.get<MealPlan>(`/api/v1/meal-plans/${id}/`),
    enabled: !!id,
  });
}

export function useGeneratePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GeneratePlanPayload) =>
      api.post<MealPlan>("/api/v1/meal-plans/generate/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, data }: UpdateEntryPayload) =>
      api.put<MealPlanEntry>(`/api/v1/meal-plans/entries/${entryId}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    },
  });
}

export function useRegeneratePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) =>
      api.post<MealPlan>(`/api/v1/meal-plans/${planId}/regenerate/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    },
  });
}

export function useCreateShoppingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mealPlanId: string) =>
      api.post<ShoppingList>("/api/v1/shopping-lists/generate/", { meal_plan: mealPlanId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}
