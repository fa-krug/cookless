import { createContext } from "react";

export type ToastType = "error" | "success";

export interface ToastContextValue {
  addToast: (message: string, type: ToastType) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
