import { useEffect, useRef } from "react";

/**
 * Returns a ref to attach to a container with `<details>` elements.
 * Clicking outside any open `<details>` within that container will close it.
 */
export function useCloseDetailsOnClickOutside<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const container = ref.current;
      if (!container) return;
      const openDetails = container.querySelectorAll("details[open]");
      openDetails.forEach((details) => {
        if (!details.contains(e.target as Node)) {
          details.removeAttribute("open");
        }
      });
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return ref;
}
