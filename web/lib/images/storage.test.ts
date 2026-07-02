import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-img-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

async function bigPng(): Promise<Buffer> {
  return sharp({ create: { width: 2000, height: 1500, channels: 3, background: "red" } })
    .png()
    .toBuffer();
}

describe("processToWebp", () => {
  it("downscales longest side to <=1024 and outputs webp", async () => {
    const { processToWebp } = await import("./storage");
    const out = await processToWebp(await bigPng());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
  });

  it("does not enlarge small images", async () => {
    const { processToWebp } = await import("./storage");
    const small = await sharp({ create: { width: 50, height: 50, channels: 3, background: "blue" } })
      .png()
      .toBuffer();
    const meta = await sharp(await processToWebp(small)).metadata();
    expect(meta.width).toBe(50);
  });
});

describe("write / read / delete", () => {
  it("writes a relative recipes/<id>_<ts>.webp path and reads it back", async () => {
    const { processToWebp, writeRecipeImage, readImage } = await import("./storage");
    const webp = await processToWebp(await bigPng());
    const now = new Date("2026-06-27T12:00:00Z");
    const rel = writeRecipeImage("rid", webp, now);
    expect(rel).toBe(`recipes/rid_${now.getTime()}.webp`);
    expect(readImage(rel)).not.toBeNull();
  });

  it("deleteImageFile removes the file and tolerates empty/missing", async () => {
    const { processToWebp, writeRecipeImage, deleteImageFile, resolveMediaPath } = await import("./storage");
    const rel = writeRecipeImage("rid", await processToWebp(await bigPng()), new Date(1000));
    expect(existsSync(resolveMediaPath(rel)!)).toBe(true);
    deleteImageFile(rel);
    expect(existsSync(resolveMediaPath(rel)!)).toBe(false);
    expect(() => deleteImageFile("")).not.toThrow();
    expect(() => deleteImageFile("recipes/nope.webp")).not.toThrow();
  });

  it("resolveMediaPath blocks path traversal", async () => {
    const { resolveMediaPath } = await import("./storage");
    expect(resolveMediaPath("../../etc/passwd")).toBeNull();
    expect(resolveMediaPath("recipes/ok.webp")).not.toBeNull();
  });
});
