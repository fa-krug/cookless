import { AuthError } from "./errors";
import { getAllowedOrigins } from "./config";

export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return; // same-tab navigation / direct
  const origin = request.headers.get("origin");
  if (origin && getAllowedOrigins().includes(origin)) return;
  throw new AuthError(403, "Cross-origin request rejected");
}
