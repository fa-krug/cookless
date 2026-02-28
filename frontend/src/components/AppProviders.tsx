import { useState } from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { AuthProvider } from "../contexts/AuthContext";

export default function AppProviders({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } },
    mutationCache: new MutationCache({
      onError: (_error, _variables, _context, mutation) => {
        if (!mutation.options.onError) {
          toast.error(t("common.error"));
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
