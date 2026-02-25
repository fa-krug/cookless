import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "../components/ui/EmptyState";

describe("EmptyState", () => {
  it("renders icon, title, and subtitle", () => {
    render(
      <MemoryRouter>
        <EmptyState icon={BookOpen} title="No recipes yet" subtitle="Start building" />
      </MemoryRouter>,
    );

    expect(screen.getByText("No recipes yet")).toBeInTheDocument();
    expect(screen.getByText("Start building")).toBeInTheDocument();
  });

  it("renders without subtitle", () => {
    render(
      <MemoryRouter>
        <EmptyState icon={BookOpen} title="No recipes yet" />
      </MemoryRouter>,
    );

    expect(screen.getByText("No recipes yet")).toBeInTheDocument();
  });

  it("renders a link action", () => {
    render(
      <MemoryRouter>
        <EmptyState
          icon={BookOpen}
          title="Empty"
          action={{ label: "Add recipe", to: "/recipes/new" }}
        />
      </MemoryRouter>,
    );

    const link = screen.getByText("Add recipe");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/recipes/new");
  });

  it("renders a button action and fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <MemoryRouter>
        <EmptyState icon={BookOpen} title="Empty" action={{ label: "Do it", onClick }} />
      </MemoryRouter>,
    );

    await user.click(screen.getByText("Do it"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders without action", () => {
    render(
      <MemoryRouter>
        <EmptyState icon={BookOpen} title="No matches" subtitle="Try again" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
