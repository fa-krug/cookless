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
