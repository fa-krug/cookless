import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders with default size", () => {
    render(<Spinner />);
    const svg = screen.getByRole("status");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("animate-spin");
  });

  it("accepts a custom size", () => {
    render(<Spinner size={20} />);
    const svg = screen.getByRole("status");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
  });
});
