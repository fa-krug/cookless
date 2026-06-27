import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import sharp from "sharp";
import { mediaRoot } from "./config";

/** Resize longest side to <=1024 (never enlarge) and encode WebP q85 — matches Pillow `_save_image_as_webp`. */
export async function processToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

/** Write a processed image and return its path relative to the media root. */
export function writeRecipeImage(recipeId: string, webp: Buffer, now: Date): string {
  const rel = `recipes/${recipeId}_${now.getTime()}.webp`;
  const abs = join(mediaRoot(), rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, webp);
  return rel;
}

/** Resolve a relative media path to an absolute path inside the media root, or null if it escapes. */
export function resolveMediaPath(relativePath: string): string | null {
  if (!relativePath) return null;
  const root = mediaRoot();
  const abs = resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export function deleteImageFile(relativePath: string): void {
  const abs = resolveMediaPath(relativePath);
  if (abs && existsSync(abs)) rmSync(abs);
}

export function readImage(relativePath: string): Buffer | null {
  const abs = resolveMediaPath(relativePath);
  if (!abs || !existsSync(abs)) return null;
  return readFileSync(abs);
}
