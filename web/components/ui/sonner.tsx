"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme/use-theme";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return <Sonner theme={theme} richColors {...props} />;
}

export { toast } from "sonner";
