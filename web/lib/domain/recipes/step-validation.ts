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
