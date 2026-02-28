import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";

/**
 * Listens for OS color-scheme changes so "system" stays in sync.
 * Must be rendered once near the root of the tree.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    // Apply the stored theme on first render
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);

    // Re-apply when the OS preference changes (only matters for "system")
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (localStorage.getItem("theme") === "system" || !localStorage.getItem("theme")) {
        document.documentElement.classList.toggle("dark", mql.matches);
      }
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // Re-apply whenever theme value changes (user toggle)
  useEffect(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme]);

  return <>{children}</>;
}
