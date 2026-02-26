type TFn = (key: string) => string;

export function mapPasswordError(
  detail: string,
  t: TFn,
  prefix = "setup.changePassword",
): string {
  const lower = detail.toLowerCase();
  if (lower.includes("incorrect")) return t(`${prefix}.incorrectCurrent`);
  if (lower.includes("too short") || lower.includes("at least"))
    return t(`${prefix}.tooShort`);
  if (lower.includes("too common") || lower.includes("commonly used"))
    return t(`${prefix}.tooCommon`);
  if (lower.includes("similar")) return t(`${prefix}.tooSimilar`);
  if (lower.includes("entirely numeric")) return t(`${prefix}.entirelyNumeric`);
  if (lower.includes("same") || lower.includes("previously used"))
    return t(`${prefix}.samePassword`);
  return detail || t("common.error");
}

export function extractApiDetail(err: unknown): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body: Record<string, unknown> }).body;
    return String(body?.detail ?? "");
  }
  return "";
}
