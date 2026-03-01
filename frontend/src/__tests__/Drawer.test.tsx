import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Drawer from "../components/ui/Drawer";

describe("Drawer", () => {
  it("renders title and children when open", () => {
    render(
      <Drawer open onClose={() => {}} title="Drawer Title">
        <p>Drawer content</p>
      </Drawer>,
    );
    expect(screen.getByText("Drawer Title")).toBeInTheDocument();
    expect(screen.getByText("Drawer content")).toBeInTheDocument();
  });

  it("renders dialog role when open", () => {
    render(
      <Drawer open onClose={() => {}} title="Test">
        <p>Content</p>
      </Drawer>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render dialog when closed", () => {
    render(
      <Drawer open={false} onClose={() => {}} title="Test">
        <p>Content</p>
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render a close button", () => {
    render(
      <Drawer open onClose={() => {}} title="Test">
        <p>Content</p>
      </Drawer>,
    );
    expect(screen.queryByText("common.close")).not.toBeInTheDocument();
  });

  it("has accessible title", () => {
    render(
      <Drawer open onClose={() => {}} title="My Drawer">
        <p>Content</p>
      </Drawer>,
    );
    expect(screen.getByText("My Drawer")).toBeInTheDocument();
  });
});
