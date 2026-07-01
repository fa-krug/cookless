// web/lib/recipes/pending-delete.ts
// Module-scoped registry of deferred deletions. This intentionally lives outside
// React so a scheduled delete survives component unmount / route navigation during
// the undo window (a component-local setTimeout would be cancelled on unmount).

const DEFAULT_DELAY_MS = 5000;

const registry = new Map<string, ReturnType<typeof setTimeout>>();

export function schedulePendingDelete(
  id: string,
  run: () => void | Promise<void>,
  delayMs: number = DEFAULT_DELAY_MS,
): void {
  const existing = registry.get(id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    registry.delete(id);
    void run();
  }, delayMs);
  registry.set(id, timer);
}

export function cancelPendingDelete(id: string): void {
  const existing = registry.get(id);
  if (!existing) return;
  clearTimeout(existing);
  registry.delete(id);
}

export function isPending(id: string): boolean {
  return registry.has(id);
}
