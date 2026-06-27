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
