import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "../components/ui/IconButton";
import { TooltipProvider } from "../components/ui/tooltip";

function renderWithProvider(ui: React.ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe("IconButton", () => {
  it("renders a button with children", () => {
    renderWithProvider(
      <IconButton tooltip="Delete" aria-label="Delete">
        <span>X</span>
      </IconButton>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();
  });

  it("fires click handler", async () => {
    const onClick = vi.fn();
    renderWithProvider(
      <IconButton tooltip="Remove" onClick={onClick}>
        <span>X</span>
      </IconButton>,
    );

    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows tooltip on hover", async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <IconButton tooltip="Delete item" aria-label="Delete item">
        <span>X</span>
      </IconButton>,
    );

    await user.hover(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  });

  it("passes through variant and className props", () => {
    renderWithProvider(
      <IconButton tooltip="Test" variant="ghost" className="custom-class" aria-label="Test">
        <span>X</span>
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Test" });
    expect(button).toHaveClass("custom-class");
  });
});
