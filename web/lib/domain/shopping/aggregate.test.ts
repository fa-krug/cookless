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
