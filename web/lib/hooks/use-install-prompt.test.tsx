// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useInstallPrompt } from "./use-install-prompt";

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

describe("useInstallPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("is not installable initially", () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isInstallable).toBe(false);
  });

  it("becomes installable when beforeinstallprompt fires", () => {
    const { result } = renderHook(() => useInstallPrompt());

    const event = makeBeforeInstallPromptEvent();
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    act(() => {
      window.dispatchEvent(event);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(result.current.isInstallable).toBe(true);
  });

  it("promptInstall calls prompt() and hides the banner on accepted outcome", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makeBeforeInstallPromptEvent("accepted");

    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.isInstallable).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(result.current.isInstallable).toBe(false);
  });

  it("promptInstall leaves isInstallable true on dismissed outcome", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makeBeforeInstallPromptEvent("dismissed");

    act(() => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(result.current.isInstallable).toBe(true);
  });

  it("dismiss() hides the banner and persists to localStorage", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makeBeforeInstallPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.isInstallable).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.isInstallable).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("suppresses the banner on mount when previously dismissed via localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "true");

    const { result } = renderHook(() => useInstallPrompt());
    const event = makeBeforeInstallPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    // beforeinstallprompt still fires (isInstallable internally true) but the
    // prior dismissal keeps the derived flag suppressed.
    expect(result.current.isInstallable).toBe(false);
  });

  it("removes the beforeinstallprompt listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useInstallPrompt());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
  });
});
