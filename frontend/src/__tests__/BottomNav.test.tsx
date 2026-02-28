import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../components/ui/tooltip";
import BottomNav from "../components/BottomNav";

const mockLogout = vi.fn();
const mockUser = {
  email: "test@example.com",
  active_household: { id: "h1", name: "My Household" },
};

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

function renderNav() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={["/recipes"]}>
          <BottomNav />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("BottomNav", () => {
  it("renders 4 mobile nav items", () => {
    renderNav();
    // Mobile bottom bar has 4 links
    const mobileNav = screen.getAllByRole("navigation")[0];
    const links = within(mobileNav).getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("renders desktop sidebar nav items", () => {
    renderNav();
    // Desktop sidebar is the second nav
    const desktopNav = screen.getAllByRole("navigation")[1];
    const links = within(desktopNav).getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("renders sidebar collapse toggle", () => {
    renderNav();
    expect(
      screen.getByRole("button", { name: "nav.collapseSidebar" }),
    ).toBeInTheDocument();
  });

  it("toggles sidebar collapsed state", async () => {
    const user = userEvent.setup();
    renderNav();

    const toggleBtn = screen.getByRole("button", {
      name: "nav.collapseSidebar",
    });
    await user.click(toggleBtn);

    // After collapse, button label switches
    expect(
      screen.getByRole("button", { name: "nav.expandSidebar" }),
    ).toBeInTheDocument();
  });

  it("renders user dropdown trigger with email", () => {
    renderNav();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("My Household")).toBeInTheDocument();
  });

  it("opens dropdown menu with options", async () => {
    const user = userEvent.setup();
    renderNav();

    // Click the user dropdown trigger (the expanded button with email)
    const trigger = screen.getByText("test@example.com").closest("button")!;
    await user.click(trigger);

    // Dropdown should show menu items
    expect(await screen.findByText("nav.manageHousehold")).toBeInTheDocument();
    // "nav.settings" appears both in sidebar nav and dropdown - verify dropdown added it
    expect(screen.getAllByText("nav.settings").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("auth.logout")).toBeInTheDocument();
  });
});
