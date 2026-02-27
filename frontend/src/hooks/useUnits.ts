import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Unit } from "../api/types";
import { queryKeys } from "./queryKeys";

export function useUnits() {
  return useQuery<Unit[]>({
    queryKey: queryKeys.units,
    queryFn: () => api.get<Unit[]>("/api/v1/units/"),
    staleTime: Infinity,
  });
}
