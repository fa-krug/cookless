import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../components/ui/tooltip";
import Layout from "../components/Layout";

let mockUser: Record<string, unknown> | null = null;
let mockIsLoading = false;

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: mockIsLoading,
    logout: vi.fn(),
  }),
}));

vi.mock("../hooks/useOnlineSync", () => ({
  useOnlineSync: () => {},
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

function renderLayout(initialPath = "/recipes") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/recipes" element={<div>Recipe page</div>} />
            </Route>
            <Route path="/login" element={<div>Login page</div>} />
            <Route path="/setup" element={<div>Setup page</div>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Layout", () => {
  it("redirects to /login when user is null", () => {
    mockUser = null;
    mockIsLoading = false;
    renderLayout();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("redirects to /setup for incomplete onboarding", () => {
    mockUser = {
      email: "test@example.com",
      onboarding_step: "HOUSEHOLD",
      active_household: null,
    };
    mockIsLoading = false;
    renderLayout();
    expect(screen.getByText("Setup page")).toBeInTheDocument();
  });

  it("renders content when user is authenticated", () => {
    mockUser = {
      email: "test@example.com",
      onboarding_step: "COMPLETED",
      active_household: { id: "h1", name: "Home" },
    };
    mockIsLoading = false;
    renderLayout();
    expect(screen.getByText("Recipe page")).toBeInTheDocument();
  });

  it("shows loading spinner while auth is loading", () => {
    mockUser = null;
    mockIsLoading = true;
    renderLayout();
    // Should not show login page or content when loading
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
    expect(screen.queryByText("Recipe page")).not.toBeInTheDocument();
  });
});
