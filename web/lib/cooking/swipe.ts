export function resolveSwipe(
  dx: number,
  dy: number,
  threshold = 50,
): "next" | "prev" | null {
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dy) >= Math.abs(dx)) return null;
  return dx < 0 ? "next" : "prev";
}
