import { defaultLocale, isLocale, type Locale } from "./config";

// Candidates in priority order; first supported one wins.
export function pickLocale(candidates: (string | null | undefined)[]): Locale {
  for (const c of candidates) {
    if (isLocale(c)) return c;
    const base = c?.split("-")[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
