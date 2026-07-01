import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedulePendingDelete, cancelPendingDelete, isPending } from "./pending-delete";

describe("pending-delete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires run after delayMs", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run, 5000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("uses a default delay of 5000ms when not provided", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run);
    vi.advanceTimersByTime(4999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancelPendingDelete before the delay prevents run", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run, 5000);
    vi.advanceTimersByTime(2000);
    cancelPendingDelete("r1");
    vi.advanceTimersByTime(10000);
    expect(run).not.toHaveBeenCalled();
  });

  it("cancelPendingDelete drops the id without calling run", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run, 5000);
    cancelPendingDelete("r1");
    expect(isPending("r1")).toBe(false);
  });

  it("re-scheduling the same id resets the timer instead of double-firing", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run, 5000);
    vi.advanceTimersByTime(3000);
    schedulePendingDelete("r1", run, 5000);
    vi.advanceTimersByTime(3000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("isPending reflects state before scheduling, while pending, and after firing", async () => {
    const run = vi.fn();
    expect(isPending("r1")).toBe(false);
    schedulePendingDelete("r1", run, 5000);
    expect(isPending("r1")).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(isPending("r1")).toBe(false);
  });

  it("isPending reflects false after cancellation", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run, 5000);
    expect(isPending("r1")).toBe(true);
    cancelPendingDelete("r1");
    expect(isPending("r1")).toBe(false);
  });

  it("cancelPendingDelete on an id that is not scheduled is a no-op", () => {
    expect(() => cancelPendingDelete("nope")).not.toThrow();
  });

  it("supports multiple independent ids", () => {
    const runA = vi.fn();
    const runB = vi.fn();
    schedulePendingDelete("a", runA, 5000);
    schedulePendingDelete("b", runB, 3000);
    vi.advanceTimersByTime(3000);
    expect(runB).toHaveBeenCalledTimes(1);
    expect(runA).not.toHaveBeenCalled();
    cancelPendingDelete("a");
    vi.advanceTimersByTime(2000);
    expect(runA).not.toHaveBeenCalled();
  });

  it("removes id from registry once run fires, so isPending is false and can be re-scheduled", () => {
    const run = vi.fn();
    schedulePendingDelete("r1", run, 1000);
    vi.advanceTimersByTime(1000);
    expect(isPending("r1")).toBe(false);
    schedulePendingDelete("r1", run, 1000);
    expect(isPending("r1")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
