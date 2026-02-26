import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type {
  BulkCreatePayload,
  BulkCreateResponse,
  GenerateRecipesPayload,
  GenerateStreamEvent,
} from "../api/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : "";
}

export async function streamGenerateRecipes(
  payload: GenerateRecipesPayload,
  onEvent: (event: GenerateStreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/v1/recipes/generate/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed: GenerateStreamEvent = JSON.parse(trimmed);
      onEvent(parsed);
    }
  }

  // Process any remaining data in the buffer
  const trimmed = buffer.trim();
  if (trimmed) {
    const parsed: GenerateStreamEvent = JSON.parse(trimmed);
    onEvent(parsed);
  }
}

export function useBulkCreateRecipes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkCreatePayload) =>
      api.post<BulkCreateResponse>("/api/v1/recipes/bulk-create/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
