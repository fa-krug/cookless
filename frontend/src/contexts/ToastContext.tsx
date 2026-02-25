import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { ToastContext } from "./toastContextValue";
import type { ToastAction, ToastOptions } from "./toastContextValue";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
  action?: ToastAction;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: "error" | "success", options?: ToastOptions) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, message, type, action: options?.action }]);
      const duration = options?.duration ?? 4000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            onClick={() => !toast.action && removeToast(toast.id)}
            className={`pointer-events-auto animate-slide-down rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.action ? "" : "cursor-pointer"
            } ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.action!.onClick();
                    removeToast(toast.id);
                  }}
                  className="shrink-0 rounded border border-white/40 px-2 py-0.5 text-xs font-semibold text-white hover:bg-white/20"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
