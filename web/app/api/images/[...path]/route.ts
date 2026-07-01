import { readImage, resizeWebp } from "@/lib/images/storage";

const ALLOWED_WIDTHS = new Set([128, 256, 640, 1024]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const relative = path.join("/");
  const bytes = await readImage(relative);
  if (!bytes) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const wParam = url.searchParams.get("w");
  const w = wParam !== null ? parseInt(wParam, 10) : NaN;
  const shouldResize = !isNaN(w) && ALLOWED_WIDTHS.has(w);

  const body = shouldResize ? await resizeWebp(bytes, w) : bytes;

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
