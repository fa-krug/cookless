import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Household, Invite, MessageOut } from "../api/types";

export function useHouseholds() {
  return useQuery<Household[]>({
    queryKey: ["households"],
    queryFn: () => api.get<Household[]>("/api/v1/households/"),
  });
}

export function useCreateHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      api.post<Household>("/api/v1/households/", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useSwitchHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<MessageOut>(`/api/v1/households/${id}/switch/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: (householdId: string) =>
      api.post<Invite>(`/api/v1/households/${householdId}/invites/`),
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) =>
      api.post<MessageOut>(`/api/v1/invites/${code}/accept/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ householdId, memberId }: { householdId: string; memberId: number }) =>
      api.delete(`/api/v1/households/${householdId}/members/${memberId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useUpdateHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Household>(`/api/v1/households/${id}/`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useDeleteHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/households/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useLeaveHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<MessageOut>(`/api/v1/households/${id}/leave/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useTransferOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      householdId,
      memberId,
    }: {
      householdId: string;
      memberId: number;
    }) =>
      api.post<MessageOut>(
        `/api/v1/households/${householdId}/members/${memberId}/transfer-ownership/`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}
