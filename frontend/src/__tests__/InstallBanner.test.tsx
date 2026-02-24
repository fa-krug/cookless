import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InstallBanner from "../components/InstallBanner";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

function fireBeforeInstallPrompt() {
  const promptFn = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.defineProperty(event, "prompt", { value: promptFn });
  Object.defineProperty(event, "userChoice", {
    value: Promise.resolve({ outcome: "accepted" as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return promptFn;
}

describe("InstallBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when no beforeinstallprompt has fired", () => {
    const { container } = render(<InstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner when beforeinstallprompt fires", () => {
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.getByText("install.message")).toBeInTheDocument();
    expect(screen.getByText("install.install")).toBeInTheDocument();
    expect(screen.getByText("install.dismiss")).toBeInTheDocument();
  });

  it("calls prompt when install button is clicked", async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    const promptFn = fireBeforeInstallPrompt();

    await user.click(screen.getByText("install.install"));

    expect(promptFn).toHaveBeenCalled();
  });

  it("hides banner when dismiss button is clicked", async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    fireBeforeInstallPrompt();

    expect(screen.getByText("install.message")).toBeInTheDocument();

    await user.click(screen.getByText("install.dismiss"));

    expect(screen.queryByText("install.message")).not.toBeInTheDocument();
  });
});
