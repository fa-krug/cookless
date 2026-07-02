import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cookless-route-"));
  process.env.MEDIA_ROOT = dir;
});
afterEach(() => {
  delete process.env.MEDIA_ROOT;
  rmSync(dir, { recursive: true, force: true });
});

async function makeWebp(): Promise<Buffer> {
  return sharp({ create: { width: 1024, height: 768, channels: 3, background: "blue" } })
    .webp({ quality: 85 })
    .toBuffer();
}

describe("GET /api/images/[...path]", () => {
  it("returns 404 for missing image", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/images/nope.webp");
    const res = await GET(req, { params: Promise.resolve({ path: ["nope.webp"] }) });
    expect(res.status).toBe(404);
  });

  it("serves the stored image", async () => {
    const { writeRecipeImage } = await import("@/lib/images/storage");
    const { GET } = await import("./route");
    const webp = await makeWebp();
    const rel = writeRecipeImage("r1", webp, new Date(1000));
    const req = new Request(`http://localhost/api/images/${rel}`);
    const res = await GET(req, { params: Promise.resolve({ path: rel.split("/") }) });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(webp.length);
  });

  it("sets correct headers", async () => {
    const { writeRecipeImage } = await import("@/lib/images/storage");
    const { GET } = await import("./route");
    const rel = writeRecipeImage("r5", await makeWebp(), new Date(5000));
    const req = new Request(`http://localhost/api/images/${rel}`);
    const res = await GET(req, { params: Promise.resolve({ path: rel.split("/") }) });
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });
});
