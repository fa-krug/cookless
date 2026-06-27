import { Decimal } from "@/lib/domain/decimal";

export function formatQuantity(quantity: string): string {
  // Normalize then strip trailing zeros / trailing dot.
  return new Decimal(quantity).toDecimalPlaces(2).toString();
}

export function pickName(locale: string, row: { nameEn: string; nameDe: string }): string {
  return locale === "de" ? row.nameDe : row.nameEn;
}

export function recipeImageUrl(image: string): string | null {
  if (!image) return null;
  return `/api/images/${image}`;
}

export const CATEGORY_ORDER = ["PRODUCE", "DAIRY", "MEAT", "PANTRY", "FROZEN", "OTHER"] as const;

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
