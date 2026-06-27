# Next.js Migration — Plan 2: Domain Logic Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all risky business logic — shopping aggregation + unit conversion, recipe scaling + validation, meal-plan selection + leftover scheduling — from the Django backend into `web/lib/domain/` as pure, framework-free TypeScript, test-driven against the existing Python test cases, before any of it is wired into a page or the DB.

**Architecture:** Everything lives under `web/lib/domain/` and depends on nothing from Next.js, Drizzle, or `better-sqlite3`. Functions take plain data structures (defined per module) and return plain data structures. Decimal math goes through `decimal.js` configured for banker's rounding (matching Python's `Decimal.quantize` default). The two places the Python code reaches into the DB or `random` are made pure here: DB rows become input arrays prepared by future wiring code, and `random` becomes an **injected seedable RNG** so selection/scheduling tests are deterministic. Dates are passed as ISO `YYYY-MM-DD` strings (matching the Drizzle schema's `DateField → text` decision from Plan 1).

**Tech Stack:** TypeScript, Vitest, decimal.js. (All already installed in `web/` by Plan 1.)

## Global Constraints

- **Framework-free.** No imports from `next`, `drizzle-orm`, `better-sqlite3`, or `../db` anywhere under `lib/domain/`. (spec: "all risky business logic lives in `lib/domain/` as pure, framework-free TypeScript")
- **A quantity must never touch a JS `number`.** Quantities and conversion factors are `decimal.js` `Decimal` (constructed from strings) end to end. (spec: Data layer)
- **Banker's rounding.** Python `Decimal.quantize(Decimal("0.01"))` uses `ROUND_HALF_EVEN`. The TS port quantizes to 2 decimal places with `Decimal.ROUND_HALF_EVEN`. Python `round()` (used for `known_count`) is also half-to-even — match it. (backend: `shopping/services.py:58`, `planner/services.py:161`)
- **Weekday convention: Monday = 0 … Sunday = 6** (Python `date.weekday()`), NOT JS `getDay()` (Sunday = 0). All weekday math converts. (backend: `iteration_utils.py`)
- **Randomness is injected, never global.** Selection and scheduling take an `Rng` parameter. Tests pass a seeded RNG for determinism. (backend: `planner/services.py` uses `random.sample`/`random.shuffle` unseeded)
- **All paths below are relative to repo root.** The Next.js app root is `web/` (from Plan 1). Run all commands from `web/` unless noted.
- **Tests are co-located** as `<module>.test.ts` next to the source, matching Plan 1's convention.

---

### Task 1: Decimal configuration + quantize helper

**Files:**
- Create: `web/lib/domain/decimal.ts`
- Test: `web/lib/domain/decimal.test.ts`

**Interfaces:**
- Produces:
  - `Decimal` — re-export of `decimal.js`'s default export, with global rounding set to `ROUND_HALF_EVEN`.
  - `quantize2(value: Decimal): Decimal` — rounds to exactly 2 decimal places using `ROUND_HALF_EVEN`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/decimal.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Decimal, quantize2 } from "./decimal";

