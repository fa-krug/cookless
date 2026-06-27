import Decimal from "decimal.js";

// Match Python's Decimal.quantize default (ROUND_HALF_EVEN / banker's rounding).
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };

/** Round to exactly 2 decimal places using banker's rounding. */
export function quantize2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}
