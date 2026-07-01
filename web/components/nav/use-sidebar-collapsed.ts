"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "sidebar-collapsed";

function read() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  }, []);
  return { collapsed, toggle };
}
