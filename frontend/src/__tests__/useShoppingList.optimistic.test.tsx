import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingList } from "../api/types";
import { queryKeys } from "../hooks/queryKeys";
import { useBulkToggle, useToggleItem } from "../hooks/useShoppingList";

const mockPatch = vi.fn();
vi.mock("../api/client", () => ({
  api: { patch: (...args: unknown[]) => mockPatch(...args) },
}));

function makeList(): ShoppingList {
  return {
    id: "list-1",
    iteration: "it-1",
    shopping_date: "2026-07-02",
    created_at: "2026-07-02T00:00:00Z",
    items: [
      {
        id: "item-1",
        ingredient_name: "Eggs",
        ingredient_category: "DAIRY",
        quantity: "6",
        unit_abbreviation: "",
        is_checked: false,
      },
      {
        id: "item-2",
        ingredient_name: "Milk",
        ingredient_category: "DAIRY",
        quantity: "1",
        unit_abbreviation: "l",
        is_checked: false,
      },
    ],
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seed both the list-view cache and the detail-view cache.
  queryClient.setQueryData<ShoppingList[]>(queryKeys.shoppingLists, [makeList()]);
  queryClient.setQueryData<ShoppingList>(queryKeys.shoppingList("list-1"), makeList());

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function checkedState(queryClient: QueryClient, itemId: string) {
  const fromList = queryClient
    .getQueryData<ShoppingList[]>(queryKeys.shoppingLists)?.[0]
    .items.find((i) => i.id === itemId)?.is_checked;
  const fromDetail = queryClient
    .getQueryData<ShoppingList>(queryKeys.shoppingList("list-1"))
    ?.items.find((i) => i.id === itemId)?.is_checked;
  return { fromList, fromDetail };
}

describe("useToggleItem optimistic updates", () => {
  beforeEach(() => {
    mockPatch.mockReset();
  });

  it("flips is_checked in both list and detail caches immediately", async () => {
    const { queryClient, wrapper } = setup();
    // Keep the request pending so we observe the optimistic state.
    mockPatch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useToggleItem(), { wrapper });
    act(() => {
      result.current.mutate("item-1");
    });

    await waitFor(() => {
      const { fromList, fromDetail } = checkedState(queryClient, "item-1");
      expect(fromList).toBe(true);
      expect(fromDetail).toBe(true);
    });
  });

  it("rolls back both caches when the request fails", async () => {
    const { queryClient, wrapper } = setup();
    mockPatch.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useToggleItem(), { wrapper });
    act(() => {
      result.current.mutate("item-1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const { fromList, fromDetail } = checkedState(queryClient, "item-1");
    expect(fromList).toBe(false);
    expect(fromDetail).toBe(false);
  });
});

describe("useBulkToggle optimistic updates", () => {
  beforeEach(() => {
    mockPatch.mockReset();
  });

  it("applies is_checked to every listed item at once", async () => {
    const { queryClient, wrapper } = setup();
    mockPatch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBulkToggle(), { wrapper });
    act(() => {
      result.current.mutate({ item_ids: ["item-1", "item-2"], is_checked: true });
    });

    await waitFor(() => {
      expect(checkedState(queryClient, "item-1").fromList).toBe(true);
      expect(checkedState(queryClient, "item-2").fromList).toBe(true);
      expect(checkedState(queryClient, "item-2").fromDetail).toBe(true);
    });
  });
});
