import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Unit } from "../api/types";

export function useUnits() {
  return useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get<Unit[]>("/api/v1/units/"),
  });
}
