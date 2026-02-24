import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../api/types";
import RecipeListPage from "../pages/RecipeListPage";

// Mock i18n — return the key as-is
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

// Mock the API client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const KNOWN_RECIPES: Recipe[] = [
  {
    id: "1",
    title: "Pasta Carbonara",
    list_type: "KNOWN",
    default_servings: 4,
    prep_time_minutes: 15,
    cook_time_minutes: 20,
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
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

const TO_TRY_RECIPES: Recipe[] = [
  {
    id: "3",
    title: "Sushi Rolls",
    list_type: "TO_TRY",
    default_servings: 2,
    prep_time_minutes: 45,
    cook_time_minutes: null,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecipeListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecipeListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes("list_type=KNOWN")) return Promise.resolve(KNOWN_RECIPES);
      if (url.includes("list_type=TO_TRY")) return Promise.resolve(TO_TRY_RECIPES);
      return Promise.resolve([]);
    });
    mockPost.mockResolvedValue({
      id: "99",
      title: "New Recipe",
      list_type: "KNOWN",
      default_servings: 4,
      prep_time_minutes: null,
      cook_time_minutes: null,
      ingredients: [],
      manual_steps: [],
      machine_steps: [],
      created_at: "2026-01-10T00:00:00Z",
      updated_at: "2026-01-10T00:00:00Z",
    });
    mockDelete.mockResolvedValue(undefined);
  });

  it("renders recipes for the default KNOWN tab", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });
    expect(screen.getByText("Caesar Salad")).toBeInTheDocument();
    expect(screen.queryByText("Sushi Rolls")).not.toBeInTheDocument();
  });

  it("switches tabs and loads TO_TRY recipes", async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    // Click "To Try" tab
    await user.click(screen.getByText("recipes.toTry"));

    await waitFor(() => {
      expect(screen.getByText("Sushi Rolls")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pasta Carbonara")).not.toBeInTheDocument();
  });

  it("shows empty state when no recipes", async () => {
    mockGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("recipes.noRecipes")).toBeInTheDocument();
    });
  });

  it("submits quick-add form and calls API", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("recipes.recipeName");
    await user.type(input, "New Recipe");
    await user.click(screen.getByText("recipes.quickAdd"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/v1/recipes/", {
        title: "New Recipe",
        list_type: "KNOWN",
        ingredients: [],
        manual_steps: [],
        machine_steps: [],
      });
    });
  });

  it("filters recipes by search input", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("common.search");
    await user.type(searchInput, "caesar");

    expect(screen.queryByText("Pasta Carbonara")).not.toBeInTheDocument();
    expect(screen.getByText("Caesar Salad")).toBeInTheDocument();
  });

  it("displays prep time and servings on recipe card", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    // Pasta Carbonara has prep_time_minutes: 15, servings: 4
    expect(screen.getByText(/recipes.prepTime.*15.*recipes.minutes/)).toBeInTheDocument();
    expect(screen.getByText(/recipes.servings.*4/)).toBeInTheDocument();
  });
});
