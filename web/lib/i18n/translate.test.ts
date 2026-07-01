import { describe, it, expect } from "vitest";
import { translate, translateList, type Dictionary } from "./translate";

const dict: Dictionary = {
  common: { save: "Save", loading: "One moment..." },
  setup: { step: "Step {{current}} of {{total}}" },
  plan: {
    weeks_one: "{{count}} week",
    weeks_other: "{{count}} weeks",
    weekdays: ["Mon", "Tue", "Wed"],
  },
};

describe("translate", () => {
  it("resolves a nested key", () => {
    expect(translate(dict, "common.save")).toBe("Save");
  });

  it("interpolates {{vars}}", () => {
    expect(translate(dict, "setup.step", { current: 1, total: 3 })).toBe(
      "Step 1 of 3",
    );
  });

  it("returns the key when missing", () => {
    expect(translate(dict, "nope.missing")).toBe("nope.missing");
  });

  it("pluralizes via count (one)", () => {
    expect(translate(dict, "plan.weeks", { count: 1 })).toBe("1 week");
  });

  it("pluralizes via count (other)", () => {
    expect(translate(dict, "plan.weeks", { count: 3 })).toBe("3 weeks");
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate(dict, "setup.step", { current: 1 })).toBe(
      "Step 1 of {{total}}",
    );
  });
});

describe("translateList", () => {
  it("returns array values", () => {
    expect(translateList(dict, "plan.weekdays")).toEqual(["Mon", "Tue", "Wed"]);
  });

  it("returns [] when missing or not an array", () => {
    expect(translateList(dict, "common.save")).toEqual([]);
    expect(translateList(dict, "nope")).toEqual([]);
  });
});
