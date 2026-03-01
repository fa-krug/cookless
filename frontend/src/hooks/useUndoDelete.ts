import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface SoftDeleteOptions {
  toastMessage: string;
  undoLabel: string;
  onConfirm: (id: string) => void;
  onUndo?: (id: string) => void;
  delay?: number;
}

export function useUndoDelete() {
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const softDelete = useCallback((id: string, options: SoftDeleteOptions) => {
    const { toastMessage, undoLabel, onConfirm, onUndo, delay = 5000 } = options;

    setPendingDeletes((prev) => new Set(prev).add(id));

    let undone = false;

    toast.success(toastMessage, {
      duration: delay,
      action: {
        label: undoLabel,
        onClick: () => {
          undone = true;
          const timer = timersRef.current.get(id);
          if (timer) clearTimeout(timer);
          timersRef.current.delete(id);
          setPendingDeletes((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          onUndo?.(id);
        },
      },
    });

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!undone) {
        onConfirm(id);
      }
    }, delay);

    timersRef.current.set(id, timer);
  }, []);

  const isPending = useCallback(
    (id: string) => pendingDeletes.has(id),
    [pendingDeletes],
  );

  return { pendingDeletes, softDelete, isPending };
}
