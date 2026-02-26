import { describe, expect, it } from "vitest";
import { formatDuration } from "../utils/formatDuration";

describe("formatDuration", () => {
  it("formats seconds under 60", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(1)).toBe("1s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats exact minutes", () => {
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(300)).toBe("5:00");
    expect(formatDuration(5940)).toBe("99:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(125)).toBe("2:05");
  });

  it("formats hours for long durations", () => {
    expect(formatDuration(5941)).toBe("1h 39min");
    expect(formatDuration(7200)).toBe("2h 0min");
    expect(formatDuration(9000)).toBe("2h 30min");
    expect(formatDuration(43200)).toBe("12h 0min");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});