describe("quantize2", () => {
  it("rounds half to even (banker's rounding), matching Python Decimal.quantize", () => {
    // .005 -> nearest even hundredth is .00 (0 is even)
    expect(quantize2(new Decimal("1700.005")).toFixed(2)).toBe("1700.00");
    // .015 -> nearest even hundredth is .02 (rounds up from odd 1)
    expect(quantize2(new Decimal("1700.015")).toFixed(2)).toBe("1700.02");
  });

  it("preserves two decimal places on whole numbers", () => {
    expect(quantize2(new Decimal("400")).toFixed(2)).toBe("400.00");
    // numeric equality ignores trailing zeros, mirroring Python Decimal("400.00") == Decimal("400")
    expect(quantize2(new Decimal("400")).equals(new Decimal("400"))).toBe(true);
  });

  it("does not introduce float drift", () => {
    expect(quantize2(new Decimal("0.1").plus("0.2")).toFixed(2)).toBe("0.30");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/decimal.test.ts`
Expected: FAIL — cannot find module `./decimal`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/decimal.ts`:
```ts
import Decimal from "decimal.js";

// Match Python's Decimal.quantize default (ROUND_HALF_EVEN / banker's rounding).
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };

/** Round to exactly 2 decimal places using banker's rounding. */
export function quantize2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/decimal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/decimal.ts web/lib/domain/decimal.test.ts
git commit -m "feat: add decimal.js config with banker's rounding for domain layer"
```

---

### Task 2: Seedable RNG (sample + shuffle)

**Files:**
- Create: `web/lib/domain/rng.ts`
- Test: `web/lib/domain/rng.test.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number }` — returns a float in `[0, 1)`.
  - `mulberry32(seed: number): Rng` — deterministic PRNG.
  - `sample<T>(rng: Rng, pop: readonly T[], k: number): T[]` — `k` unique items (without replacement); if `k >= pop.length`, returns a shuffled copy of all of `pop`. Mirrors Python `random.sample`.
  - `shuffle<T>(rng: Rng, arr: readonly T[]): T[]` — returns a shuffled **copy** (does not mutate input). Mirrors Python `random.shuffle` (which is in-place, but a copy is safer in TS).

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/rng.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/rng.test.ts`
Expected: FAIL — cannot find module `./rng`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/rng.ts`:
```ts
export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

/** Mulberry32 PRNG — small, fast, deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** k unique items without replacement. If k >= pop.length, returns all (shuffled). */
export function sample<T>(rng: Rng, pop: readonly T[], k: number): T[] {
  return shuffle(rng, pop).slice(0, Math.min(k, pop.length));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/rng.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/rng.ts web/lib/domain/rng.test.ts
git commit -m "feat: add seedable RNG (sample + shuffle) for deterministic domain tests"
```

---

### Task 3: Unit conversion (`toBase`)

Port of `Unit.to_base()` (backend: `recipes/models.py:45-48`).

**Files:**
- Create: `web/lib/domain/shopping/units.ts`
- Test: `web/lib/domain/shopping/units.test.ts`

**Interfaces:**
- Consumes: `Decimal` from `../decimal`.
- Produces:
  - `interface DomainUnit { id: number; baseUnitId: number | null; conversionFactor: string }`
  - `toBase(quantity: Decimal | string | number, unit: DomainUnit): Decimal` — if the unit has a base unit, multiply by `conversionFactor`; otherwise return the quantity unchanged.

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/shopping/units.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { type DomainUnit, toBase } from "./units";

const gram: DomainUnit = { id: 1, baseUnitId: null, conversionFactor: "1" };
const kg: DomainUnit = { id: 2, baseUnitId: 1, conversionFactor: "1000" };

describe("toBase", () => {
  it("multiplies by conversion_factor for a derived unit (1.5 kg -> 1500 g)", () => {
    expect(toBase(new Decimal("1.5"), kg).toString()).toBe("1500");
  });

  it("returns quantity unchanged for a base unit (200 g -> 200)", () => {
    expect(toBase(new Decimal("200"), gram).toString()).toBe("200");
  });

  it("matches the legacy 500 g -> 0.5 kg case (factor 0.001)", () => {
    const gFromKg: DomainUnit = { id: 3, baseUnitId: 9, conversionFactor: "0.001" };
    expect(toBase(500, gFromKg).toString()).toBe("0.5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/shopping/units.test.ts`
Expected: FAIL — cannot find module `./units`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/shopping/units.ts`:
```ts
import { Decimal } from "../decimal";

export interface DomainUnit {
  id: number;
  baseUnitId: number | null;
  conversionFactor: string;
}

/** Convert a quantity to its base unit. Port of Django Unit.to_base(). */
export function toBase(quantity: Decimal | string | number, unit: DomainUnit): Decimal {
  const q = new Decimal(quantity);
  if (unit.baseUnitId !== null) {
    return q.times(new Decimal(unit.conversionFactor));
  }
  return q;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/shopping/units.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/shopping/units.ts web/lib/domain/shopping/units.test.ts
git commit -m "feat: port Unit.to_base conversion to domain layer"
```

---

### Task 4: Recipe scaling (`scaleFactor` / `scaleQuantity`)

Port of the scaling expressions in `shopping/services.py:41-43` (`scale = servings / default_servings`).

**Files:**
- Create: `web/lib/domain/recipes/scaling.ts`
- Test: `web/lib/domain/recipes/scaling.test.ts`

**Interfaces:**
- Consumes: `Decimal` from `../decimal`.
- Produces:
  - `scaleFactor(servings: number, defaultServings: number): Decimal` — `servings / defaultServings` as a `Decimal`.
  - `scaleQuantity(quantity: Decimal | string | number, servings: number, defaultServings: number): Decimal` — `quantity * scaleFactor(...)`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/recipes/scaling.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { scaleFactor, scaleQuantity } from "./scaling";

describe("scaleFactor", () => {
  it("doubles when servings is twice the default", () => {
    expect(scaleFactor(4, 2).toString()).toBe("2");
  });

  it("is 1 when servings equals default", () => {
    expect(scaleFactor(2, 2).toString()).toBe("1");
  });
});

describe("scaleQuantity", () => {
  it("scales 200 by 4/2 -> 400", () => {
    expect(scaleQuantity("200", 4, 2).toString()).toBe("400");
  });

  it("keeps decimal precision (1.5 by 3/2 -> 2.25)", () => {
    expect(scaleQuantity("1.5", 3, 2).toString()).toBe("2.25");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/recipes/scaling.test.ts`
Expected: FAIL — cannot find module `./scaling`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/recipes/scaling.ts`:
```ts
import { Decimal } from "../decimal";

/** servings / default_servings as an exact Decimal. */
export function scaleFactor(servings: number, defaultServings: number): Decimal {
  return new Decimal(servings).div(new Decimal(defaultServings));
}

/** Scale a recipe-ingredient quantity for a requested serving count. */
export function scaleQuantity(
  quantity: Decimal | string | number,
  servings: number,
  defaultServings: number,
): Decimal {
  return new Decimal(quantity).times(scaleFactor(servings, defaultServings));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/recipes/scaling.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/recipes/scaling.ts web/lib/domain/recipes/scaling.test.ts
git commit -m "feat: port recipe quantity scaling to domain layer"
```

---

### Task 5: Shopping aggregation (`aggregateShoppingItems`)

Port of the aggregation loop in `shopping/services.py:38-63` (the pure core, minus DB I/O). This is the highest-risk decimal area.

**Files:**
- Create: `web/lib/domain/shopping/aggregate.ts`
- Test: `web/lib/domain/shopping/aggregate.test.ts`

**Interfaces:**
- Consumes: `Decimal`, `quantize2` from `../decimal`; `DomainUnit`, `toBase` from `./units`; `scaleFactor` from `../recipes/scaling`.
- Produces:
  - `interface EntryIngredient { ingredientId: number; quantity: string; unit: DomainUnit }`
  - `interface ShoppingEntry { servings: number; defaultServings: number; isLeftover: boolean; ingredients: EntryIngredient[] }`
  - `interface AggregatedItem { ingredientId: number; unitId: number; quantity: Decimal }` — `quantity` is already quantized to 2 dp; `unitId` is the **base** unit id.
  - `aggregateShoppingItems(entries: ShoppingEntry[]): AggregatedItem[]` — skips leftover entries, scales each ingredient by `servings/defaultServings`, converts to base units, and sums by `(ingredientId, baseUnitId)`. Result order follows first-seen `(ingredientId, baseUnitId)` insertion order (matches Python dict ordering).

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/shopping/aggregate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { type DomainUnit } from "./units";
import { aggregateShoppingItems, type ShoppingEntry } from "./aggregate";

const gram: DomainUnit = { id: 1, baseUnitId: null, conversionFactor: "1" };
const kg: DomainUnit = { id: 2, baseUnitId: 1, conversionFactor: "1000" };
const FLOUR = 10;
const SUGAR = 11;

function find(items: ReturnType<typeof aggregateShoppingItems>, ingredientId: number) {
  return items.find((i) => i.ingredientId === ingredientId);
}

describe("aggregateShoppingItems", () => {
  it("sums the same ingredient across recipes (200 + 300 = 500)", () => {
    const entries: ShoppingEntry[] = [
      { servings: 2, defaultServings: 2, isLeftover: false,
        ingredients: [{ ingredientId: FLOUR, quantity: "200", unit: gram }] },
      { servings: 2, defaultServings: 2, isLeftover: false,
        ingredients: [{ ingredientId: FLOUR, quantity: "300", unit: gram }] },
    ];
    const items = aggregateShoppingItems(entries);
    expect(items).toHaveLength(1);
    expect(find(items, FLOUR)!.quantity.equals(new Decimal("500.00"))).toBe(true);
  });

  it("skips leftover entries", () => {
    const entries: ShoppingEntry[] = [
      { servings: 2, defaultServings: 2, isLeftover: false,
        ingredients: [{ ingredientId: FLOUR, quantity: "200", unit: gram }] },
      { servings: 2, defaultServings: 2, isLeftover: true,
        ingredients: [{ ingredientId: FLOUR, quantity: "200", unit: gram }] },
    ];
    const items = aggregateShoppingItems(entries);
    expect(items).toHaveLength(1);
    expect(find(items, FLOUR)!.quantity.equals(new Decimal("200"))).toBe(true);
  });

  it("scales by servings / default_servings (200 at 4/2 = 400)", () => {
    const entries: ShoppingEntry[] = [
      { servings: 4, defaultServings: 2, isLeftover: false,
        ingredients: [{ ingredientId: FLOUR, quantity: "200", unit: gram }] },
    ];
    expect(find(aggregateShoppingItems(entries), FLOUR)!.quantity.equals(new Decimal("400"))).toBe(true);
  });

  it("converts derived units to base before summing (200 g + 1.5 kg = 1700 g)", () => {
    const entries: ShoppingEntry[] = [
      { servings: 2, defaultServings: 2, isLeftover: false,
        ingredients: [{ ingredientId: FLOUR, quantity: "200", unit: gram }] },
      { servings: 2, defaultServings: 2, isLeftover: false,
        ingredients: [{ ingredientId: FLOUR, quantity: "1.5", unit: kg }] },
    ];
    const items = aggregateShoppingItems(entries);
    expect(items).toHaveLength(1);
    const flour = find(items, FLOUR)!;
    expect(flour.quantity.equals(new Decimal("1700.00"))).toBe(true);
    expect(flour.unitId).toBe(gram.id); // aggregated under the base unit
  });

  it("keeps distinct ingredients as separate items", () => {
    const entries: ShoppingEntry[] = [
      { servings: 2, defaultServings: 2, isLeftover: false, ingredients: [
        { ingredientId: FLOUR, quantity: "300", unit: gram },
        { ingredientId: SUGAR, quantity: "150", unit: gram },
      ] },
    ];
    const items = aggregateShoppingItems(entries);
    expect(items).toHaveLength(2);
    expect(find(items, FLOUR)!.quantity.equals(new Decimal("300"))).toBe(true);
    expect(find(items, SUGAR)!.quantity.equals(new Decimal("150"))).toBe(true);
  });

  it("returns an empty list when there are no non-leftover entries", () => {
    expect(aggregateShoppingItems([])).toEqual([]);
    expect(
      aggregateShoppingItems([
        { servings: 2, defaultServings: 2, isLeftover: true,
          ingredients: [{ ingredientId: FLOUR, quantity: "200", unit: gram }] },
      ]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/shopping/aggregate.test.ts`
Expected: FAIL — cannot find module `./aggregate`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/shopping/aggregate.ts`:
```ts
import { Decimal, quantize2 } from "../decimal";
import { scaleFactor } from "../recipes/scaling";
import { type DomainUnit, toBase } from "./units";

export interface EntryIngredient {
  ingredientId: number;
  quantity: string;
  unit: DomainUnit;
}

export interface ShoppingEntry {
  servings: number;
  defaultServings: number;
  isLeftover: boolean;
  ingredients: EntryIngredient[];
}

export interface AggregatedItem {
  ingredientId: number;
  unitId: number;
  quantity: Decimal;
}

/**
 * Aggregate non-leftover entries into shopping items.
 * Port of shopping/services.py generate_shopping_lists_for_iteration (pure core).
 */
export function aggregateShoppingItems(entries: ShoppingEntry[]): AggregatedItem[] {
  const acc = new Map<string, { ingredientId: number; unitId: number; total: Decimal }>();

  for (const entry of entries) {
    if (entry.isLeftover) continue;
    const scale = scaleFactor(entry.servings, entry.defaultServings);
    for (const ri of entry.ingredients) {
      const scaled = new Decimal(ri.quantity).times(scale);
      const base = toBase(scaled, ri.unit);
      const baseUnitId = ri.unit.baseUnitId ?? ri.unit.id;
      const key = `${ri.ingredientId}:${baseUnitId}`;
      const existing = acc.get(key);
      if (existing) {
        existing.total = existing.total.plus(base);
      } else {
        acc.set(key, { ingredientId: ri.ingredientId, unitId: baseUnitId, total: base });
      }
    }
  }

  return [...acc.values()].map((v) => ({
    ingredientId: v.ingredientId,
    unitId: v.unitId,
    quantity: quantize2(v.total),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/shopping/aggregate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/shopping/aggregate.ts web/lib/domain/shopping/aggregate.test.ts
git commit -m "feat: port shopping-list aggregation to domain layer"
```

---

### Task 6: Program step validation (`validateProgramStep`)

Port of `recipes/programs.py` (backend: lines 3-92), verbatim constants and logic.

**Files:**
- Create: `web/lib/domain/recipes/program-validation.ts`
- Test: `web/lib/domain/recipes/program-validation.test.ts`

**Interfaces:**
- Produces:
  - `PROGRAM_PARAMS: Record<string, [string, boolean][]>`
  - `DEFAULT_RANGES: Record<string, [number, number]>`
  - `RANGE_OVERRIDES: Record<string, Record<string, [number, number]>>`
  - `VALID_DIRECTIONS: ReadonlySet<string>` (`"LEFT"`, `"RIGHT"`)
  - `interface ProgramStepParams { temperature: number | null; durationSeconds: number | null; speed: number | null; direction: string | null; turbo: boolean; weightGrams: number | null }`
  - `validateProgramStep(programType: string, params: ProgramStepParams): string[]` — returns error messages (empty = valid). Error messages use the Python snake_case field names (`duration_seconds`, `weight_grams`) so message substrings match the backend.

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/recipes/program-validation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { type ProgramStepParams, validateProgramStep } from "./program-validation";

const base: ProgramStepParams = {
  temperature: null, durationSeconds: null, speed: null,
  direction: null, turbo: false, weightGrams: null,
};

describe("validateProgramStep", () => {
  it("accepts a valid MANUAL_COOKING step", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: 100, durationSeconds: 300, speed: 5, direction: "LEFT",
    });
    expect(errors).toEqual([]);
  });

  it("flags a missing required temperature", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: null, durationSeconds: 300, speed: 5, direction: "LEFT",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("temperature");
  });

  it("flags an out-of-range temperature (default range 37-130)", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: 200, durationSeconds: 300, speed: 5, direction: "LEFT",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("temperature");
  });

  it("applies FERMENTATION temperature override (max 60)", () => {
    const errors = validateProgramStep("FERMENTATION", {
      ...base, temperature: 80, durationSeconds: 3600,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("temperature");
  });

  it("rejects an invalid program_type", () => {
    expect(validateProgramStep("NONSENSE", base)).toEqual(["Invalid program_type: NONSENSE"]);
  });

  it("requires a valid direction value when provided", () => {
    const errors = validateProgramStep("MANUAL_COOKING", {
      ...base, temperature: 100, durationSeconds: 300, speed: 5, direction: "SIDEWAYS",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("direction");
  });

  it("accepts PRE_CLEANING with no parameters", () => {
    expect(validateProgramStep("PRE_CLEANING", base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/recipes/program-validation.test.ts`
Expected: FAIL — cannot find module `./program-validation`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/recipes/program-validation.ts`:
```ts
export const PROGRAM_PARAMS: Record<string, [string, boolean][]> = {
  MANUAL_COOKING: [
    ["temperature", true],
    ["duration_seconds", true],
    ["speed", true],
    ["direction", true],
    ["turbo", false],
  ],
  CHOPPING: [["duration_seconds", true], ["speed", true]],
  KNEADING: [["duration_seconds", true]],
  STEAMING: [["temperature", true], ["duration_seconds", true]],
  BLENDING: [["duration_seconds", true]],
  SEARING: [["temperature", true], ["duration_seconds", true], ["speed", true]],
  SLOW_COOKING: [["temperature", true], ["duration_seconds", true]],
  SOUS_VIDE: [["temperature", true], ["duration_seconds", true]],
  WEIGHING: [["weight_grams", true]],
  TURBO: [["duration_seconds", true]],
  EGG_COOKING: [["duration_seconds", true]],
  FERMENTATION: [["temperature", true], ["duration_seconds", true]],
  PRE_CLEANING: [],
};

export const DEFAULT_RANGES: Record<string, [number, number]> = {
  temperature: [37, 130],
  duration_seconds: [1, 5940],
  speed: [1, 10],
  weight_grams: [1, 5000],
};

export const RANGE_OVERRIDES: Record<string, Record<string, [number, number]>> = {
  SLOW_COOKING: { duration_seconds: [1, 43200] },
  SOUS_VIDE: { duration_seconds: [1, 43200] },
  FERMENTATION: { temperature: [37, 60], duration_seconds: [1, 43200] },
  TURBO: { duration_seconds: [1, 60] },
};

export const VALID_DIRECTIONS: ReadonlySet<string> = new Set(["LEFT", "RIGHT"]);

export interface ProgramStepParams {
  temperature: number | null;
  durationSeconds: number | null;
  speed: number | null;
  direction: string | null;
  turbo: boolean;
  weightGrams: number | null;
}

/** Validate program step parameters. Returns error messages (empty = valid). */
export function validateProgramStep(programType: string, params: ProgramStepParams): string[] {
  const errors: string[] = [];

  const programParams = PROGRAM_PARAMS[programType];
  if (programParams === undefined) {
    return [`Invalid program_type: ${programType}`];
  }

  const overrides = RANGE_OVERRIDES[programType] ?? {};
  const intValues: Record<string, number | null> = {
    temperature: params.temperature,
    duration_seconds: params.durationSeconds,
    speed: params.speed,
    weight_grams: params.weightGrams,
  };

  for (const [field, required] of programParams) {
    if (field === "turbo") continue;

    if (field === "direction") {
      if (required && params.direction === null) {
        errors.push(`${field} is required for ${programType}`);
      } else if (params.direction !== null && !VALID_DIRECTIONS.has(params.direction)) {
        errors.push(`direction must be one of LEFT, RIGHT, got ${params.direction}`);
      }
      continue;
    }

    const value = intValues[field];

    if (required && value === null) {
      errors.push(`${field} is required for ${programType}`);
      continue;
    }
    if (value === null) continue;

    const [min, max] = overrides[field] ?? DEFAULT_RANGES[field] ?? [0, 999999];
    if (!(min <= value && value <= max)) {
      errors.push(`${field} must be between ${min} and ${max}, got ${value}`);
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/recipes/program-validation.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/recipes/program-validation.ts web/lib/domain/recipes/program-validation.test.ts
git commit -m "feat: port program-step validation to domain layer"
```

---

### Task 7: Step-ingredient total validation (`validateStepIngredientTotals`)

Port of `_validate_step_ingredient_totals` (backend: `recipes/api.py:119-144`), returning errors instead of raising.

**Files:**
- Create: `web/lib/domain/recipes/step-validation.ts`
- Test: `web/lib/domain/recipes/step-validation.test.ts`

**Interfaces:**
- Consumes: `Decimal` from `../decimal`.
- Produces:
  - `interface RecipeIngredientQty { order: number; quantity: string }`
  - `interface StepIngredientRef { recipeIngredientOrder: number; quantity: string }`
  - `validateStepIngredientTotals(ingredients: RecipeIngredientQty[], stepIngredients: StepIngredientRef[]): string[]` — for each `order`, the sum of step quantities must not exceed the recipe ingredient quantity at that order. Caller flattens manual + machine step ingredients into one list. Returns error messages (empty = valid).

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/recipes/step-validation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { validateStepIngredientTotals } from "./step-validation";

describe("validateStepIngredientTotals", () => {
  it("passes when step totals stay within recipe quantities", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "200" }],
      [{ recipeIngredientOrder: 1, quantity: "120" }, { recipeIngredientOrder: 1, quantity: "80" }],
    );
    expect(errors).toEqual([]);
  });

  it("flags when step totals exceed the recipe quantity", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "200" }],
      [{ recipeIngredientOrder: 1, quantity: "150" }, { recipeIngredientOrder: 1, quantity: "100" }],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("order 1");
    expect(errors[0]).toContain("250");
    expect(errors[0]).toContain("200");
  });

  it("ignores step ingredients with no matching recipe order", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "200" }],
      [{ recipeIngredientOrder: 9, quantity: "999" }],
    );
    expect(errors).toEqual([]);
  });

  it("compares with decimal precision (no float drift)", () => {
    const errors = validateStepIngredientTotals(
      [{ order: 1, quantity: "0.3" }],
      [{ recipeIngredientOrder: 1, quantity: "0.1" }, { recipeIngredientOrder: 1, quantity: "0.2" }],
    );
    expect(errors).toEqual([]); // 0.1 + 0.2 == 0.3 exactly with Decimal
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/recipes/step-validation.test.ts`
Expected: FAIL — cannot find module `./step-validation`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/recipes/step-validation.ts`:
```ts
import { Decimal } from "../decimal";

export interface RecipeIngredientQty {
  order: number;
  quantity: string;
}

export interface StepIngredientRef {
  recipeIngredientOrder: number;
  quantity: string;
}

/**
 * Validate that step ingredient quantities don't exceed recipe ingredient quantities.
 * Port of recipes/api.py _validate_step_ingredient_totals (returns errors, does not raise).
 */
export function validateStepIngredientTotals(
  ingredients: RecipeIngredientQty[],
  stepIngredients: StepIngredientRef[],
): string[] {
  const byOrder = new Map<number, Decimal>();
  for (const item of ingredients) byOrder.set(item.order, new Decimal(item.quantity));

  const totals = new Map<number, Decimal>();
  for (const si of stepIngredients) {
    const current = totals.get(si.recipeIngredientOrder) ?? new Decimal(0);
    totals.set(si.recipeIngredientOrder, current.plus(new Decimal(si.quantity)));
  }

  const errors: string[] = [];
  for (const [order, total] of totals) {
    const recipeQty = byOrder.get(order);
    if (recipeQty !== undefined && total.gt(recipeQty)) {
      errors.push(
        `Ingredient at order ${order}: step quantities sum to ${total.toString()}, ` +
          `but recipe only has ${recipeQty.toString()}`,
      );
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/recipes/step-validation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/recipes/step-validation.ts web/lib/domain/recipes/step-validation.test.ts
git commit -m "feat: port step-ingredient total validation to domain layer"
```

---

### Task 8: Iteration dates + shopping segments + shopping-day validation

Port of `planner/iteration_utils.py` (backend: lines 6-97), with a small `dates.ts` helper for ISO-string date math (Monday=0 weekday convention).

**Files:**
- Create: `web/lib/domain/dates.ts`
- Create: `web/lib/domain/meal-plan/iteration-dates.ts`
- Test: `web/lib/domain/dates.test.ts`
- Test: `web/lib/domain/meal-plan/iteration-dates.test.ts`

**Interfaces:**
- `dates.ts` produces:
  - `addDays(iso: string, n: number): string`
  - `weekday(iso: string): number` — Monday=0 … Sunday=6.
  - `daysBetween(a: string, b: string): number` — `b - a` in whole days.
- `iteration-dates.ts` produces:
  - `validateShoppingDays(days: number[]): void` — throws `Error` (message contains the same key phrases as the Python `ValueError`).
  - `computeIterationDates(requestedStart: string, iterationWeeks: number): { start: string; end: string }` — `end = start + weeks*7 - 1` days. (The Python signature takes `shopping_days` but ignores it; omitted here.)
  - `interface ShoppingSegment { segStart: string; shoppingDate: string; segEnd: string }`
  - `computeShoppingSegments(startDate: string, endDate: string, shoppingDays: number[]): ShoppingSegment[]`

- [ ] **Step 1: Write the failing test for `dates.ts`**

Create `web/lib/domain/dates.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/dates.test.ts`
Expected: FAIL — cannot find module `./dates`.

- [ ] **Step 3: Write `dates.ts`**

Create `web/lib/domain/dates.ts`:
```ts
const MS_PER_DAY = 86_400_000;

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return toISO(date);
}

/** Monday=0 .. Sunday=6, matching Python's date.weekday(). */
export function weekday(iso: string): number {
  return (parseISO(iso).getUTCDay() + 6) % 7;
}

/** Whole-day difference b - a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_PER_DAY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/dates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `iteration-dates.ts`**

Create `web/lib/domain/meal-plan/iteration-dates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  computeIterationDates,
  computeShoppingSegments,
  validateShoppingDays,
} from "./iteration-dates";

describe("validateShoppingDays", () => {
  it("accepts a single day", () => {
    expect(() => validateShoppingDays([5])).not.toThrow();
  });
  it("accepts two days 3+ apart", () => {
    expect(() => validateShoppingDays([0, 3])).not.toThrow();
  });
  it("accepts two days 3 apart via wrap (Sat + Tue)", () => {
    expect(() => validateShoppingDays([5, 1])).not.toThrow();
  });
  it("rejects empty", () => {
    expect(() => validateShoppingDays([])).toThrow(/at least 1/);
  });
  it("rejects three days", () => {
    expect(() => validateShoppingDays([0, 2, 4])).toThrow(/at most 2/);
  });
  it("rejects two days too close", () => {
    expect(() => validateShoppingDays([0, 1])).toThrow(/at least 3 days apart/);
  });
  it("rejects two days too close via wrap (Sun + Mon)", () => {
    expect(() => validateShoppingDays([6, 0])).toThrow(/at least 3 days apart/);
  });
  it("rejects an out-of-range weekday", () => {
    expect(() => validateShoppingDays([7])).toThrow();
    expect(() => validateShoppingDays([-1])).toThrow();
  });
});

describe("computeIterationDates", () => {
  it("spans one week (start + 7 - 1)", () => {
    expect(computeIterationDates("2026-02-28", 1)).toEqual({
      start: "2026-02-28",
      end: "2026-03-06",
    });
  });
  it("spans two weeks", () => {
    expect(computeIterationDates("2026-02-28", 2)).toEqual({
      start: "2026-02-28",
      end: "2026-03-13",
    });
  });
});

describe("computeShoppingSegments", () => {
  it("single shopping day, one week -> one segment", () => {
    expect(computeShoppingSegments("2026-02-28", "2026-03-06", [5])).toEqual([
      { segStart: "2026-02-28", shoppingDate: "2026-02-28", segEnd: "2026-03-06" },
    ]);
  });

  it("single shopping day, two weeks -> two segments", () => {
    expect(computeShoppingSegments("2026-02-28", "2026-03-13", [5])).toEqual([
      { segStart: "2026-02-28", shoppingDate: "2026-02-28", segEnd: "2026-03-06" },
      { segStart: "2026-03-07", shoppingDate: "2026-03-07", segEnd: "2026-03-13" },
    ]);
  });

  it("two shopping days, two weeks -> four segments", () => {
    expect(computeShoppingSegments("2026-03-04", "2026-03-17", [2, 5])).toEqual([
      { segStart: "2026-03-04", shoppingDate: "2026-03-04", segEnd: "2026-03-06" },
      { segStart: "2026-03-07", shoppingDate: "2026-03-07", segEnd: "2026-03-10" },
      { segStart: "2026-03-11", shoppingDate: "2026-03-11", segEnd: "2026-03-13" },
      { segStart: "2026-03-14", shoppingDate: "2026-03-14", segEnd: "2026-03-17" },
    ]);
  });

  it("no shopping date in range -> one full-span segment", () => {
    expect(computeShoppingSegments("2026-03-02", "2026-03-03", [4])).toEqual([
      { segStart: "2026-03-02", shoppingDate: "2026-03-02", segEnd: "2026-03-03" },
    ]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/meal-plan/iteration-dates.test.ts`
Expected: FAIL — cannot find module `./iteration-dates`.

- [ ] **Step 7: Write `iteration-dates.ts`**

Create `web/lib/domain/meal-plan/iteration-dates.ts`:
```ts
import { addDays, weekday } from "../dates";

/** Port of validate_shopping_days. Throws Error on invalid config. */
export function validateShoppingDays(shoppingDays: number[]): void {
  if (shoppingDays.length === 0) throw new Error("Must configure at least 1 shopping day");
  if (shoppingDays.length > 2) throw new Error("Must configure at most 2 shopping days");

  for (const day of shoppingDays) {
    if (day < 0 || day > 6) throw new Error(`Invalid weekday: ${day}. Must be 0-6.`);
  }

  if (shoppingDays.length === 2) {
    const [a, b] = [...shoppingDays].sort((x, y) => x - y);
    const gap = b - a;
    const circularGap = Math.min(gap, 7 - gap);
    if (circularGap < 3) throw new Error("Shopping days must be at least 3 days apart");
  }
}

/** Port of compute_iteration_dates. End = start + weeks*7 - 1 days. */
export function computeIterationDates(
  requestedStart: string,
  iterationWeeks: number,
): { start: string; end: string } {
  return { start: requestedStart, end: addDays(requestedStart, iterationWeeks * 7 - 1) };
}

export interface ShoppingSegment {
  segStart: string;
  shoppingDate: string;
  segEnd: string;
}

/** Port of compute_shopping_segments. */
export function computeShoppingSegments(
  startDate: string,
  endDate: string,
  shoppingDays: number[],
): ShoppingSegment[] {
  const shoppingSet = new Set(shoppingDays);

  const shoppingDates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    if (shoppingSet.has(weekday(current))) shoppingDates.push(current);
    current = addDays(current, 1);
  }

  // Drop any shopping date on the last day (nothing to cover after it).
  if (shoppingDates.length > 0 && shoppingDates[shoppingDates.length - 1] === endDate) {
    shoppingDates.pop();
  }

  if (shoppingDates.length === 0) {
    return [{ segStart: startDate, shoppingDate: startDate, segEnd: endDate }];
  }

  const segments: ShoppingSegment[] = [];
  for (let i = 0; i < shoppingDates.length; i++) {
    const shopDate = shoppingDates[i];
    const segStart = i === 0 ? startDate : shopDate;
    const segEnd = i + 1 < shoppingDates.length ? addDays(shoppingDates[i + 1], -1) : endDate;
    segments.push({ segStart, shoppingDate: shopDate, segEnd });
  }
  return segments;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/meal-plan/iteration-dates.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 9: Commit**

```bash
git add web/lib/domain/dates.ts web/lib/domain/dates.test.ts web/lib/domain/meal-plan/iteration-dates.ts web/lib/domain/meal-plan/iteration-dates.test.ts
git commit -m "feat: port iteration date + shopping segment logic to domain layer"
```

---

### Task 9: Recipe selection — session counts, overlap score, pool filtering, selection

Port of `_select_recipes`, `_select_recipes_with_overlap`, `_ingredient_overlap_score`, and the cooking-session math (backend: `planner/services.py:141-209`). DB-query parts (household/excluded-tag filtering) are the caller's responsibility; the pure core takes already-fetched pools.

**Files:**
- Create: `web/lib/domain/meal-plan/selection.ts`
- Test: `web/lib/domain/meal-plan/selection.test.ts`

**Interfaces:**
- Consumes: `Rng`, `sample` from `../rng`.
- Produces:
  - `interface SelectableRecipe { id: string; ingredientIds: number[] }`
  - `computeSessionCounts(days: number, defaultLeftoverDays: number, knownRatio: number): { cookingSessions: number; knownCount: number; tryCount: number }` — `cookingSessions = max(floor(days / (1 + defaultLeftoverDays)), 1)`; `knownCount = bankersRound(cookingSessions * knownRatio)`; `tryCount = cookingSessions - knownCount`.
  - `ingredientOverlapScore(recipes: SelectableRecipe[]): number` — sum of per-ingredient recipe-counts where the count > 1 (ingredient shared by 2+ recipes).
  - `filterPools(known: SelectableRecipe[], tryList: SelectableRecipe[], knownCount: number, tryCount: number, excludeIds: Set<string>): { known: SelectableRecipe[]; tryList: SelectableRecipe[] }` — drop excluded ids; if a filtered pool falls below its needed count, restore the full pool.
  - `selectRecipesWithOverlap(known: SelectableRecipe[], tryList: SelectableRecipe[], knownCount: number, tryCount: number, rng: Rng, candidates?: number): SelectableRecipe[]` — `candidates` default 50; samples and keeps the highest-overlap set.
  - `selectRecipes(opts: { known: SelectableRecipe[]; tryList: SelectableRecipe[]; days: number; knownRatio: number; defaultLeftoverDays: number; excludeIds: Set<string>; rng: Rng }): SelectableRecipe[]` — composes the above.

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/meal-plan/selection.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import {
  computeSessionCounts,
  filterPools,
  ingredientOverlapScore,
  selectRecipes,
  type SelectableRecipe,
} from "./selection";

function makeRecipes(prefix: string, n: number): SelectableRecipe[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, ingredientIds: [i, i + 1] }));
}

describe("computeSessionCounts", () => {
  it("7 days, leftover 1, ratio 0.7 -> 3 sessions, 2 known, 1 try", () => {
    expect(computeSessionCounts(7, 1, 0.7)).toEqual({
      cookingSessions: 3,
      knownCount: 2,
      tryCount: 1,
    });
  });

  it("7 days, leftover 0 -> 7 sessions", () => {
    expect(computeSessionCounts(7, 0, 0.7).cookingSessions).toBe(7);
  });

  it("never drops below one cooking session", () => {
    expect(computeSessionCounts(1, 3, 0.7).cookingSessions).toBe(1);
  });
});

describe("ingredientOverlapScore", () => {
  it("sums shared-ingredient counts (3 ingredients each shared by 2 -> 6)", () => {
    const recipes: SelectableRecipe[] = [
      { id: "a", ingredientIds: [1, 2] },
      { id: "b", ingredientIds: [1, 3] },
      { id: "c", ingredientIds: [2, 3] },
    ];
    expect(ingredientOverlapScore(recipes)).toBe(6);
  });

  it("is zero when no ingredients are shared", () => {
    expect(ingredientOverlapScore([
      { id: "a", ingredientIds: [1] },
      { id: "b", ingredientIds: [2] },
    ])).toBe(0);
  });
});

describe("filterPools", () => {
  it("removes excluded ids when the remaining pool is still big enough", () => {
    const known = makeRecipes("k", 5);
    const result = filterPools(known, [], 2, 0, new Set(["k-0", "k-1"]));
    expect(result.known.map((r) => r.id)).not.toContain("k-0");
    expect(result.known).toHaveLength(3);
  });

  it("restores the full pool when exclusion would leave too few", () => {
    const known = makeRecipes("k", 3);
    const result = filterPools(known, [], 3, 0, new Set(["k-0", "k-1"]));
    expect(result.known).toHaveLength(3); // restored
  });
});

describe("selectRecipes", () => {
  it("selects the expected known/try counts", () => {
    const selected = selectRecipes({
      known: makeRecipes("k", 10),
      tryList: makeRecipes("t", 10),
      days: 7,
      knownRatio: 0.7,
      defaultLeftoverDays: 1,
      excludeIds: new Set(),
      rng: mulberry32(123),
    });
    // 3 sessions: 2 known + 1 try
    expect(selected).toHaveLength(3);
    expect(selected.filter((r) => r.id.startsWith("k-"))).toHaveLength(2);
    expect(selected.filter((r) => r.id.startsWith("t-"))).toHaveLength(1);
  });

  it("is deterministic for a fixed seed", () => {
    const args = {
      known: makeRecipes("k", 10),
      tryList: makeRecipes("t", 10),
      days: 7,
      knownRatio: 0.7,
      defaultLeftoverDays: 1,
      excludeIds: new Set<string>(),
    };
    const a = selectRecipes({ ...args, rng: mulberry32(99) }).map((r) => r.id);
    const b = selectRecipes({ ...args, rng: mulberry32(99) }).map((r) => r.id);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/meal-plan/selection.test.ts`
Expected: FAIL — cannot find module `./selection`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/meal-plan/selection.ts`:
```ts
import { type Rng, sample } from "../rng";

export interface SelectableRecipe {
  id: string;
  ingredientIds: number[];
}

/** Round half to even, matching Python's built-in round(). */
function bankersRound(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac < 0.5) return floor;
  if (frac > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function computeSessionCounts(
  days: number,
  defaultLeftoverDays: number,
  knownRatio: number,
): { cookingSessions: number; knownCount: number; tryCount: number } {
  const cookingSessions = Math.max(Math.floor(days / (1 + defaultLeftoverDays)), 1);
  const knownCount = bankersRound(cookingSessions * knownRatio);
  const tryCount = cookingSessions - knownCount;
  return { cookingSessions, knownCount, tryCount };
}

export function ingredientOverlapScore(recipes: SelectableRecipe[]): number {
  const counts = new Map<number, number>();
  for (const recipe of recipes) {
    for (const ingId of new Set(recipe.ingredientIds)) {
      counts.set(ingId, (counts.get(ingId) ?? 0) + 1);
    }
  }
  let score = 0;
  for (const count of counts.values()) if (count > 1) score += count;
  return score;
}

export function filterPools(
  known: SelectableRecipe[],
  tryList: SelectableRecipe[],
  knownCount: number,
  tryCount: number,
  excludeIds: Set<string>,
): { known: SelectableRecipe[]; tryList: SelectableRecipe[] } {
  if (excludeIds.size === 0) return { known, tryList };

  let knownFiltered = known.filter((r) => !excludeIds.has(r.id));
  let tryFiltered = tryList.filter((r) => !excludeIds.has(r.id));
  if (knownFiltered.length < knownCount) knownFiltered = known;
  if (tryFiltered.length < tryCount) tryFiltered = tryList;
  return { known: knownFiltered, tryList: tryFiltered };
}

export function selectRecipesWithOverlap(
  known: SelectableRecipe[],
  tryList: SelectableRecipe[],
  knownCount: number,
  tryCount: number,
  rng: Rng,
  candidates = 50,
): SelectableRecipe[] {
  let bestScore = -1;
  let bestSet: SelectableRecipe[] = [];
  for (let i = 0; i < candidates; i++) {
    const selectedKnown = sample(rng, known, Math.min(knownCount, known.length));
    const selectedTry = sample(rng, tryList, Math.min(tryCount, tryList.length));
    const selected = [...selectedKnown, ...selectedTry];
    const score = ingredientOverlapScore(selected);
    if (score > bestScore) {
      bestScore = score;
      bestSet = selected;
    }
  }
  return bestSet;
}

export function selectRecipes(opts: {
  known: SelectableRecipe[];
  tryList: SelectableRecipe[];
  days: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  excludeIds: Set<string>;
  rng: Rng;
}): SelectableRecipe[] {
  const { knownCount, tryCount } = computeSessionCounts(
    opts.days,
    opts.defaultLeftoverDays,
    opts.knownRatio,
  );
  const pools = filterPools(opts.known, opts.tryList, knownCount, tryCount, opts.excludeIds);
  return selectRecipesWithOverlap(pools.known, pools.tryList, knownCount, tryCount, opts.rng);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/meal-plan/selection.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/domain/meal-plan/selection.ts web/lib/domain/meal-plan/selection.test.ts
git commit -m "feat: port meal-plan recipe selection to domain layer"
```

---

### Task 10: Leftover scheduling (`assignSchedule`)

Port of `_assign_schedule_lunch_only` (backend: `planner/services.py:212-297`). Returns planned entries instead of writing DB rows; the cooking entry a leftover derives from is identified by its `sourceDate` (the cook date), which future wiring resolves to a real entry id.

**Files:**
- Create: `web/lib/domain/meal-plan/schedule.ts`
- Test: `web/lib/domain/meal-plan/schedule.test.ts`

**Interfaces:**
- Consumes: `Rng`, `shuffle` from `../rng`; `addDays`, `daysBetween` from `../dates`.
- Produces:
  - `interface ScheduleRecipe { id: string; leftoverDays: number | null }`
  - `interface PlannedEntry { date: string; recipeId: string; servings: number; isLeftover: boolean; sourceDate: string | null }` — `mealType` is always LUNCH (omitted; the caller stamps it). `sourceDate` is the cook date for leftovers, `null` for cooking entries.
  - `assignSchedule(opts: { recipes: ScheduleRecipe[]; fallbackRecipes: ScheduleRecipe[]; startDate: string; days: number; servings: number; defaultLeftoverDays: number; rng: Rng }): PlannedEntry[]` — assigns cooking entries to the earliest free dates, spreads leftovers 2+ days after cooking and 2+ days apart, then fills any remaining dates from `fallbackRecipes` (cycled). `fallbackRecipes` is what the Python code queries (household recipes minus the selected set, or all if that is empty) — the caller supplies it.

- [ ] **Step 1: Write the failing test**

Create `web/lib/domain/meal-plan/schedule.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { daysBetween } from "../dates";
import { mulberry32 } from "../rng";
import { assignSchedule, type ScheduleRecipe } from "./schedule";

function recipes(n: number, leftoverDays: number | null): ScheduleRecipe[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r-${i}`, leftoverDays }));
}

const START = "2026-03-02"; // Monday

describe("assignSchedule", () => {
  it("fills every day in the iteration", () => {
    const entries = assignSchedule({
      recipes: recipes(5, 1),
      fallbackRecipes: recipes(5, 1),
      startDate: START,
      days: 7,
      servings: 2,
      defaultLeftoverDays: 1,
      rng: mulberry32(1),
    });
    const dates = new Set(entries.map((e) => e.date));
    expect(dates.size).toBe(7);
  });

  it("places every leftover 2+ days after its cooking entry", () => {
    const entries = assignSchedule({
      recipes: recipes(4, 2),
      fallbackRecipes: recipes(4, 2),
      startDate: START,
      days: 14,
      servings: 2,
      defaultLeftoverDays: 1,
      rng: mulberry32(2),
    });
    for (const e of entries) {
      if (e.isLeftover) {
        expect(e.sourceDate).not.toBeNull();
        expect(daysBetween(e.sourceDate!, e.date)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("produces no leftovers when leftover_days is 0", () => {
    const entries = assignSchedule({
      recipes: recipes(8, 0),
      fallbackRecipes: recipes(8, 0),
      startDate: START,
      days: 7,
      servings: 2,
      defaultLeftoverDays: 1,
      rng: mulberry32(3),
    });
    expect(entries.filter((e) => e.isLeftover)).toHaveLength(0);
  });

  it("uses default_leftover_days when a recipe's leftover_days is null", () => {
    const entries = assignSchedule({
      recipes: recipes(5, null),
      fallbackRecipes: recipes(5, null),
      startDate: START,
      days: 14,
      servings: 2,
      defaultLeftoverDays: 2,
      rng: mulberry32(4),
    });
    // Each cooking entry yields at most defaultLeftoverDays (2) leftovers.
    const cookDates = entries.filter((e) => !e.isLeftover).map((e) => e.date);
    for (const cookDate of cookDates) {
      const count = entries.filter((e) => e.isLeftover && e.sourceDate === cookDate).length;
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const args = {
      recipes: recipes(5, 1),
      fallbackRecipes: recipes(5, 1),
      startDate: START,
      days: 7,
      servings: 2,
      defaultLeftoverDays: 1,
    };
    const a = assignSchedule({ ...args, rng: mulberry32(7) });
    const b = assignSchedule({ ...args, rng: mulberry32(7) });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/domain/meal-plan/schedule.test.ts`
Expected: FAIL — cannot find module `./schedule`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/domain/meal-plan/schedule.ts`:
```ts
import { addDays, daysBetween } from "../dates";
import { type Rng, shuffle } from "../rng";

export interface ScheduleRecipe {
  id: string;
  leftoverDays: number | null;
}

export interface PlannedEntry {
  date: string;
  recipeId: string;
  servings: number;
  isLeftover: boolean;
  sourceDate: string | null;
}

/**
 * Assign recipes to LUNCH slots, spreading leftovers non-consecutively.
 * Port of planner/services.py _assign_schedule_lunch_only.
 */
export function assignSchedule(opts: {
  recipes: ScheduleRecipe[];
  fallbackRecipes: ScheduleRecipe[];
  startDate: string;
  days: number;
  servings: number;
  defaultLeftoverDays: number;
  rng: Rng;
}): PlannedEntry[] {
  const { startDate, days, servings, defaultLeftoverDays, rng } = opts;
  const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i));
  const assigned = new Set<string>();
  const entries: PlannedEntry[] = [];

  const recipes = shuffle(rng, opts.recipes);

  for (const recipe of recipes) {
    const leftoverCount = recipe.leftoverDays ?? defaultLeftoverDays;

    // Find the first free date for cooking.
    const cookDate = dates.find((d) => !assigned.has(d));
    if (cookDate === undefined) break;

    entries.push({
      date: cookDate,
      recipeId: recipe.id,
      servings,
      isLeftover: false,
      sourceDate: null,
    });
    assigned.add(cookDate);

    // Place leftovers: 2+ days after cooking, 2+ days apart.
    let placed = 0;
    let lastPlaced = cookDate;
    for (const d of dates) {
      if (placed >= leftoverCount) break;
      if (assigned.has(d)) continue;
      if (daysBetween(cookDate, d) < 2) continue;
      if (daysBetween(lastPlaced, d) < 2) continue;
      entries.push({
        date: d,
        recipeId: recipe.id,
        servings,
        isLeftover: true,
        sourceDate: cookDate,
      });
      assigned.add(d);
      lastPlaced = d;
      placed += 1;
    }
  }

  // Fill remaining dates with fallback recipes.
  const emptyDates = dates.filter((d) => !assigned.has(d));
  if (emptyDates.length > 0) {
    const pool = shuffle(rng, opts.fallbackRecipes);
    if (pool.length > 0) {
      const repeats = Math.floor(emptyDates.length / pool.length) + 1;
      const cycle: ScheduleRecipe[] = [];
      for (let i = 0; i < repeats; i++) cycle.push(...pool);
      emptyDates.forEach((d, i) => {
        if (i < cycle.length) {
          entries.push({
            date: d,
            recipeId: cycle[i].id,
            servings,
            isLeftover: false,
            sourceDate: null,
          });
        }
      });
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/domain/meal-plan/schedule.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the entire domain test suite**

Run: `cd web && npx vitest run lib/domain`
Expected: all tests across Tasks 1-10 pass.

- [ ] **Step 6: Commit**

```bash
git add web/lib/domain/meal-plan/schedule.ts web/lib/domain/meal-plan/schedule.test.ts
git commit -m "feat: port leftover scheduling to domain layer"
```

---

## Self-Review

**1. Spec coverage (Plan 2 portion — `lib/domain` port, test-driven):**
- `lib/domain/shopping/` aggregation + unit conversion (decimal.js) → Tasks 3, 5. ✓
- `lib/domain/recipes/` scaling + validation → Tasks 4, 6, 7. ✓
- `lib/domain/meal-plan/` selection + scheduling algorithm → Tasks 8, 9, 10. ✓
- "A quantity must never touch a JS number" → all quantity math via `decimal.js` from strings (Tasks 3-5, 7); enforced by Global Constraints. ✓
- "ported and unit-tested in isolation against the existing Python test cases before being wired into any page" → every task is pure + Vitest, no DB/Next imports; tests mirror the Python test vectors (`test_generation.py`, `test_services.py`, `test_programs.py`, `test_iteration_utils.py`, `test_generator.py`). ✓
- Decimal precision risk (shopping aggregation) mitigated → banker's rounding config (Task 1) + decimal tests (Tasks 1, 5, 7). ✓
- Meal-plan algorithm fidelity risk → Python tests ported (Tasks 8-10). ✓

**2. Placeholder scan:** No TBD/TODO placeholders; every code step shows full file content. ✓

**3. Type consistency:** `DomainUnit` defined in `shopping/units.ts` (Task 3) and consumed by `shopping/aggregate.ts` (Task 5). `Rng` defined in `rng.ts` (Task 2), consumed by `selection.ts` (Task 9) and `schedule.ts` (Task 10). `addDays`/`weekday`/`daysBetween` defined in `dates.ts` (Task 8) and consumed by `iteration-dates.ts` (Task 8) and `schedule.ts` (Task 10). `scaleFactor` defined in `recipes/scaling.ts` (Task 4) and consumed by `shopping/aggregate.ts` (Task 5). `SelectableRecipe`/`ScheduleRecipe` are distinct types (selection needs `ingredientIds`; scheduling needs `leftoverDays`) — intentional, documented in their Interfaces blocks. ✓

**Intentional fidelity decisions (not gaps):**
- **Randomness:** Python uses unseeded `random`; the port injects an `Rng` (Task 2) so tests are deterministic. Exact selection output need not match Python (it is non-deterministic in prod); tests assert counts, ratios, and structural constraints, plus same-seed reproducibility.
- **DB/query filtering excluded:** Household scoping and excluded-tag filtering in `_select_recipes` are DB concerns deferred to the wiring plan (read-pages / server-actions). The pure core takes pre-filtered pools. `filterPools` covers only the previous-iteration `exclude_ids` logic, which is pure.
- **`fallbackRecipes` passed in:** `_assign_schedule_lunch_only` queries the DB for fill-in recipes; the port takes them as a parameter (the caller runs the query). Faithful to the algorithm, free of DB coupling.
- **`mealType` omitted from `PlannedEntry`:** always `"LUNCH"` in current code; the caller stamps it when persisting (avoids hard-coding a literal that belongs to the persistence layer).
- **Validators return errors instead of raising HttpError:** `validateProgramStep` already returns `string[]` in Python; `validateStepIngredientTotals` is changed from raising `HttpError(422)` to returning `string[]` for framework-freedom — the route handler raises in the wiring plan.

**Known follow-ups for later plans (not gaps in this plan):**
- Wiring these pure functions to Drizzle rows + server actions/route handlers → read-pages and mutations plans.
- The Map insertion-order guarantee in `aggregateShoppingItems` matches Python dict ordering; if the wiring needs a stable display sort (Django sorts items by `ingredient__category, ingredient__name_en`), that sort is applied at the query/render layer, not here.
