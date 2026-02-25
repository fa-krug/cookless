import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { MealPlan } from "../api/types";

interface GeneratePlanPayload {
  start_date: string;
  days: number;
  servings: number;
  known_ratio: number;
  default_leftover_days: number;
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
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}
