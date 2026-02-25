import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../api/types";
import { ToastProvider } from "../contexts/ToastContext";
import RecipeListPage from "../pages/RecipeListPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (key === "recipes.deleted" && params?.title) return `"${params.title}" deleted`;
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const RECIPES: Recipe[] = [
  {
    id: "1",
    title: "Pasta Carbonara",
    list_type: "KNOWN",
    default_servings: 4,
    prep_time_minutes: 15,
    cook_time_minutes: 20,
    leftover_days: 1,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    title: "Caesar Salad",
    list_type: "KNOWN",
    default_servings: 2,
    prep_time_minutes: null,
    cook_time_minutes: null,
    leftover_days: 1,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RecipeListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("RecipeListPage undo delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(RECIPES);
    mockDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows undo toast and hides recipe when delete clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    // Click delete on Pasta Carbonara
    const deleteButtons = screen.getAllByRole("button", { name: /common.delete/i });
    await user.click(deleteButtons[0]);

    // Recipe should be hidden
    expect(screen.queryByText("Pasta Carbonara")).not.toBeInTheDocument();
    // Caesar Salad should still be visible
    expect(screen.getByText("Caesar Salad")).toBeInTheDocument();

    // Undo toast should appear
    expect(screen.getByText('"Pasta Carbonara" deleted')).toBeInTheDocument();
    expect(screen.getByText("common.undo")).toBeInTheDocument();

    // API should NOT have been called yet
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("restores recipe when undo is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: /common.delete/i });
    await user.click(deleteButtons[0]);

    // Recipe hidden
    expect(screen.queryByText("Pasta Carbonara")).not.toBeInTheDocument();

    // Click undo
    await user.click(screen.getByText("common.undo"));

    // Recipe restored
    expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();

    // Advance past 5 second timer — delete should NOT fire
    vi.advanceTimersByTime(6000);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("calls delete API after 5 seconds without undo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: /common.delete/i });
    await user.click(deleteButtons[0]);

    expect(mockDelete).not.toHaveBeenCalled();

    // Advance past 5 seconds
    vi.advanceTimersByTime(5100);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/api/v1/recipes/1/");
    });
  });
});
