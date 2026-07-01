import { describe, expect, it } from "vitest";
import { resolveSwipe } from "./swipe";

describe("resolveSwipe", () => {
  it("returns next on a clear leftward swipe", () => {
    expect(resolveSwipe(-80, 10)).toBe("next");
  });

  it("returns prev on a clear rightward swipe", () => {
    expect(resolveSwipe(80, -10)).toBe("prev");
  });

  it("returns null when below the threshold", () => {
    expect(resolveSwipe(-30, 5)).toBeNull();
    expect(resolveSwipe(49, 0)).toBeNull();
  });

  it("returns null when the gesture is vertical-dominant", () => {
    expect(resolveSwipe(-80, 100)).toBeNull();
    expect(resolveSwipe(60, -60)).toBeNull();
  });

  it("treats movement exactly at the threshold as a swipe", () => {
    expect(resolveSwipe(-50, 0)).toBe("next");
    expect(resolveSwipe(50, 0)).toBe("prev");
  });

  it("respects a custom threshold", () => {
    expect(resolveSwipe(-60, 0, 100)).toBeNull();
    expect(resolveSwipe(-120, 0, 100)).toBe("next");
  });
});
