import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
import type { GroupedTags, Tag, TagCreatePayload, TagUpdatePayload } from "../api/types";
import { queryKeys } from "./queryKeys";

export function useTags() {
  return useQuery<GroupedTags>({
    queryKey: queryKeys.tags,
    queryFn: () => api.get("/api/v1/tags/"),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation<Tag, Error, TagCreatePayload>({
    mutationFn: (payload) => api.post("/api/v1/tags/", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation<Tag, Error, { id: string; payload: TagUpdatePayload }>({
    mutationFn: ({ id, payload }) => api.put(`/api/v1/tags/${id}/`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/api/v1/tags/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
    },
  });
}

export function useResetTags() {
  const queryClient = useQueryClient();
  return useMutation<GroupedTags, Error, void>({
    mutationFn: () => api.post("/api/v1/tags/reset/"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
    },
  });
}
