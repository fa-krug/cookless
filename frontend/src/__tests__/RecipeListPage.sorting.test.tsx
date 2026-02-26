import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../api/types";
import { ToastProvider } from "../contexts/ToastContext";
import RecipeListPage from "../pages/RecipeListPage";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { active_household: { ai_enabled: false, gemini_api_key: "" } } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const mockGet = vi.fn();
vi.mock("../api/client", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() { return storageMap.size; },
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true });

const RECIPES: Recipe[] = [
  {
    id: "1",
    title: "Zebra Cake",
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
    updated_at: "2026-02-10T00:00:00Z",
    tags: [],
  },
  {
    id: "2",
    title: "Apple Pie",
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
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-20T00:00:00Z",
    tags: [],
  },
  {
    id: "3",
    title: "Mango Lassi",
    description: "",
    list_type: "KNOWN",
    default_servings: 2,
    prep_time_minutes: 5,
    cook_time_minutes: null,
    leftover_days: null,
    image: null,
    ingredients: [],
    manual_steps: [],
    machine_steps: [],
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    tags: [],
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  const queryClient = createQueryClient();
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

describe("RecipeListPage sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
    mockGet.mockResolvedValue({ items: RECIPES, total_count: RECIPES.length });
  });

  it("sorts by name A-Z by default", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Apple Pie")).toBeInTheDocument();
    });

    const cards = screen.getAllByRole("link");
    const titles = cards.map((c) => c.textContent).filter(Boolean);
    const appleIdx = titles.findIndex((t) => t?.includes("Apple Pie"));
    const mangoIdx = titles.findIndex((t) => t?.includes("Mango Lassi"));
    const zebraIdx = titles.findIndex((t) => t?.includes("Zebra Cake"));

    expect(appleIdx).toBeLessThan(mangoIdx);
    expect(mangoIdx).toBeLessThan(zebraIdx);
  });

  it("sorts by name Z-A when selected", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Apple Pie")).toBeInTheDocument();
    });

    const sortSelect = screen.getByLabelText("recipes.sortLabel");
    await user.selectOptions(sortSelect, "name-desc");

    const cards = screen.getAllByRole("link");
    const titles = cards.map((c) => c.textContent).filter(Boolean);
    const zebraIdx = titles.findIndex((t) => t?.includes("Zebra Cake"));
    const appleIdx = titles.findIndex((t) => t?.includes("Apple Pie"));

    expect(zebraIdx).toBeLessThan(appleIdx);
  });

  it("sorts by newest first", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Apple Pie")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("recipes.sortLabel"), "newest");

    const cards = screen.getAllByRole("link");
    const titles = cards.map((c) => c.textContent).filter(Boolean);
    const mangoIdx = titles.findIndex((t) => t?.includes("Mango Lassi"));
    const zebraIdx = titles.findIndex((t) => t?.includes("Zebra Cake"));

    // Mango (Feb 1) should come before Zebra (Jan 1)
    expect(mangoIdx).toBeLessThan(zebraIdx);
  });

  it("persists sort preference in localStorage", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Apple Pie")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("recipes.sortLabel"), "newest");
    expect(storageMap.get("cookless-recipe-sort")).toBe("newest");
  });

  it("restores sort preference from localStorage", async () => {
    storageMap.set("cookless-recipe-sort", "name-desc");
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Apple Pie")).toBeInTheDocument();
    });

    const sortSelect = screen.getByLabelText("recipes.sortLabel") as HTMLSelectElement;
    expect(sortSelect.value).toBe("name-desc");
  });

  it("shows search empty state when search has no matches", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Apple Pie")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("common.search"), "xyznotfound");

    expect(screen.getByText("recipes.noSearchResults")).toBeInTheDocument();
    expect(screen.getByText("recipes.noSearchResultsSubtitle")).toBeInTheDocument();
  });

  it("shows collection empty state when no recipes exist", async () => {
    mockGet.mockResolvedValue({ items: [], total_count: 0 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("recipes.noRecipesTitle")).toBeInTheDocument();
    });

    expect(screen.getByText("recipes.noRecipesSubtitle")).toBeInTheDocument();
    expect(screen.getByText("recipes.addFirstRecipe")).toBeInTheDocument();
  });
});
