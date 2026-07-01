import { type Rng, sample } from "../rng";

export interface SelectableRecipe {
  id: string;
  ingredientIds: number[];
}

/** Round half to even, matching Python's built-in round(). */
function bankersRound(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac < 0.5) return floor;
  if (frac > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function computeSessionCounts(
  days: number,
  defaultLeftoverDays: number,
  knownRatio: number,
): { cookingSessions: number; knownCount: number; tryCount: number } {
  const cookingSessions = Math.max(Math.floor(days / (1 + defaultLeftoverDays)), 1);
  const knownCount = bankersRound(cookingSessions * knownRatio);
  const tryCount = cookingSessions - knownCount;
  return { cookingSessions, knownCount, tryCount };
}

export function ingredientOverlapScore(recipes: SelectableRecipe[]): number {
  const counts = new Map<number, number>();
  for (const recipe of recipes) {
    for (const ingId of new Set(recipe.ingredientIds)) {
      counts.set(ingId, (counts.get(ingId) ?? 0) + 1);
    }
  }
  let score = 0;
  for (const count of counts.values()) if (count > 1) score += count;
  return score;
}

export function filterPools(
  known: SelectableRecipe[],
  tryList: SelectableRecipe[],
  knownCount: number,
  tryCount: number,
  excludeIds: Set<string>,
): { known: SelectableRecipe[]; tryList: SelectableRecipe[] } {
  if (excludeIds.size === 0) return { known, tryList };

  let knownFiltered = known.filter((r) => !excludeIds.has(r.id));
  let tryFiltered = tryList.filter((r) => !excludeIds.has(r.id));
  if (knownFiltered.length < knownCount) knownFiltered = known;
  if (tryFiltered.length < tryCount) tryFiltered = tryList;
  return { known: knownFiltered, tryList: tryFiltered };
}

export function selectRecipesWithOverlap(
  known: SelectableRecipe[],
  tryList: SelectableRecipe[],
  knownCount: number,
  tryCount: number,
  rng: Rng,
  candidates = 50,
): SelectableRecipe[] {
  let bestScore = -1;
  let bestSet: SelectableRecipe[] = [];
  for (let i = 0; i < candidates; i++) {
    const selectedKnown = sample(rng, known, Math.min(knownCount, known.length));
    const selectedTry = sample(rng, tryList, Math.min(tryCount, tryList.length));
    const selected = [...selectedKnown, ...selectedTry];
    const score = ingredientOverlapScore(selected);
    if (score > bestScore) {
      bestScore = score;
      bestSet = selected;
    }
  }
  return bestSet;
}

export function selectRecipes(opts: {
  known: SelectableRecipe[];
  tryList: SelectableRecipe[];
  days: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  excludeIds: Set<string>;
  rng: Rng;
}): SelectableRecipe[] {
  const { knownCount, tryCount } = computeSessionCounts(
    opts.days,
    opts.defaultLeftoverDays,
    opts.knownRatio,
  );
  const pools = filterPools(opts.known, opts.tryList, knownCount, tryCount, opts.excludeIds);
  return selectRecipesWithOverlap(pools.known, pools.tryList, knownCount, tryCount, opts.rng);
}
