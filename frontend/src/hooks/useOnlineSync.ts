import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Listens for the browser coming back online and triggers replay of
 * pending shopping-list toggles stored in the service worker's IndexedDB.
 * Also listens for the SW's SYNC_COMPLETE message to invalidate queries.
 */
export function useOnlineSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleOnline() {
      navigator.serviceWorker?.controller?.postMessage({ type: "REPLAY_PENDING" });
    }

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "SYNC_COMPLETE") {
        queryClient.invalidateQueries({ queryKey: ["shopping-lists"] });
      }
    }

    window.addEventListener("online", handleOnline);
    navigator.serviceWorker?.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, [queryClient]);
}
