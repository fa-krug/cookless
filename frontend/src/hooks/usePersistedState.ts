import { useCallback, useSyncExternalStore } from "react";

const EVENT = "persisted-state-change";

function makeEvent(key: string) {
  return new CustomEvent(EVENT, { detail: key });
}

export function usePersistedState<T extends string>(
  key: string,
  defaultValue: T,
  validate: (value: string | null) => value is T,
): [T, (value: T) => void] {
  const getSnapshot = (): T => {
    const raw = localStorage.getItem(key);
    return validate(raw) ? raw : defaultValue;
  };

  const getServerSnapshot = (): T => defaultValue;

  const subscribe = (callback: () => void): (() => void) => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) callback();
    };
    const handleCustom = (e: Event) => {
      if ((e as CustomEvent).detail === key) callback();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(EVENT, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(EVENT, handleCustom);
    };
  };

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // localStorage unavailable
      }
      window.dispatchEvent(makeEvent(key));
    },
    [key],
  );

  return [value, setValue];
}
