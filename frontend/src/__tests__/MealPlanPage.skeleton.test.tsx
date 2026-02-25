import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../contexts/ToastContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { returnObjects?: boolean }) =>
      opts?.returnObjects ? [] : key,
    i18n: { language: "en" },
  }),
}));

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ToastProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}

describe("MealPlanPage skeleton", () => {
  it("shows skeleton while loading", async () => {
    const { default: MealPlanPage } = await import("../pages/MealPlanPage");
    renderWithProviders(<MealPlanPage />);
    expect(screen.getByTestId("meal-plan-skeleton")).toBeInTheDocument();
  });
});
