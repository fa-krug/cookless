/** Lowercase + strip combining diacritics so "Püree" matches "puree". */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Relevance score of `needle` against `haystack`. 0 = no match.
 * Tiers: exact 4, prefix 3, substring 2, in-order subsequence 1.
 */
export function fuzzyScore(haystack: string, needle: string): number {
  const n = normalizeForSearch(needle.trim());
  if (n === "") return 0;
  const h = normalizeForSearch(haystack);
  if (h === n) return 4;
  if (h.startsWith(n)) return 3;
  if (h.includes(n)) return 2;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return 1;
  }
  return 0;
}
