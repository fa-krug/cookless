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
