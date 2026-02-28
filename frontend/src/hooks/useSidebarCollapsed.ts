import { useCallback, useSyncExternalStore } from "react";

const KEY = "cookless-sidebar-collapsed";

function getSnapshot(): boolean {
  return localStorage.getItem(KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("sidebar-toggle", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("sidebar-toggle", callback);
  };
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    localStorage.setItem(KEY, String(next));
    window.dispatchEvent(new Event("sidebar-toggle"));
  }, []);

  return { collapsed, toggle };
}
