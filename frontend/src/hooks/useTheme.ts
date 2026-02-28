import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "theme";
const EVENT = "theme-change";

function getStoredTheme(): Theme {
  const val = localStorage.getItem(KEY);
  if (val === "light" || val === "dark" || val === "system") return val;
  return "system";
}

function getSnapshot(): Theme {
  return getStoredTheme();
}

function getServerSnapshot(): Theme {
  return "system";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, setTheme };
}
