import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../api/types";
import RecipeListPage from "../pages/RecipeListPage";
import { TooltipProvider } from "../components/ui/tooltip";

// Mock useAuth
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { active_household: { ai_enabled: false, gemini_api_key: "" } } }),
}));

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
    description: "",
    list_type: "KNOWN",
    default_servings: 4,
    prep_time_minutes: 15,
    cook_time_minutes: 20,
    leftover_days: 1,
    image: null,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tags: [],
  },
  {
    id: "2",
    title: "Caesar Salad",
    description: "",
    list_type: "KNOWN",
    default_servings: 2,
    prep_time_minutes: null,
    cook_time_minutes: null,
    leftover_days: 1,
    image: null,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    tags: [],
  },
];

const TO_TRY_RECIPES: Recipe[] = [
  {
    id: "3",
    title: "Sushi Rolls",
    description: "",
    list_type: "TO_TRY",
    default_servings: 2,
    prep_time_minutes: 45,
    cook_time_minutes: null,
    leftover_days: 1,
    image: null,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
    tags: [],
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
    <TooltipProvider delayDuration={0}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RecipeListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </TooltipProvider>,
  );
}

describe("RecipeListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      const params = new URLSearchParams(url.split("?")[1] ?? "");
      const searchParam = params.get("search") ?? "";

      if (url.includes("list_type=KNOWN")) {
        const filtered = searchParam
          ? KNOWN_RECIPES.filter((r) =>
              r.title.toLowerCase().includes(searchParam.toLowerCase()),
            )
          : KNOWN_RECIPES;
        return Promise.resolve({ items: filtered, total_count: filtered.length });
      }
      if (url.includes("list_type=TO_TRY"))
        return Promise.resolve({ items: TO_TRY_RECIPES, total_count: TO_TRY_RECIPES.length });
      return Promise.resolve({ items: [], total_count: 0 });
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
    mockGet.mockResolvedValue({ items: [], total_count: 0 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("recipes.noRecipesTitle")).toBeInTheDocument();
    });
  });

  it("renders new recipe button", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    expect(screen.getByText("recipes.newRecipe")).toBeInTheDocument();
  });

  it("filters recipes by search input", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pasta Carbonara")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("common.search");
    await user.type(searchInput, "caesar");

    // Server-side search: wait for the deferred value to trigger a new API call
    await waitFor(() => {
      expect(screen.queryByText("Pasta Carbonara")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Caesar Salad")).toBeInTheDocument();

    // Verify the API was called with the search parameter
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("search=caesar"));
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
