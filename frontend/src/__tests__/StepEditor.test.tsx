import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StepEditor, { type StepRow } from "../components/StepEditor";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

describe("StepEditor", () => {
  const threeSteps: StepRow[] = [
    { step_number: 1, instruction: "Chop onions" },
    { step_number: 2, instruction: "Heat oil" },
    { step_number: 3, instruction: "Fry onions" },
  ];

  it("renders all steps with drag handles", () => {
    render(<StepEditor steps={threeSteps} onChange={vi.fn()} label="By Hand" />);

    expect(screen.getByText("By Hand")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "steps.reorder" })).toHaveLength(3);
    expect(screen.getAllByDisplayValue("Chop onions")).toHaveLength(1);
    expect(screen.getAllByDisplayValue("Heat oil")).toHaveLength(1);
    expect(screen.getAllByDisplayValue("Fry onions")).toHaveLength(1);
  });

  it("drag handles are keyboard-accessible", () => {
    render(<StepEditor steps={threeSteps} onChange={vi.fn()} label="By Hand" />);

    const handles = screen.getAllByRole("button", { name: "steps.reorder" });
    for (const handle of handles) {
      expect(handle).not.toBeDisabled();
      expect(handle).toHaveAttribute("aria-label", "steps.reorder");
    }
  });

  it("adds a new step", async () => {
    const onChange = vi.fn();
    render(<StepEditor steps={threeSteps} onChange={onChange} label="By Hand" />);

    await userEvent.click(screen.getByRole("button", { name: "steps.add" }));

    expect(onChange).toHaveBeenCalledWith([
      ...threeSteps,
      { step_number: 4, instruction: "" },
    ]);
  });

  it("removes a step and renumbers", async () => {
    const onChange = vi.fn();
    render(<StepEditor steps={threeSteps} onChange={onChange} label="By Hand" />);

    const removeButtons = screen.getAllByRole("button", { name: "common.remove" });
    await userEvent.click(removeButtons[1]); // remove "Heat oil"

    expect(onChange).toHaveBeenCalledWith([
      { step_number: 1, instruction: "Chop onions" },
      { step_number: 2, instruction: "Fry onions" },
    ]);
  });

  it("updates instruction text", async () => {
    const onChange = vi.fn();
    render(<StepEditor steps={threeSteps} onChange={onChange} label="By Hand" />);

    const textareas = screen.getAllByPlaceholderText("steps.instruction");
    await userEvent.type(textareas[0], "!");

    expect(onChange).toHaveBeenCalledWith([
      { step_number: 1, instruction: "Chop onions!" },
      { step_number: 2, instruction: "Heat oil" },
      { step_number: 3, instruction: "Fry onions" },
    ]);
  });

  it("shows empty state when no steps", () => {
    render(<StepEditor steps={[]} onChange={vi.fn()} label="By Hand" />);

    expect(screen.getByText("steps.noSteps")).toBeInTheDocument();
  });

  it("renders program selector for machine steps", () => {
    const steps: StepRow[] = [{ step_number: 1, instruction: "" }];
    render(
      <StepEditor steps={steps} onChange={vi.fn()} label="Machine" isMachine />,
    );

    expect(screen.getByText("steps.programs.MANUAL_COOKING")).toBeInTheDocument();
    expect(screen.getByText("steps.programs.CHOPPING")).toBeInTheDocument();
  });

  it("does not show program selector for non-machine steps", () => {
    const steps: StepRow[] = [{ step_number: 1, instruction: "" }];
    render(
      <StepEditor steps={steps} onChange={vi.fn()} label="By Hand" />,
    );

    expect(screen.queryByText("steps.programs.MANUAL_COOKING")).not.toBeInTheDocument();
  });
});
