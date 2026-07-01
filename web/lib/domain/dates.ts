const MS_PER_DAY = 86_400_000;

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return toISO(date);
}

/** Monday=0 .. Sunday=6, matching Python's date.weekday(). */
export function weekday(iso: string): number {
  return (parseISO(iso).getUTCDay() + 6) % 7;
}

/** Whole-day difference b - a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_PER_DAY);
}
