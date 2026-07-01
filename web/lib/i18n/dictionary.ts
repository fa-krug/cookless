import en from "./locales/en.json";
import de from "./locales/de.json";
import type { Locale } from "./config";
import type { Dictionary } from "./translate";

const dictionaries: Record<Locale, Dictionary> = {
  en: en as Dictionary,
  de: de as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
