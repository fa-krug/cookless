import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { MealPlan, PlanIteration } from "../api/types";
import { queryKeys } from "./queryKeys";

interface SetupPlanPayload {
  iteration_weeks: number;
  shopping_days: number[];
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
  excluded_tag_ids?: string[];
}

export function useMealPlans() {
  return useQuery<MealPlan[]>({
    queryKey: queryKeys.mealPlans,
    queryFn: () => api.get<MealPlan[]>("/api/v1/meal-plans/"),
  });
}

export function useMealPlan(id: string | undefined) {
  return useQuery<MealPlan>({
    queryKey: queryKeys.mealPlan(id!),
    queryFn: () => api.get<MealPlan>(`/api/v1/meal-plans/${id}/`),
    enabled: !!id,
  });
}

export function useSetupPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SetupPlanPayload) =>
      api.post<MealPlan>("/api/v1/meal-plans/setup/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans });
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingLists });
    },
  });
}

export function useRenewIteration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (iterationId: string) =>
      api.post<PlanIteration>(`/api/v1/meal-plans/iterations/${iterationId}/renew/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans });
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingLists });
    },
  });
}

export function useNextIteration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PlanIteration>("/api/v1/meal-plans/iterations/next/"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans });
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingLists });
    },
  });
}
