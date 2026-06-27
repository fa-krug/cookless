import { resolve } from "node:path";

/** Absolute media root. Recipe images live under `<mediaRoot>/recipes/`. */
export function mediaRoot(): string {
  return resolve(process.env.MEDIA_ROOT ?? "data/media");
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (parity with Django)
export const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
