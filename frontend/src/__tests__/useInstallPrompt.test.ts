import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

function createPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const promptFn = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.defineProperty(event, "prompt", { value: promptFn });
  Object.defineProperty(event, "userChoice", {
    value: Promise.resolve({ outcome }),
  });
  return { event, promptFn };
}

describe("useInstallPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with isInstallable false", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isInstallable).toBe(false);
  });

  it("becomes installable when beforeinstallprompt fires", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event } = createPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);
  });

  it("promptInstall calls the deferred prompt", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event, promptFn } = createPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(promptFn).toHaveBeenCalledOnce();
    expect(result.current.isInstallable).toBe(false);
  });

  it("dismiss hides the prompt", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event } = createPromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.isInstallable).toBe(false);
  });

  it("cleans up event listener on unmount", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useInstallPrompt());

    unmount();

    expect(spy).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
    spy.mockRestore();
  });
});
