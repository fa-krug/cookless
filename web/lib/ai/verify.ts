import { modelsListUrl } from "./config";

export async function verifyGeminiKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"valid" | "invalid" | "unreachable"> {
  try {
    const res = await fetchImpl(modelsListUrl(), {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
    });
    if (res.status === 200) return "valid";
    if (res.status === 400 || res.status === 401 || res.status === 403) return "invalid";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}
