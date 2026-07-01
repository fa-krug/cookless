"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "theme";

function read(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const setTheme = useCallback((t: Theme) => {
    window.localStorage.setItem(KEY, t);
    applyTheme(t);
    // Notify same-tab listeners (storage event only fires cross-tab).
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  }, []);
  return { theme, setTheme };
}
