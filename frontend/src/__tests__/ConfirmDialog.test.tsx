import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete recipe?"
        message="This can't be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Delete recipe?")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete?"
        message="Sure?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete?"
        message="Sure?"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables confirm until typed confirmation matches", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete household?"
        message="Type the name to confirm"
        confirmLabel="Delete"
        requireTypedConfirmation="My Home"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirmBtn = screen.getByText("Delete");
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByPlaceholderText("My Home");
    await user.type(input, "Wrong");
    expect(confirmBtn).toBeDisabled();

    await user.clear(input);
    await user.type(input, "My Home");
    expect(confirmBtn).not.toBeDisabled();
  });

  it("shows input field when inputField prop is set", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Remove password"
        message="Enter current password"
        confirmLabel="Confirm"
        inputField={{ type: "password", placeholder: "Current password" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Current password");
    expect(input).toHaveAttribute("type", "password");

    // Confirm disabled when empty
    expect(screen.getByText("Confirm")).toBeDisabled();

    await user.type(input, "mypassword");
    expect(screen.getByText("Confirm")).not.toBeDisabled();

    await user.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledWith("mypassword");
  });

  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Test"
        message="Test"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("Test")).not.toBeInTheDocument();
  });
});
