import { useState } from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { AuthProvider } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";

export default function AppProviders({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { addToast } = useToast();

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } },
    mutationCache: new MutationCache({
      onError: (_error, _variables, _context, mutation) => {
        if (!mutation.options.onError) {
          addToast(t("common.error"), "error");
        }
      },
    }),
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
