import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ShoppingList, ShoppingListItem } from "../api/types";
import { queryKeys } from "./queryKeys";

export function useShoppingLists() {
  return useQuery<ShoppingList[]>({
    queryKey: queryKeys.shoppingLists,
    queryFn: () => api.get<ShoppingList[]>("/api/v1/shopping-lists/"),
  });
}

export function useShoppingList(id: string | undefined) {
  return useQuery<ShoppingList>({
    queryKey: queryKeys.shoppingList(id!),
    queryFn: () => api.get<ShoppingList>(`/api/v1/shopping-lists/${id}/`),
    enabled: !!id,
  });
}

/** Snapshot of every cached shopping-list query, for optimistic rollback. */
interface ShoppingCacheSnapshot {
  lists: ShoppingList[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: [readonly unknown[], any][];
}

const isDetailKey = (key: readonly unknown[]) =>
  key.length === 2 && key[0] === "shopping-lists";

/** Apply a per-item transform to every cached shopping list (list view + detail views). */
function updateShoppingCaches(
  queryClient: QueryClient,
  apply: (item: ShoppingListItem) => ShoppingListItem,
) {
  queryClient.setQueryData<ShoppingList[]>(queryKeys.shoppingLists, (old) =>
    old ? old.map((list) => ({ ...list, items: list.items.map(apply) })) : old,
  );
  queryClient.setQueriesData<ShoppingList>(
    { predicate: (query) => isDetailKey(query.queryKey) },
    (old) => (old ? { ...old, items: old.items.map(apply) } : old),
  );
}

/** Cancel in-flight fetches and snapshot the current cache before an optimistic write. */
async function beginOptimistic(queryClient: QueryClient): Promise<ShoppingCacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.shoppingLists });
  return {
    lists: queryClient.getQueryData<ShoppingList[]>(queryKeys.shoppingLists),
    details: queryClient.getQueriesData({
      predicate: (query) => isDetailKey(query.queryKey),
    }),
  };
}

function rollback(queryClient: QueryClient, snapshot: ShoppingCacheSnapshot | undefined) {
  if (!snapshot) return;
  queryClient.setQueryData(queryKeys.shoppingLists, snapshot.lists);
  for (const [key, data] of snapshot.details) {
    queryClient.setQueryData(key, data);
  }
}

export function useToggleItem() {
  const queryClient = useQueryClient();

  return useMutation<ShoppingListItem, Error, string, ShoppingCacheSnapshot>({
    mutationFn: (itemId: string) =>
      api.patch<ShoppingListItem>(`/api/v1/shopping-lists/items/${itemId}/toggle/`),
    onMutate: async (itemId) => {
      const snapshot = await beginOptimistic(queryClient);
      updateShoppingCaches(queryClient, (item) =>
        item.id === itemId ? { ...item, is_checked: !item.is_checked } : item,
      );
      return snapshot;
    },
    onError: (_err, _itemId, snapshot) => {
      rollback(queryClient, snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingLists });
    },
  });
}

interface BulkTogglePayload {
  item_ids: string[];
  is_checked: boolean;
}

export function useBulkToggle() {
  const queryClient = useQueryClient();

  return useMutation<ShoppingListItem[], Error, BulkTogglePayload, ShoppingCacheSnapshot>({
    mutationFn: (data: BulkTogglePayload) =>
      api.patch<ShoppingListItem[]>("/api/v1/shopping-lists/items/bulk-toggle/", data),
    onMutate: async ({ item_ids, is_checked }) => {
      const snapshot = await beginOptimistic(queryClient);
      const ids = new Set(item_ids);
      updateShoppingCaches(queryClient, (item) =>
        ids.has(item.id) ? { ...item, is_checked } : item,
      );
      return snapshot;
    },
    onError: (_err, _payload, snapshot) => {
      rollback(queryClient, snapshot);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingLists });
    },
  });
}
