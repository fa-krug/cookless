import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StepEditor from "../components/StepEditor";
import { TooltipProvider } from "../components/ui/tooltip";

const renderWithTooltip = (ui: React.ReactNode) =>
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

describe("StepEditor", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threeFields: any[] = [
    { id: "field-1", step_number: 1, instruction: "Chop onions" },
    { id: "field-2", step_number: 2, instruction: "Heat oil" },
    { id: "field-3", step_number: 3, instruction: "Fry onions" },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeProps(overrides: Record<string, any> = {}) {
    return {
      fields: threeFields,
      append: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      label: "By Hand",
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("renders all steps with drag handles", () => {
    renderWithTooltip(<StepEditor {...makeProps()} />);

    expect(screen.getByText("By Hand")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "steps.reorder" })).toHaveLength(3);
    expect(screen.getByText("Chop onions")).toBeInTheDocument();
    expect(screen.getByText("Heat oil")).toBeInTheDocument();
    expect(screen.getByText("Fry onions")).toBeInTheDocument();
  });

  it("drag handles are keyboard-accessible", () => {
    renderWithTooltip(<StepEditor {...makeProps()} />);

    const handles = screen.getAllByRole("button", { name: "steps.reorder" });
    for (const handle of handles) {
      expect(handle).not.toBeDisabled();
      expect(handle).toHaveAttribute("aria-label", "steps.reorder");
    }
  });

  it("adds a new step", async () => {
    const append = vi.fn();
    renderWithTooltip(<StepEditor {...makeProps({ append })} />);

    await userEvent.click(screen.getByRole("button", { name: "steps.add" }));

    expect(append).toHaveBeenCalledWith({ step_number: 4, instruction: "", ingredients: [] });
  });

  it("removes a step", async () => {
    const removeFn = vi.fn();
    renderWithTooltip(<StepEditor {...makeProps({ remove: removeFn })} />);

    const removeButtons = screen.getAllByRole("button", { name: "common.remove" });
    await userEvent.click(removeButtons[1]); // remove "Heat oil"

    expect(removeFn).toHaveBeenCalledWith(1);
  });

  it("updates instruction text via drawer", async () => {
    const update = vi.fn();
    renderWithTooltip(<StepEditor {...makeProps({ update })} />);

    // Click the step text to open drawer
    await userEvent.click(screen.getByText("Chop onions"));

    // Find textarea in the drawer
    const textarea = screen.getByPlaceholderText("steps.instruction");
    await userEvent.type(textarea, "!");

    expect(update).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ instruction: "Chop onions!", step_number: 1 }),
    );
  });

  it("shows empty state when no steps", () => {
    renderWithTooltip(<StepEditor {...makeProps({ fields: [] })} />);

    expect(screen.getByText("steps.noSteps")).toBeInTheDocument();
  });

  it("renders program selector for machine steps in drawer", async () => {
    const fields = [{ id: "field-1", step_number: 1, instruction: "" }];
    renderWithTooltip(
      <StepEditor {...makeProps({ fields, isMachine: true })} />,
    );

    // Click step to open drawer with program selector
    await userEvent.click(screen.getByText("steps.instruction"));

    expect(screen.getByText("steps.programs.MANUAL_COOKING")).toBeInTheDocument();
    expect(screen.getByText("steps.programs.CHOPPING")).toBeInTheDocument();
  });

  it("does not show program selector for non-machine steps", async () => {
    const fields = [{ id: "field-1", step_number: 1, instruction: "" }];
    renderWithTooltip(
      <StepEditor {...makeProps({ fields })} />,
    );

    // Click to open drawer
    await userEvent.click(screen.getByText("steps.instruction"));

    expect(screen.queryByText("steps.programs.MANUAL_COOKING")).not.toBeInTheDocument();
  });
});
