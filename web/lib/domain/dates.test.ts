import { describe, expect, it } from "vitest";
import { addDays, daysBetween, weekday } from "./dates";

describe("date helpers", () => {
  it("addDays advances across month boundaries", () => {
    expect(addDays("2026-02-28", 7)).toBe("2026-03-07");
    expect(addDays("2026-02-28", 0)).toBe("2026-02-28");
  });

  it("weekday uses Monday=0 .. Sunday=6 (Python convention)", () => {
    expect(weekday("2026-02-28")).toBe(5); // Saturday
    expect(weekday("2026-03-02")).toBe(0); // Monday
    expect(weekday("2026-03-01")).toBe(6); // Sunday
  });

  it("daysBetween returns whole-day difference", () => {
    expect(daysBetween("2026-02-28", "2026-03-06")).toBe(6);
    expect(daysBetween("2026-03-06", "2026-02-28")).toBe(-6);
  });
});
