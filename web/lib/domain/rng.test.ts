import { describe, expect, it } from "vitest";
import { mulberry32, sample, shuffle } from "./rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sample", () => {
  it("returns k unique items from the population", () => {
    const out = sample(mulberry32(7), [1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    for (const x of out) expect([1, 2, 3, 4, 5]).toContain(x);
  });

  it("returns all items (shuffled) when k >= population size", () => {
    const out = sample(mulberry32(7), [1, 2, 3], 5);
    expect([...out].sort()).toEqual([1, 2, 3]);
  });

  it("does not mutate the population", () => {
    const pop = [1, 2, 3, 4, 5];
    sample(mulberry32(7), pop, 2);
    expect(pop).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffle(mulberry32(9), arr);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });

  it("is deterministic for a given seed", () => {
    expect(shuffle(mulberry32(9), [1, 2, 3, 4, 5])).toEqual(
      shuffle(mulberry32(9), [1, 2, 3, 4, 5]),
    );
  });
});
