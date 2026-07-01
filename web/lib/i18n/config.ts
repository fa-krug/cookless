export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(x: string | null | undefined): x is Locale {
  return x != null && (locales as readonly string[]).includes(x);
}
