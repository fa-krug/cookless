// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider, useT } from "./provider";

function Probe() {
  const { t, locale } = useT();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="text">{t("greeting", { name: "Sam" })}</span>
    </div>
  );
}

describe("I18nProvider + useT", () => {
  it("provides locale and a working t()", () => {
    render(
      <I18nProvider locale="de" dict={{ greeting: "Hallo {{name}}" }}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("de");
    expect(screen.getByTestId("text").textContent).toBe("Hallo Sam");
  });

  it("throws outside a provider", () => {
    expect(() => render(<Probe />)).toThrow(/I18nProvider/);
  });
});
