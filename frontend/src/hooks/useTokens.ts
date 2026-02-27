import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AccessToken, AccessTokenCreated } from "../api/types";
import { queryKeys } from "./queryKeys";

export function useTokens() {
  return useQuery<AccessToken[]>({
    queryKey: queryKeys.tokens,
    queryFn: () => api.get<AccessToken[]>("/api/v1/users/me/tokens/"),
  });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      scopes: string[];
      expires_at?: string | null;
      duration_preset?: string | null;
    }) => api.post<AccessTokenCreated>("/api/v1/users/me/tokens/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
    },
  });
}

export function useDeleteToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/me/tokens/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
    },
  });
}
