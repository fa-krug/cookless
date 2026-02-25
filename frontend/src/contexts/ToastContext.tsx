import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { ToastContext } from "./toastContextValue";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "error" | "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            onClick={() => removeToast(toast.id)}
            className={`pointer-events-auto animate-slide-down cursor-pointer rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
