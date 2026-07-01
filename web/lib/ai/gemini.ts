import { AuthError } from "@/lib/auth/errors";
import {
  IMAGE_TIMEOUT_MS,
  TEXT_TIMEOUT_MS,
  imageGenerateUrl,
  textGenerateUrl,
} from "./config";

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new AuthError(502, "Gemini request failed");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AuthError(502, `Gemini request failed: ${res.status}`);
  return res.json();
}

/** Returns the parsed JSON array of recipe objects from Gemini text generation. */
export async function callGeminiText(apiKey: string, prompt: string): Promise<unknown[]> {
  const data = (await postJson(
    textGenerateUrl(),
    apiKey,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } },
    TEXT_TIMEOUT_MS,
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new AuthError(502, "Gemini returned no content");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AuthError(502, "Gemini response was not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new AuthError(502, "Gemini response is not a JSON array");
  return parsed;
}

/** Returns raw image bytes from the Gemini image model. */
export async function generateGeminiImage(apiKey: string, prompt: string): Promise<Buffer> {
  const data = (await postJson(
    imageGenerateUrl(),
    apiKey,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["Image"] } },
    IMAGE_TIMEOUT_MS,
  )) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new AuthError(502, "Image generation returned no image");
  return Buffer.from(b64, "base64");
}
