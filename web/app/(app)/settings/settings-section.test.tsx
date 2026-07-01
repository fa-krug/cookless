// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "lucide-react";
import { SettingsSection, SettingsNavRow } from "./settings-section";

describe("SettingsSection", () => {
  it("renders title, description, and children", () => {
    render(
      <SettingsSection icon={Tag} title="Manage Tags" description="Organize recipes">
        <button>child</button>
      </SettingsSection>,
    );
    expect(screen.getByText("Manage Tags")).toBeInTheDocument();
    expect(screen.getByText("Organize recipes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "child" })).toBeInTheDocument();
  });

  it("applies destructive styling on the icon badge", () => {
    const { container } = render(
      <SettingsSection icon={Tag} title="Danger" variant="destructive" />,
    );
    expect(container.querySelector(".text-destructive")).not.toBeNull();
  });
});

describe("SettingsNavRow", () => {
  it("renders a link to href with title", () => {
    render(<SettingsNavRow icon={Tag} title="Tags" href="/settings/tags" />);
    const link = screen.getByRole("link", { name: /Tags/ });
    expect(link).toHaveAttribute("href", "/settings/tags");
  });
});
