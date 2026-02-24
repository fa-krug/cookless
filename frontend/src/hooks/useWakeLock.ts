import { useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!("wakeLock" in navigator)) {
      return;
    }

    let released = false;

    async function requestWakeLock() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (released) {
          sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setIsActive(true);

        sentinel.addEventListener("release", () => {
          setIsActive(false);
          wakeLockRef.current = null;
        });
      } catch {
        setIsActive(false);
      }
    }

    requestWakeLock();

    // Re-acquire wake lock when page becomes visible again
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !released) {
        requestWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, []);

  return { isActive };
}
