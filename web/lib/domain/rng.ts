export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

/** Mulberry32 PRNG — small, fast, deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** k unique items without replacement. If k >= pop.length, returns all (shuffled). */
export function sample<T>(rng: Rng, pop: readonly T[], k: number): T[] {
  return shuffle(rng, pop).slice(0, Math.min(k, pop.length));
}
