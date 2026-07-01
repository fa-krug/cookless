export function formatQuantity(quantity: string): string {
  // Round to at most 2 decimal places using banker's rounding (half-to-even),
  // matching the prior Decimal.js behaviour without pulling decimal.js into the bundle.
  const scaled = Number(quantity) * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded =
    Math.abs(diff - 0.5) < 1e-10
      ? // Exactly halfway — round to even
        floor % 2 === 0
        ? floor
        : floor + 1
      : Math.round(scaled);
  return String(rounded / 100);
}

export function pickName(locale: string, row: { nameEn: string; nameDe: string }): string {
  return locale === "de" ? row.nameDe : row.nameEn;
}

export function recipeImageUrl(image: string, width?: 128 | 256 | 640 | 1024): string | null {
  if (!image) return null;
  const base = `/api/images/${image}`;
  return width !== undefined ? `${base}?w=${width}` : base;
}

export const CATEGORY_ORDER = ["PRODUCE", "DAIRY", "MEAT", "PANTRY", "FROZEN", "OTHER"] as const;

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
