import { useEffect, useRef, useState } from "react";

export function useWakeLock(enabled: boolean): { active: boolean } {
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let released = false;

    async function request() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (released) {
          sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener("release", () => {
          setActive(false);
          sentinelRef.current = null;
        });
      } catch {
        setActive(false);
      }
    }

    request();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !released) {
        request();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinelRef.current) {
        sentinelRef.current.release();
        sentinelRef.current = null;
      }
      setActive(false);
    };
  }, [enabled]);

  return { active };
}
