import { useCallback, useRef, useState } from "react";

/**
 * Tracks whether each <details> in a list should open upward.
 * Call `getProps(key)` to get the ref callback and onToggle for each element.
 */
export function useDropUp(margin = 200) {
  const refs = useRef<Map<string, HTMLDetailsElement>>(new Map());
  const [openUpSet, setOpenUpSet] = useState<Set<string>>(new Set());

  const getProps = useCallback(
    (key: string) => ({
      ref: (el: HTMLDetailsElement | null) => {
        if (el) refs.current.set(key, el);
        else refs.current.delete(key);
      },
      onToggle: () => {
        const el = refs.current.get(key);
        if (!el || !el.open) return;
        const rect = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUpSet((prev) => {
          const next = new Set(prev);
          if (spaceBelow < margin) next.add(key);
          else next.delete(key);
          return next;
        });
      },
      openUp: openUpSet.has(key),
    }),
    [margin, openUpSet],
  );

  return getProps;
}
