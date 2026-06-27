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
