import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ShoppingList, ShoppingListItem } from "../api/types";

export function useShoppingLists() {
  return useQuery<ShoppingList[]>({
    queryKey: ["shopping-lists"],
    queryFn: () => api.get<ShoppingList[]>("/api/v1/shopping-lists/"),
  });
}

export function useShoppingList(id: string | undefined) {
  return useQuery<ShoppingList>({
    queryKey: ["shopping-lists", id],
    queryFn: () => api.get<ShoppingList>(`/api/v1/shopping-lists/${id}/`),
    enabled: !!id,
  });
}

export function useToggleItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) =>
      api.patch<ShoppingListItem>(`/api/v1/shopping-lists/items/${itemId}/toggle/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}

interface BulkTogglePayload {
  item_ids: string[];
  is_checked: boolean;
}

export function useBulkToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkTogglePayload) =>
      api.patch<ShoppingListItem[]>("/api/v1/shopping-lists/items/bulk-toggle/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
    },
  });
}
