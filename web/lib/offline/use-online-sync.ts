"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { drainQueue } from "./sync";
import { count } from "./queue";

/**
 * Drains the offline op queue on mount and whenever the browser comes back
 * online, then refreshes the current route so the RSC reflects server truth.
 * Exposes coarse online/syncing flags for the offline indicator.
 */
export function useOnlineSync(): { online: boolean; syncing: boolean } {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    if ((await count()) === 0) return;
    setSyncing(true);
    const { drained, remaining } = await drainQueue();
    if (drained > 0 && remaining === 0) router.refresh();
    setSyncing(false);
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);

    function handleOnline() {
      setOnline(true);
      void sync();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void sync(); // replay anything left from a previous session

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync]);

  return { online, syncing };
}
