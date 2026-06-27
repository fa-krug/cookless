export type Dictionary = Record<string, unknown>;
export type TVars = Record<string, string | number>;

function lookup(dict: Dictionary, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as object)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

function pluralCategory(count: number): "one" | "other" {
  // en + de cardinal rule: 1 → one, everything else → other.
  return count === 1 ? "one" : "other";
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) =>
    name in vars ? String(vars[name]) : `{{${name}}}`,
  );
}

export function translate(dict: Dictionary, key: string, vars?: TVars): string {
  let value = lookup(dict, key);
  if (value === undefined && vars && typeof vars.count === "number") {
    value =
      lookup(dict, `${key}_${pluralCategory(vars.count)}`) ??
      lookup(dict, `${key}_other`);
  }
  if (typeof value !== "string") return key;
  return interpolate(value, vars);
}

export function translateList(dict: Dictionary, key: string): string[] {
  const value = lookup(dict, key);
  return Array.isArray(value) ? (value as string[]) : [];
}
