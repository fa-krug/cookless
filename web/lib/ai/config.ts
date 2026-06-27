// Newer Gemini models (Plan 7 decision 2026-06-27). Imagen :predict is retired — image
// generation uses the Gemini image model via :generateContent. Bump these IDs here when needed.
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const textGenerateUrl = (): string => `${BASE}/${GEMINI_TEXT_MODEL}:generateContent`;
export const imageGenerateUrl = (): string => `${BASE}/${GEMINI_IMAGE_MODEL}:generateContent`;

export const TEXT_TIMEOUT_MS = 60_000;
export const IMAGE_TIMEOUT_MS = 30_000;
