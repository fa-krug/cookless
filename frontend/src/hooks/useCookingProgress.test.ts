import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCookingProgress } from "./useCookingProgress";

const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() { return storageMap.size; },
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true });

describe("useCookingProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
  });

  afterEach(() => storageMap.clear());

  it("starts at step 0 with no saved state", () => {
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    expect(result.current.currentStep).toBe(0);
  });

  it("restores saved step from localStorage", () => {
    storageMap.set("cookless-cooking-recipe-1-MANUAL", "3");
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    expect(result.current.currentStep).toBe(3);
  });

  it("clamps saved step to valid range", () => {
    storageMap.set("cookless-cooking-recipe-1-MANUAL", "10");
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    expect(result.current.currentStep).toBe(0);
  });

  it("persists step changes to localStorage", () => {
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    act(() => result.current.setStep(2));
    expect(storageMap.get("cookless-cooking-recipe-1-MANUAL")).toBe("2");
  });

  it("resets to 0 when method changes", () => {
    storageMap.set("cookless-cooking-recipe-1-MANUAL", "3");
    const { result, rerender } = renderHook(
      ({ method }) => useCookingProgress("recipe-1", method, 5),
      { initialProps: { method: "MANUAL" as "MANUAL" | "MACHINE" } },
    );
    expect(result.current.currentStep).toBe(3);
    rerender({ method: "MACHINE" as const });
    expect(result.current.currentStep).toBe(0);
  });

  it("clearProgress removes localStorage entry", () => {
    storageMap.set("cookless-cooking-recipe-1-MANUAL", "3");
    const { result } = renderHook(() => useCookingProgress("recipe-1", "MANUAL", 5));
    act(() => result.current.clearProgress());
    expect(storageMap.get("cookless-cooking-recipe-1-MANUAL")).toBeUndefined();
    expect(result.current.currentStep).toBe(0);
  });
});
