import { createContext } from "react";

export type ToastType = "error" | "success";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  duration?: number;
}

export interface ToastContextValue {
  addToast: (message: string, type: ToastType, options?: ToastOptions) => void;
  removeToast: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
