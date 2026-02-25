import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../contexts/ToastContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/recipes/1"]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("RecipeDetailPage skeleton", () => {
  it("shows skeleton while loading", async () => {
    const { default: RecipeDetailPage } = await import("../pages/RecipeDetailPage");
    renderWithProviders(
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>,
    );
    expect(screen.getByTestId("recipe-detail-skeleton")).toBeInTheDocument();
  });
});
