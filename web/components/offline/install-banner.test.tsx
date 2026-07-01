// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/provider";
import en from "@/lib/i18n/locales/en.json";
import { InstallBanner } from "./install-banner";

const STORAGE_KEY = "cookless-install-dismissed";

function makeBeforeInstallPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function renderBanner() {
  return render(
    <I18nProvider locale="en" dict={en}>
      <InstallBanner />
    </I18nProvider>,
  );
}

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders nothing when not installable", () => {
    const { container } = renderBanner();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the message and buttons once beforeinstallprompt fires", () => {
    renderBanner();

    act(() => {
      window.dispatchEvent(makeBeforeInstallPromptEvent());
    });

    expect(screen.getByText(en.install.message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.install.install })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.common.close })).toBeInTheDocument();
  });

  it("hides again and persists dismissal when the dismiss button is clicked", () => {
    renderBanner();

    act(() => {
      window.dispatchEvent(makeBeforeInstallPromptEvent());
    });

    fireEvent.click(screen.getByRole("button", { name: en.common.close }));

    expect(screen.queryByText(en.install.message)).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });
});
