# Next.js Migration — Plan 4: UI Foundation & Auth UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the visible-app foundation in the Next.js `web` app — Tailwind 4 styling system, shared UI primitives, server-side i18n (EN/DE), theme system, WebAuthn browser client, an app shell with responsive navigation, and the auth UI (login, invite/register, onboarding wizard, minimal settings) — so the app is loginable, themeable, localized, and ready for the read pages in Plan 5.

**Architecture:** Auth/redirect guards live in **server layouts** (Node runtime, since they touch better-sqlite3 via `requireUser`/`getSession`), not Edge middleware. Read-side localization uses **server-loaded dictionaries** keyed off `user.preferredLanguage` (falling back to a `lang` cookie, then `Accept-Language`); a thin client `I18nProvider` carries the dictionary into the few interactive components. The shadcn/ui primitives and the OKLCH Tailwind theme are ported verbatim from the existing `frontend/` (adding `"use client"` where Next requires it). Auth UI pages are thin clients that call the Plan-3 server actions (`app/(auth)/actions.ts`, `app/(account)/actions.ts`) and the WebAuthn route handlers (`app/api/auth/webauthn/*`).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4 (`@tailwindcss/postcss`), class-variance-authority, clsx, tailwind-merge, tw-animate-css, lucide-react, Radix UI primitives, `@simplewebauthn/browser@^13`, react-hook-form + `@hookform/resolvers` + zod, sonner, Vitest (+ jsdom + @testing-library/react for component/logic tests).

## Global Constraints

- **Node runtime for auth.** Any layout/page/route that calls `getSession`, `requireUser`, `requireHousehold`, or the `db` runs in the Node.js runtime (better-sqlite3 is not Edge-compatible). Do **not** put auth checks in `middleware.ts`.
- **Import alias:** `@/*` maps to the `web/` root (see `tsconfig.json` and `vitest.config.ts`). Use `@/lib/...`, `@/components/...`, `@/app/...`.
- **Onboarding step values (verbatim):** `"CHANGE_PASSWORD"` → `"ADD_PASSKEY"` → `"CREATE_HOUSEHOLD"` → `"COMPLETED"`. The app is usable only when `onboardingStep === "COMPLETED"`.
- **Locales:** exactly `["en", "de"]`, default `"en"`. German copy uses informal "du" (already in the dictionaries — do not rewrite).
- **`UserDto` shape (from `lib/auth/serialize.ts`, do not change):** `{ id, email, preferredLanguage, onboardingStep, isStaff, hasPassword, hasPasskey, activeHousehold: { id; name } | null }`.
- **Server-action result contract (Plan 3):** auth actions return `{ ok: true; user?: UserDto } | { ok: false; status; message }`; account actions return `{ ok: true; data: T } | { ok: false; status; message }`.
- **WebAuthn route contract (Plan 3):** all under `POST /api/auth/webauthn/...`. `*/begin` returns the options JSON; `*/complete` expects `{ credential: <JSON.stringify of the browser credential>, deviceName: string }` and returns a `UserDto` (login/register) or a passkey DTO (add). Errors return `{ message }` with an HTTP status.
- **Colors are OKLCH; brand primary is orange** `oklch(0.69 0.204 70.746)`. Copy the theme tokens verbatim — do not approximate.
- **TDD where logic exists** (the `translate`/locale/`pickLocale` functions, provider hook). Presentational components are verified with `tsc --noEmit` + `next build` + a documented manual smoke; do not skip those verifications.
- **Commit after every task.** Run the full `npm test` + `npx tsc --noEmit` before each commit in tasks that add testable code.

---

### Task 1: Dependencies, Tailwind 4, theme tokens, `cn()` util

**Files:**
- Modify: `web/package.json` (dependencies + scripts)
- Create: `web/postcss.config.mjs`
- Modify: `web/app/globals.css` (replace contents with ported theme)
- Create: `web/lib/utils.ts`
- Modify: `web/vitest.config.ts` (add jsdom-capable setup; keep node default)
- Create: `web/vitest.setup.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`; Tailwind theme tokens (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `rounded-md/lg/xl`, `.dark` variant); npm scripts `typecheck`, `lint`.

- [ ] **Step 1: Install dependencies**

```bash
cd web
npm install \
  class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.5.0 \
  lucide-react@^0.575.0 sonner@^2.0.7 \
  @radix-ui/react-slot@^1.2.4 @radix-ui/react-label@^2.1.8 \
  @radix-ui/react-dialog@^1.1.15 @radix-ui/react-dropdown-menu@^2.1.16 \
  @radix-ui/react-tooltip@^1.2.8 @radix-ui/react-toggle-group@^1.1.11 \
  react-hook-form@^7.54.2 @hookform/resolvers@^3.10.0 \
  @simplewebauthn/browser@^13
npm install -D \
  tailwindcss@^4.2.1 @tailwindcss/postcss@^4.2.1 tw-animate-css@^1.4.0 \
  jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

(`zod` is already a dependency from Plan 3 — do not reinstall.)

- [ ] **Step 2: Create the PostCSS config (Tailwind 4 for Next)**

`web/postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 3: Replace `web/app/globals.css` with the ported theme (verbatim)**

Replace the **entire** file with the contents below (ported 1:1 from `frontend/src/index.css`, with `tw-animate-css` import retained):

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@theme {
  --animate-highlight: highlight-fade 2s ease-out;
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.69 0.204 70.746);
  --primary-foreground: oklch(0.985 0.008 70.746);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.69 0.204 70.746);
  --chart-1: oklch(0.69 0.204 70.746);
  --chart-2: oklch(0.76 0.154 75.553);
  --chart-3: oklch(0.83 0.104 68.886);
  --chart-4: oklch(0.62 0.254 65.216);
  --chart-5: oklch(0.55 0.304 72.108);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.69 0.204 70.746);
  --sidebar-primary-foreground: oklch(0.985 0.008 70.746);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.69 0.204 70.746);
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.69 0.204 70.746);
  --primary-foreground: oklch(0.985 0.008 70.746);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.69 0.204 70.746);
  --chart-1: oklch(0.76 0.154 75.553);
  --chart-2: oklch(0.83 0.104 68.886);
  --chart-3: oklch(0.62 0.254 65.216);
  --chart-4: oklch(0.69 0.204 70.746);
  --chart-5: oklch(0.55 0.304 72.108);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.69 0.204 70.746);
  --sidebar-primary-foreground: oklch(0.985 0.008 70.746);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.69 0.204 70.746);
}

html.dark {
  color-scheme: dark;
}

@keyframes highlight-fade {
  0% { background-color: oklch(0.69 0.204 70.746 / 20%); }
  100% { background-color: transparent; }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    -webkit-user-select: none;
    user-select: none;
  }
  input,
  textarea,
  [contenteditable="true"] {
    -webkit-user-select: text;
    user-select: text;
  }
  form,
  [role="dialog"] {
    -webkit-user-select: text;
    user-select: text;
  }
  html {
    -webkit-text-size-adjust: 100%;
    -webkit-touch-callout: none;
  }
  input,
  select,
  textarea {
    font-size: 16px;
  }
  button,
  [role="button"] {
    cursor: pointer;
  }
}
```

- [ ] **Step 4: Create `web/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Wire jsdom test setup (keep node default)**

`web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Update `web/vitest.config.ts` to register the setup file while keeping the global environment as `node` (component tests opt into jsdom per-file with a `// @vitest-environment jsdom` docblock):

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

- [ ] **Step 6: Add `typecheck` and `lint` scripts**

In `web/package.json` `"scripts"`, add:

```json
"typecheck": "tsc --noEmit",
"lint": "next lint"
```

- [ ] **Step 7: Verify the existing suite still passes and types are clean**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: 162 tests pass (unchanged); tsc reports no errors.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/postcss.config.mjs web/app/globals.css web/lib/utils.ts web/vitest.config.ts web/vitest.setup.ts
git commit -m "feat(web): add Tailwind 4 theme, UI/i18n deps, cn() util, jsdom test setup"
```

---

### Task 2: Root layout + theme system (FOUC-safe dark mode)

**Files:**
- Modify: `web/app/layout.tsx`
- Delete: `web/app/page.tsx`, `web/app/page.module.css` (create-next-app scaffold)
- Create: `web/components/theme/theme-script.tsx`
- Create: `web/components/theme/use-theme.ts`
- Create: `web/components/theme/theme-provider.tsx`

**Interfaces:**
- Consumes: `resolveLocale()` does not exist yet — Task 4 adds it; for now the root layout hardcodes `lang="en"` and Task 4 upgrades it.
- Produces: `ThemeScript` (server component emitting the FOUC script); `useTheme(): { theme: "light" | "dark" | "system"; setTheme(t): void }` from `@/components/theme/use-theme`; `ThemeProvider` (client) from `@/components/theme/theme-provider`.

- [ ] **Step 1: Delete the scaffold home page**

```bash
cd web && rm app/page.tsx app/page.module.css
```

(A real `/` page is created in Task 10 inside the `(app)` group.)

- [ ] **Step 2: Create the FOUC-prevention script**

`web/components/theme/theme-script.tsx`:

```tsx
// Server component: emits a blocking inline script that applies the persisted
// theme class before first paint, preventing a flash of the wrong theme.
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
```

- [ ] **Step 3: Create the theme hook**

`web/components/theme/use-theme.ts`:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "theme";

function read(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const setTheme = useCallback((t: Theme) => {
    window.localStorage.setItem(KEY, t);
    applyTheme(t);
    // Notify same-tab listeners (storage event only fires cross-tab).
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  }, []);
  return { theme, setTheme };
}
```

- [ ] **Step 4: Create the theme provider (keeps `system` in sync with the OS)**

`web/components/theme/theme-provider.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { applyTheme, useTheme } from "./use-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    applyTheme(theme);
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("theme") ?? "system") === "system") {
        applyTheme("system");
      }
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
```

- [ ] **Step 5: Rewrite the root layout (system fonts, FOUC script, hydration-safe)**

`web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";

export const metadata: Metadata = {
  title: "Cookless",
  description: "Meal planning made simple.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

(`suppressHydrationWarning` is required because the FOUC script mutates the `class` on `<html>` before React hydrates. The default Tailwind 4 preflight supplies the system-UI sans font stack, matching the old frontend.)

- [ ] **Step 6: Verify build compiles**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` succeeds (note: with no pages yet besides API routes, the build produces no app routes — that is fine).

- [ ] **Step 7: Commit**

```bash
git add web/app/layout.tsx web/components/theme/
git rm web/app/page.tsx web/app/page.module.css
git commit -m "feat(web): root layout with FOUC-safe theme system"
```

---

### Task 3: i18n core — locales, `translate`, `translateList` (TDD)

**Files:**
- Create: `web/lib/i18n/locales/en.json` (copy of `frontend/src/i18n/en.json`)
- Create: `web/lib/i18n/locales/de.json` (copy of `frontend/src/i18n/de.json`)
- Create: `web/lib/i18n/config.ts`
- Create: `web/lib/i18n/translate.ts`
- Test: `web/lib/i18n/translate.test.ts`

**Interfaces:**
- Produces:
  - `locales = ["en","de"] as const`, `type Locale = "en" | "de"`, `defaultLocale: Locale`, `isLocale(x: string): x is Locale` from `@/lib/i18n/config`.
  - `type Dictionary = Record<string, unknown>`, `type TVars = Record<string, string | number>`.
  - `translate(dict: Dictionary, key: string, vars?: TVars): string` — dot-path lookup, `{{var}}` interpolation, `_one`/`_other` pluralization via `vars.count`, returns the key string itself when missing.
  - `translateList(dict: Dictionary, key: string): string[]` — returns array values (e.g. `plan.weekdays`) or `[]` when missing.

- [ ] **Step 1: Copy the dictionary files verbatim**

```bash
cd /Users/skrug/PycharmProjects/cookless
mkdir -p web/lib/i18n/locales
cp frontend/src/i18n/en.json web/lib/i18n/locales/en.json
cp frontend/src/i18n/de.json web/lib/i18n/locales/de.json
```

Ensure `web/tsconfig.json` has `"resolveJsonModule": true` (Next's default tsconfig does; if missing, add it under `compilerOptions`).

- [ ] **Step 2: Create the config**

`web/lib/i18n/config.ts`:

```ts
export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(x: string | null | undefined): x is Locale {
  return x != null && (locales as readonly string[]).includes(x);
}
```

- [ ] **Step 3: Write the failing test**

`web/lib/i18n/translate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { translate, translateList, type Dictionary } from "./translate";

const dict: Dictionary = {
  common: { save: "Save", loading: "One moment..." },
  setup: { step: "Step {{current}} of {{total}}" },
  plan: {
    weeks_one: "{{count}} week",
    weeks_other: "{{count}} weeks",
    weekdays: ["Mon", "Tue", "Wed"],
  },
};

describe("translate", () => {
  it("resolves a nested key", () => {
    expect(translate(dict, "common.save")).toBe("Save");
  });

  it("interpolates {{vars}}", () => {
    expect(translate(dict, "setup.step", { current: 1, total: 3 })).toBe(
      "Step 1 of 3",
    );
  });

  it("returns the key when missing", () => {
    expect(translate(dict, "nope.missing")).toBe("nope.missing");
  });

  it("pluralizes via count (one)", () => {
    expect(translate(dict, "plan.weeks", { count: 1 })).toBe("1 week");
  });

  it("pluralizes via count (other)", () => {
    expect(translate(dict, "plan.weeks", { count: 3 })).toBe("3 weeks");
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate(dict, "setup.step", { current: 1 })).toBe(
      "Step 1 of {{total}}",
    );
  });
});

describe("translateList", () => {
  it("returns array values", () => {
    expect(translateList(dict, "plan.weekdays")).toEqual(["Mon", "Tue", "Wed"]);
  });

  it("returns [] when missing or not an array", () => {
    expect(translateList(dict, "common.save")).toEqual([]);
    expect(translateList(dict, "nope")).toEqual([]);
  });
});
```

- [ ] **Step 2 (run): Verify it fails**

Run: `cd web && npx vitest run lib/i18n/translate.test.ts`
Expected: FAIL — cannot find module `./translate`.

- [ ] **Step 3: Implement `translate.ts`**

`web/lib/i18n/translate.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/i18n/translate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/i18n/
git commit -m "feat(web): i18n core — locales + translate/translateList (TDD)"
```

---

### Task 4: i18n locale resolution + dictionary loader + provider

**Files:**
- Create: `web/lib/i18n/locale.ts`
- Test: `web/lib/i18n/locale.test.ts`
- Create: `web/lib/i18n/dictionary.ts`
- Create: `web/lib/i18n/server.ts`
- Create: `web/lib/i18n/provider.tsx`
- Test: `web/lib/i18n/provider.test.tsx`
- Modify: `web/app/layout.tsx` (use resolved locale for `<html lang>`)

**Interfaces:**
- Consumes: `translate`, `translateList`, `Dictionary`, `TVars` (Task 3); `isLocale`, `defaultLocale`, `Locale` (Task 3); `getSession` from `@/lib/auth/session` (Plan 3).
- Produces:
  - `pickLocale(candidates: (string | null | undefined)[]): Locale` from `@/lib/i18n/locale` (pure; handles `"de-DE"` → `"de"`).
  - `getDictionary(locale: Locale): Dictionary` from `@/lib/i18n/dictionary`.
  - `resolveLocale(): Promise<Locale>` and `getI18n(): Promise<{ locale: Locale; dict: Dictionary; t: (k, v?) => string; tList: (k) => string[] }>` from `@/lib/i18n/server`.
  - `I18nProvider` (client) + `useT(): { locale: Locale; t: (k, v?) => string; tList: (k) => string[] }` from `@/lib/i18n/provider`.

- [ ] **Step 1: Write the failing locale-picker test**

`web/lib/i18n/locale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickLocale } from "./locale";

describe("pickLocale", () => {
  it("returns the first exact match", () => {
    expect(pickLocale(["de", "en"])).toBe("de");
  });

  it("normalizes region subtags (de-DE -> de)", () => {
    expect(pickLocale(["de-DE"])).toBe("de");
  });

  it("skips null/undefined/unsupported and falls back", () => {
    expect(pickLocale([null, undefined, "fr"])).toBe("en");
  });

  it("falls back to default for an empty list", () => {
    expect(pickLocale([])).toBe("en");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/i18n/locale.test.ts`
Expected: FAIL — cannot find module `./locale`.

- [ ] **Step 3: Implement `locale.ts`**

`web/lib/i18n/locale.ts`:

```ts
import { defaultLocale, isLocale, type Locale } from "./config";

// Candidates in priority order; first supported one wins.
export function pickLocale(candidates: (string | null | undefined)[]): Locale {
  for (const c of candidates) {
    if (isLocale(c)) return c;
    const base = c?.split("-")[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/i18n/locale.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the dictionary loader**

`web/lib/i18n/dictionary.ts`:

```ts
import en from "./locales/en.json";
import de from "./locales/de.json";
import type { Locale } from "./config";
import type { Dictionary } from "./translate";

const dictionaries: Record<Locale, Dictionary> = {
  en: en as Dictionary,
  de: de as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
```

- [ ] **Step 6: Implement the server helper**

`web/lib/i18n/server.ts`:

```ts
import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { pickLocale } from "./locale";
import { getDictionary } from "./dictionary";
import { translate, translateList, type TVars } from "./translate";
import type { Locale } from "./config";

export async function resolveLocale(): Promise<Locale> {
  const user = await getSession();
  const cookieLang = (await cookies()).get("lang")?.value;
  const accept = (await headers()).get("accept-language")?.split(",")[0];
  return pickLocale([user?.preferredLanguage, cookieLang, accept]);
}

export async function getI18n() {
  const locale = await resolveLocale();
  const dict = getDictionary(locale);
  return {
    locale,
    dict,
    t: (key: string, vars?: TVars) => translate(dict, key, vars),
    tList: (key: string) => translateList(dict, key),
  };
}
```

- [ ] **Step 7: Implement the client provider**

`web/lib/i18n/provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import {
  translate,
  translateList,
  type Dictionary,
  type TVars,
} from "./translate";
import type { Locale } from "./config";

type Ctx = { locale: Locale; dict: Dictionary };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within an I18nProvider");
  return {
    locale: ctx.locale,
    t: (key: string, vars?: TVars) => translate(ctx.dict, key, vars),
    tList: (key: string) => translateList(ctx.dict, key),
  };
}
```

- [ ] **Step 8: Write the provider test (jsdom)**

`web/lib/i18n/provider.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider, useT } from "./provider";

function Probe() {
  const { t, locale } = useT();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="text">{t("greeting", { name: "Sam" })}</span>
    </div>
  );
}

describe("I18nProvider + useT", () => {
  it("provides locale and a working t()", () => {
    render(
      <I18nProvider locale="de" dict={{ greeting: "Hallo {{name}}" }}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("de");
    expect(screen.getByTestId("text").textContent).toBe("Hallo Sam");
  });

  it("throws outside a provider", () => {
    expect(() => render(<Probe />)).toThrow(/I18nProvider/);
  });
});
```

- [ ] **Step 9: Run the i18n tests**

Run: `cd web && npx vitest run lib/i18n/`
Expected: PASS (translate 8 + locale 4 + provider 2).

- [ ] **Step 10: Upgrade the root layout to use the resolved locale**

In `web/app/layout.tsx`, make the component async and set the `lang` attribute:

```tsx
import { resolveLocale } from "@/lib/i18n/server";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Verify + commit**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: all tests pass; tsc clean.

```bash
git add web/lib/i18n/ web/app/layout.tsx
git commit -m "feat(web): i18n locale resolution, dictionary loader, client provider"
```

---

### Task 5: UI primitives — basic set (Button, Input, Label, Card, Spinner, Badge, Skeleton)

**Files (create under `web/components/ui/`):** `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `spinner.tsx`, `badge.tsx`, `skeleton.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils` (Task 1).
- Produces: `Button` + `buttonVariants`, `Input`, `Label`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, `Spinner`, `Badge` + `badgeVariants`, `Skeleton`.

> **Porting rule:** copy each file **verbatim** from `frontend/src/components/ui/<file>.tsx`. The import paths already use `@/lib/utils` and `@/components/ui/*`, which resolve identically in the new app. Add `"use client";` as the **first line** of any file that uses `forwardRef`, hooks, or Radix primitives. The exact current sources are reproduced below so they can be created without reading the old tree.

- [ ] **Step 1: `web/components/ui/button.tsx`** (add `"use client";` at top)

```tsx
"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 2: `web/components/ui/input.tsx`** (add `"use client";`)

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 3: `web/components/ui/label.tsx`** (add `"use client";`)

```tsx
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

- [ ] **Step 4: `web/components/ui/card.tsx`** (add `"use client";`) — copy the six `Card*` components verbatim from the styling report / `frontend/src/components/ui/card.tsx` (exports `Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent`).

- [ ] **Step 5: `web/components/ui/spinner.tsx`** (no `"use client"` needed — pure SVG)

```tsx
interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 16 }: SpinnerProps) {
  return (
    <svg
      role="status"
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
```

- [ ] **Step 6: `web/components/ui/badge.tsx`** and **`web/components/ui/skeleton.tsx`** — copy verbatim from the styling report (Badge exports `Badge, badgeVariants`; Skeleton exports `Skeleton`). Add `"use client";` to neither (both are plain function components with no hooks), but they are imported by client components later, which is fine.

- [ ] **Step 7: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` succeeds.

- [ ] **Step 8: Commit**

```bash
git add web/components/ui/
git commit -m "feat(web): port basic UI primitives (button, input, label, card, spinner, badge, skeleton)"
```

---

### Task 6: UI primitives — composite set (Form, Dialog, DropdownMenu, Tooltip, ToggleGroup, Sonner)

**Files (create under `web/components/ui/`):** `form.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `toggle-group.tsx`, `sonner.tsx`

**Interfaces:**
- Consumes: `cn` (Task 1), `Label` (Task 5), `react-hook-form`, the Radix packages and `sonner` installed in Task 1.
- Produces: `Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField, useFormField`; `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose`; `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator`; `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`; `ToggleGroup, ToggleGroupItem`; `Toaster` (sonner) + `toast` re-export.

- [ ] **Step 1: `web/components/ui/form.tsx`** — copy verbatim from `frontend/src/components/ui/form.tsx` (full source in the styling report). Add `"use client";` as the first line. Imports already reference `@/lib/utils` and `@/components/ui/label`.

- [ ] **Step 2: `web/components/ui/dialog.tsx`** — copy verbatim from `frontend/src/components/ui/dialog.tsx` (full source in the styling report). Add `"use client";` as the first line.

- [ ] **Step 3: `web/components/ui/dropdown-menu.tsx`** — copy verbatim from `frontend/src/components/ui/dropdown-menu.tsx`. Add `"use client";`. It must export at least `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator` (used by the nav user menu in Task 10).

- [ ] **Step 4: `web/components/ui/tooltip.tsx`** — copy verbatim from `frontend/src/components/ui/tooltip.tsx`. Add `"use client";`. Exports `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`.

- [ ] **Step 5: `web/components/ui/toggle-group.tsx`** and its dependency **`web/components/ui/toggle.tsx`** — copy both verbatim from the old tree (`toggle-group.tsx` imports `toggle.tsx`). Add `"use client";` to both. Exports `ToggleGroup, ToggleGroupItem` (used by the language switch in Task 11).

- [ ] **Step 6: `web/components/ui/sonner.tsx`** — adapt for Next + the project theme system (the old one read theme from a Vite hook). Create:

```tsx
"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme/use-theme";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return <Sonner theme={theme} richColors {...props} />;
}

export { toast } from "sonner";
```

- [ ] **Step 7: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` succeeds.

- [ ] **Step 8: Commit**

```bash
git add web/components/ui/
git commit -m "feat(web): port composite UI primitives (form, dialog, dropdown-menu, tooltip, toggle-group, sonner)"
```

---

### Task 7: WebAuthn browser client + `Providers` wrapper

**Files:**
- Create: `web/lib/auth-client/webauthn.ts`
- Create: `web/components/providers.tsx`

**Interfaces:**
- Consumes: `@simplewebauthn/browser` (`startAuthentication`, `startRegistration`) — v13 API uses `{ optionsJSON }`. The WebAuthn route handlers (Plan 3) and their `{ credential, deviceName }` contract. `I18nProvider` (Task 4), `ThemeProvider` (Task 2), `Toaster` (Task 6).
- Produces:
  - `passkeyLogin(email: string): Promise<UserDto>`, `passkeyRegister(email: string, inviteCode: string): Promise<UserDto>`, `addPasskey(): Promise<unknown>` from `@/lib/auth-client/webauthn`. All throw `Error` with the server message on non-2xx.
  - `Providers` (client) from `@/components/providers` wrapping `I18nProvider` → `ThemeProvider` → children + `Toaster`.

- [ ] **Step 1: Implement the WebAuthn browser client**

`web/lib/auth-client/webauthn.ts`:

```ts
"use client";

import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? "Request failed");
  }
  return data as T;
}

// Returns the UserDto from /complete.
export async function passkeyLogin<T = unknown>(email: string): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/login/begin", { email });
  const credential = await startAuthentication({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/login/complete", {
    credential: JSON.stringify(credential),
    deviceName: "",
  });
}

export async function passkeyRegister<T = unknown>(
  email: string,
  inviteCode: string,
): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/register/begin", {
    email,
    inviteCode,
  });
  const credential = await startRegistration({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/register/complete", {
    credential: JSON.stringify(credential),
    deviceName: navigator.userAgent,
  });
}

export async function addPasskey<T = unknown>(): Promise<T> {
  const optionsJSON = await post("/api/auth/webauthn/add/begin");
  const credential = await startRegistration({ optionsJSON: optionsJSON as never });
  return post<T>("/api/auth/webauthn/add/complete", {
    credential: JSON.stringify(credential),
    deviceName: navigator.userAgent,
  });
}
```

> Note: `startAuthentication`/`startRegistration` throw a `DOMException` named `"NotAllowedError"` when the user cancels the native prompt — callers (Tasks 7–9) must treat that as a silent abort, not an error toast.

- [ ] **Step 2: Implement the `Providers` wrapper**

`web/components/providers.tsx`:

```tsx
"use client";

import { I18nProvider } from "@/lib/i18n/provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/translate";

export function Providers({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ThemeProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </I18nProvider>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/lib/auth-client/ web/components/providers.tsx
git commit -m "feat(web): WebAuthn browser client + app Providers wrapper"
```

---

### Task 8: `(auth)` layout + Login page

**Files:**
- Create: `web/app/(auth)/layout.tsx`
- Create: `web/components/auth/auth-card.tsx`
- Create: `web/app/(auth)/login/page.tsx`
- Create: `web/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `getSession` (Plan 3), `getI18n` (Task 4), `Providers` (Task 7), `loginPasswordAction` (Plan 3, `app/(auth)/actions.ts`), `passkeyLogin` (Task 7), `Button`/`Input`/`Form*` (Tasks 5–6), `useT` (Task 4), `toast` (Task 6).
- Produces: the `/login` route. On success the form navigates with `router.push("/")` then `router.refresh()` (the `(app)` layout decides onboarding vs. home).

- [ ] **Step 1: Create the `(auth)` layout (redirect already-authed users; provide i18n/theme)**

`web/app/(auth)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { Providers } from "@/components/providers";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (user) {
    redirect(user.onboardingStep === "COMPLETED" ? "/" : "/onboarding");
  }
  const { locale, dict } = await getI18n();
  return (
    <Providers locale={locale} dict={dict}>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary/10 via-primary/5 to-background px-4">
        {children}
      </main>
    </Providers>
  );
}
```

- [ ] **Step 2: Create a shared auth card (brand + card chrome)**

`web/components/auth/auth-card.tsx`:

```tsx
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-center text-4xl font-bold text-primary">
        Cookless
      </h1>
      <div className="rounded-2xl bg-card p-6 shadow-lg">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create the login page (server) that renders the client form**

`web/app/(auth)/login/page.tsx`:

```tsx
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthCard>
      <LoginForm />
    </AuthCard>
  );
}
```

- [ ] **Step 4: Create the login form (client)**

`web/app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n/provider";
import { passkeyLogin } from "@/lib/auth-client/webauthn";
import { loginPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  function done() {
    router.push("/");
    router.refresh();
  }

  async function onSubmit(values: Values) {
    form.clearErrors("root");
    try {
      if (showPassword) {
        const res = await loginPasswordAction({
          email: values.email,
          password: values.password ?? "",
        });
        if (!res.ok) {
          form.setError("root", { message: t("auth.passwordLoginFailed") });
          return;
        }
      } else {
        await passkeyLogin(values.email);
      }
      done();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      form.setError("root", {
        message: t(showPassword ? "auth.passwordLoginFailed" : "auth.loginFailed"),
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="username webauthn"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showPassword && (
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="password"
                    autoFocus
                    placeholder={t("auth.passwordPlaceholder")}
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {form.formState.errors.root && (
          <p className="text-center text-xs text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {showPassword ? t("auth.login") : t("auth.signInWithPasskey")}
        </Button>

        <div className="my-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-muted" />
          <span className="text-xs text-muted-foreground">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-muted" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            form.clearErrors("root");
            setShowPassword((v) => !v);
          }}
        >
          {showPassword ? t("auth.signInWithPasskey") : t("auth.signInWithPassword")}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 5: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` succeeds and lists the `/login` route.

- [ ] **Step 6: Manual smoke**

Seed a dev DB if needed (`npm run db:migrate && npm run db:seed`), start `npm run dev`, open `http://localhost:3000/login`. Confirm: the orange "Cookless" brand renders; email field + "Sign in with Passkey"; the "or" divider; toggling to password reveals the password field and a "Sign in with Passkey" link back. Toggle OS dark mode → page recolors with no flash on reload.

- [ ] **Step 7: Commit**

```bash
git add "web/app/(auth)/layout.tsx" "web/app/(auth)/login" web/components/auth/
git commit -m "feat(web): (auth) layout + login page (passkey + password)"
```

---

### Task 9: Invite / register page

**Files:**
- Create: `web/app/(auth)/invite/[code]/page.tsx`
- Create: `web/app/(auth)/invite/[code]/invite-form.tsx`

**Interfaces:**
- Consumes: `getInviteSummary` from `@/lib/households/invites` (Plan 3) for the household name (server-side, with `new Date()`); `registerPasswordAction` (Plan 3); `passkeyRegister` (Task 7); `getSession` (to branch logged-in vs. anonymous). `AuthCard`, `Button`, `Input`, `Form*`, `useT`, `toast`.
- Produces: the `/invite/[code]` route. On success → `router.push("/")` + `router.refresh()`.

- [ ] **Step 1: Create the page (server) — validate the invite, branch on session**

`web/app/(auth)/invite/[code]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getInviteSummary } from "@/lib/households/invites";
import { AuthCard } from "@/components/auth/auth-card";
import { getI18n } from "@/lib/i18n/server";
import { InviteForm } from "./invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { t } = await getI18n();
  let summary: { householdName: string };
  try {
    summary = getInviteSummary(db, code, new Date());
  } catch {
    notFound();
  }
  return (
    <AuthCard>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        {t("invite.registerPrompt", { household: summary.householdName })}
      </p>
      <InviteForm code={code} />
    </AuthCard>
  );
}
```

(The `(auth)` layout already redirects authenticated users away, so this page only renders for anonymous visitors — the registration form is the only branch needed here. A logged-in "join existing household" flow is out of scope for this plan.)

- [ ] **Step 2: Create the invite form (client)**

`web/app/(auth)/invite/[code]/invite-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useT } from "@/lib/i18n/provider";
import { passkeyRegister } from "@/lib/auth-client/webauthn";
import { registerPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

const schema = z
  .object({
    email: z.string().email(),
    password: z.string().optional(),
    confirm: z.string().optional(),
  })
  .refine((v) => !v.password || v.password === v.confirm, {
    path: ["confirm"],
    message: "password.passwordMismatch",
  });
type Values = z.infer<typeof schema>;

export function InviteForm({ code }: { code: string }) {
  const { t } = useT();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", confirm: "" },
  });

  function done() {
    router.push("/");
    router.refresh();
  }

  async function onSubmit(values: Values) {
    form.clearErrors("root");
    try {
      if (showPassword) {
        const res = await registerPasswordAction({
          email: values.email,
          password: values.password ?? "",
          inviteCode: code,
        });
        if (!res.ok) {
          form.setError("root", { message: res.message });
          return;
        }
      } else {
        await passkeyRegister(values.email, code);
      }
      done();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      form.setError("root", {
        message: e instanceof Error ? e.message : t("invite.registerFailed"),
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="username webauthn"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showPassword && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("auth.passwordPlaceholder")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("password.confirmPassword")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {form.formState.errors.root && (
          <p className="text-center text-xs text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {showPassword ? t("auth.login") : t("auth.signInWithPasskey")}
        </Button>

        <div className="my-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-muted" />
          <span className="text-xs text-muted-foreground">{t("auth.orDivider")}</span>
          <div className="h-px flex-1 bg-muted" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            form.clearErrors("root");
            setShowPassword((v) => !v);
          }}
        >
          {showPassword ? t("auth.signInWithPasskey") : t("auth.signInWithPassword")}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` lists the `/invite/[code]` dynamic route.

- [ ] **Step 4: Commit**

```bash
git add "web/app/(auth)/invite"
git commit -m "feat(web): invite/register page (passkey + password)"
```

---

### Task 10: Onboarding wizard

**Files:**
- Create: `web/app/onboarding/page.tsx`
- Create: `web/app/onboarding/wizard.tsx`
- Create: `web/app/onboarding/steps.tsx`

**Interfaces:**
- Consumes: `requireUser` (Plan 3 — redirects to `/login` if anonymous), `serializeUser` (to get `onboardingStep`/`email`), `getI18n`, `Providers`. Actions: `setPasswordAction`, `skipPasskeyAction` (`app/(auth)/actions.ts`), `createHouseholdAction` (`app/(account)/actions.ts`); `addPasskey` (Task 7). `router.refresh()` re-runs the server component to advance the step after each action.
- Produces: the `/onboarding` route, rendering one of three steps based on `onboardingStep`; redirects to `/` once `COMPLETED`.

- [ ] **Step 1: Create the onboarding page (server guard + step dispatch)**

`web/app/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { serializeUser } from "@/lib/auth/serialize";
import { getI18n } from "@/lib/i18n/server";
import { Providers } from "@/components/providers";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage() {
  const user = await requireUser();
  const dto = serializeUser(db, user);
  if (dto.onboardingStep === "COMPLETED") redirect("/");
  const { locale, dict } = await getI18n();
  return (
    <Providers locale={locale} dict={dict}>
      <main className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-bold text-primary">
            Cookless
          </h1>
          <OnboardingWizard step={dto.onboardingStep} email={dto.email} />
        </div>
      </main>
    </Providers>
  );
}
```

- [ ] **Step 2: Create the step indicator + wizard shell (client)**

`web/app/onboarding/wizard.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Check, Home, KeyRound, Lock } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { ChangePasswordStep, AddPasskeyStep, CreateHouseholdStep } from "./steps";

const STEPS = ["CHANGE_PASSWORD", "ADD_PASSKEY", "CREATE_HOUSEHOLD"] as const;
const ICONS = [Lock, KeyRound, Home];

export function OnboardingWizard({ step, email }: { step: string; email: string }) {
  const { t } = useT();
  const router = useRouter();
  const currentIndex = STEPS.indexOf(step as (typeof STEPS)[number]);

  // Each step calls this after its action succeeds; re-running the server
  // component reads the advanced onboardingStep (or redirects when COMPLETED).
  const advance = () => router.refresh();

  return (
    <div>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        {t("setup.step", { current: currentIndex + 1, total: 3 })}
      </p>
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = ICONS[i];
          const isActive = i === currentIndex;
          const isDone = i < currentIndex;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`h-0.5 w-8 ${isDone ? "bg-primary" : "bg-muted"}`} />
              )}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check size={20} /> : <Icon size={20} />}
              </div>
            </div>
          );
        })}
      </div>

      {step === "CHANGE_PASSWORD" && <ChangePasswordStep email={email} onDone={advance} />}
      {step === "ADD_PASSKEY" && <AddPasskeyStep onDone={advance} />}
      {step === "CREATE_HOUSEHOLD" && <CreateHouseholdStep onDone={advance} />}
    </div>
  );
}
```

- [ ] **Step 3: Create the three step components (client)**

`web/app/onboarding/steps.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { KeyRound } from "lucide-react";

import { useT } from "@/lib/i18n/provider";
import { addPasskey } from "@/lib/auth-client/webauthn";
import { setPasswordAction, skipPasskeyAction } from "@/app/(auth)/actions";
import { createHouseholdAction } from "@/app/(account)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordStep({
  email,
  onDone,
}: {
  email: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const form = useForm<{ currentPassword: string; newPassword: string; confirm: string }>({
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const [error, setError] = useState("");

  async function onSubmit(v: { currentPassword: string; newPassword: string; confirm: string }) {
    setError("");
    if (v.newPassword !== v.confirm) {
      setError(t("setup.changePassword.mismatch"));
      return;
    }
    const res = await setPasswordAction({
      currentPassword: v.currentPassword,
      newPassword: v.newPassword,
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-semibold">{t("setup.changePassword.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("setup.changePassword.description")}</p>
      <p className="text-sm text-muted-foreground">{email}</p>
      <Input
        type="password"
        placeholder={t("setup.changePassword.currentPassword")}
        autoComplete="current-password"
        {...form.register("currentPassword")}
      />
      <Input
        type="password"
        placeholder={t("setup.changePassword.newPassword")}
        autoComplete="new-password"
        {...form.register("newPassword")}
      />
      <Input
        type="password"
        placeholder={t("setup.changePassword.confirmPassword")}
        autoComplete="new-password"
        {...form.register("confirm")}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("common.loading") : t("setup.changePassword.submit")}
      </Button>
    </form>
  );
}

export function AddPasskeyStep({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setBusy(true);
    setError("");
    try {
      await addPasskey();
      onDone();
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setBusy(false);
        return;
      }
      setError(t("errors.passkeyAdd"));
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    const res = await skipPasskeyAction();
    if (!res.ok) {
      setError(t("common.error"));
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("setup.addPasskey.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("setup.addPasskey.description")}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={add} disabled={busy}>
        <KeyRound size={18} />
        {busy ? t("common.loading") : t("setup.addPasskey.add")}
      </Button>
      <Button variant="outline" className="w-full" onClick={skip} disabled={busy}>
        {t("setup.addPasskey.skip")}
      </Button>
    </div>
  );
}

export function CreateHouseholdStep({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const [error, setError] = useState("");

  async function onSubmit(v: { name: string }) {
    setError("");
    const res = await createHouseholdAction({ name: v.name });
    if (!res.ok) {
      setError(res.message || t("errors.householdCreate"));
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-semibold">{t("setup.createHousehold.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("setup.createHousehold.description")}</p>
      <Input
        type="text"
        placeholder={t("setup.createHousehold.namePlaceholder")}
        {...form.register("name", { required: true })}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("common.loading") : t("setup.createHousehold.submit")}
      </Button>
    </form>
  );
}
```

> Note: `createHouseholdAction` advances `onboardingStep` to `COMPLETED` server-side (Plan 3 `createHousehold`), so after `router.refresh()` the page redirects to `/`.

- [ ] **Step 4: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc clean; `next build` lists `/onboarding`.

- [ ] **Step 5: Commit**

```bash
git add web/app/onboarding/
git commit -m "feat(web): onboarding wizard (change password, add passkey, create household)"
```

---

### Task 11: `(app)` shell + responsive navigation + placeholder home

**Files:**
- Create: `web/app/(app)/layout.tsx`
- Create: `web/components/nav/use-sidebar-collapsed.ts`
- Create: `web/components/nav/app-nav.tsx`
- Create: `web/app/(app)/page.tsx`
- Create: `web/components/ui/empty-state.tsx`

**Interfaces:**
- Consumes: `requireUser`, `serializeUser` (onboarding guard + user menu data), `getI18n`, `Providers`, `logoutAction` (Plan 3). `Button`, `DropdownMenu*`, `Tooltip*` (Tasks 5–6), `useT`, lucide icons.
- Produces: the protected `(app)` group with the nav shell; `/` placeholder home; `AppNav` client component; `EmptyState` (`{ icon?; title; subtitle?; action? }`). Nav items: Recipes `/recipes`, Plan `/plan`, Shopping `/shopping`, Settings `/settings`.

> The `/recipes`, `/plan`, `/shopping` targets are created as minimal placeholders in Task 12; they are replaced with real content in Plan 5. `/settings` is built in Task 12.

- [ ] **Step 1: Create the `(app)` server layout (auth + onboarding guard, providers, shell)**

`web/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { serializeUser } from "@/lib/auth/serialize";
import { getI18n } from "@/lib/i18n/server";
import { Providers } from "@/components/providers";
import { AppNav } from "@/components/nav/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const dto = serializeUser(db, user);
  if (dto.onboardingStep !== "COMPLETED") redirect("/onboarding");
  const { locale, dict } = await getI18n();
  return (
    <Providers locale={locale} dict={dict}>
      <div className="flex min-h-screen bg-background md:flex-row">
        <AppNav email={dto.email} householdName={dto.activeHousehold?.name ?? ""} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:pb-8">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
```

- [ ] **Step 2: Create the sidebar-collapsed hook**

`web/components/nav/use-sidebar-collapsed.ts`:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "sidebar-collapsed";

function read() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  }, []);
  return { collapsed, toggle };
}
```

- [ ] **Step 3: Create the responsive nav (mobile bottom bar + desktop sidebar + user menu)**

`web/components/nav/app-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  CircleUser,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { logoutAction } from "@/app/(auth)/actions";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/recipes", icon: BookOpen, key: "nav.recipes" },
  { href: "/plan", icon: Calendar, key: "nav.plan" },
  { href: "/shopping", icon: ShoppingCart, key: "nav.shopping" },
  { href: "/settings", icon: Settings, key: "nav.settings" },
] as const;

export function AppNav({
  email,
  householdName,
}: {
  email: string;
  householdName: string;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarCollapsed();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  async function logout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-center justify-around">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
                isActive(item.href) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-6 w-6" />
              <span>{t(item.key)}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Desktop: sidebar */}
      <nav
        className={cn(
          "fixed left-0 top-0 hidden h-full flex-col border-r border-border bg-background transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex items-center py-6",
            collapsed ? "justify-center px-2" : "justify-between px-5",
          )}
        >
          {!collapsed && <span className="text-2xl font-bold text-primary">Cookless</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggle}
                aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              >
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("flex flex-1 flex-col gap-1", collapsed ? "px-2" : "px-3")}>
          {NAV.map((item) => {
            const link = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium",
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                {!collapsed && <span>{t(item.key)}</span>}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{t(item.key)}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </div>

        <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {collapsed ? (
                <Button variant="ghost" className="h-10 w-full justify-center p-0">
                  <CircleUser className="h-5 w-5" />
                </Button>
              ) : (
                <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-3 py-2">
                  <CircleUser className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{email}</p>
                    <p className="truncate text-xs text-muted-foreground">{householdName}</p>
                  </div>
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{email}</p>
                <p className="truncate text-xs text-muted-foreground">{householdName}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Desktop content offset */}
      <div className={cn("hidden md:block", collapsed ? "md:w-16" : "md:w-56")} aria-hidden />
    </>
  );
}
```

> Note: the trailing offset `<div>` reserves sidebar width in the flex row so `main` is not overlapped. (`Home` is imported for potential reuse; remove it if `next lint` flags it as unused.)

- [ ] **Step 4: Create the `EmptyState` primitive**

`web/components/ui/empty-state.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground" />}
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>}
      {action}
    </div>
  );
}
```

- [ ] **Step 5: Create the placeholder home page**

`web/app/(app)/page.tsx`:

```tsx
import { Home } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function HomePage() {
  const { t } = await getI18n();
  return <EmptyState icon={Home} title={t("common.appName")} subtitle={t("nav.recipes")} />;
}
```

- [ ] **Step 6: Verify typecheck + build + lint**

Run: `cd web && npx tsc --noEmit && npm run build && npm run lint`
Expected: tsc clean; build lists `/` under the `(app)` group; lint clean (remove any unused import it flags).

- [ ] **Step 7: Commit**

```bash
git add "web/app/(app)" web/components/nav/ web/components/ui/empty-state.tsx
git commit -m "feat(web): protected app shell with responsive navigation"
```

---

### Task 12: Settings page (language + theme + logout), placeholders, full verification

**Files:**
- Create: `web/app/(app)/settings/page.tsx`
- Create: `web/app/(app)/settings/settings-client.tsx`
- Create: `web/app/(account)/set-language/route.ts` (writes the `lang` cookie alongside the profile update) — see Step 2
- Create: `web/app/(app)/recipes/page.tsx`, `web/app/(app)/plan/page.tsx`, `web/app/(app)/shopping/page.tsx` (placeholders)

**Interfaces:**
- Consumes: `getI18n`, `serializeUser`/`requireUser` (current language), `updateProfileAction` (Plan 3, `app/(account)/actions.ts`), `useTheme` (Task 2), `ToggleGroup`/`ToggleGroupItem` (Task 6), `useT`, `useRouter`.
- Produces: `/settings` with a language switch (persists `preferredLanguage` via `updateProfileAction` **and** a `lang` cookie so SSR/pre-auth pages match) and a theme switch (light/dark/system); placeholder `/recipes`, `/plan`, `/shopping` pages (replaced in Plan 5).

- [ ] **Step 1: Create the settings page (server) passing the current language**

`web/app/(app)/settings/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const current: Locale = isLocale(user.preferredLanguage)
    ? user.preferredLanguage
    : "en";
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <SettingsClient currentLanguage={current} />
    </div>
  );
}
```

- [ ] **Step 2: Add a tiny route that persists the `lang` cookie**

The `updateProfileAction` writes `preferredLanguage` to the user row but cannot set a cookie that pre-auth/SSR reads. Add a route handler the settings client calls after the action, to set the `lang` cookie.

`web/app/(account)/set-language/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";

export async function POST(req: Request) {
  await requireUser();
  const { lang } = await req.json();
  if (!isLocale(lang)) {
    return NextResponse.json({ message: "Unsupported locale" }, { status: 400 });
  }
  (await cookies()).set("lang", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create the settings client**

`web/app/(app)/settings/settings-client.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { useTheme, type Theme } from "@/components/theme/use-theme";
import { updateProfileAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/lib/i18n/config";

export function SettingsClient({ currentLanguage }: { currentLanguage: Locale }) {
  const { t } = useT();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function changeLanguage(lang: string) {
    if (lang !== "en" && lang !== "de") return;
    const res = await updateProfileAction({ preferredLanguage: lang });
    if (!res.ok) {
      toast.error(t("common.error"));
      return;
    }
    await fetch("/account/set-language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    router.refresh(); // re-render server components with the new dictionary
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("settings.language")}</h2>
        <ToggleGroup
          type="single"
          value={currentLanguage}
          onValueChange={(v) => v && changeLanguage(v)}
        >
          {(["en", "de"] as const).map((lang) => (
            <ToggleGroupItem key={lang} value={lang}>
              {t(`settings.languages.${lang}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("settings.theme")}</h2>
        <ToggleGroup
          type="single"
          value={theme}
          onValueChange={(v) => v && setTheme(v as Theme)}
        >
          {(["light", "dark", "system"] as const).map((th) => (
            <ToggleGroupItem key={th} value={th}>
              {t(`settings.themes.${th}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>
    </div>
  );
}
```

> Note on the route path: `(account)` is a route group (parentheses are stripped from the URL), so the handler is reachable at `/set-language`. The fetch URL is `/set-language`. **Correct the fetch URL in Step 3 to `"/set-language"`** if it differs — verify with the build output's route list.

- [ ] **Step 4: Create placeholder feature pages (replaced in Plan 5)**

`web/app/(app)/recipes/page.tsx`:

```tsx
import { BookOpen } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function RecipesPage() {
  const { t } = await getI18n();
  return <EmptyState icon={BookOpen} title={t("nav.recipes")} subtitle={t("common.loading")} />;
}
```

`web/app/(app)/plan/page.tsx` and `web/app/(app)/shopping/page.tsx`: identical shape, swapping the icon (`Calendar`, `ShoppingCart`) and title key (`nav.plan`, `nav.shopping`).

- [ ] **Step 5: Verify the full suite, types, build, lint**

Run: `cd web && npm test && npx tsc --noEmit && npm run build && npm run lint`
Expected: all Vitest tests pass (162 from Plan 3 + translate 8 + locale 4 + provider 2 = 176); tsc clean; build lists `/`, `/login`, `/invite/[code]`, `/onboarding`, `/recipes`, `/plan`, `/shopping`, `/settings`, `/set-language`; lint clean.

- [ ] **Step 6: Full manual smoke (documented flow)**

With a fresh dev DB (`rm -f data/*.db* && npm run db:migrate && npm run db:seed`) and a seeded user, run `npm run dev` and verify end-to-end:
1. Visit `/` while logged out → redirected to `/login`.
2. Log in (password) → if onboarding incomplete, land on `/onboarding`; complete all three steps → land on `/` with the nav shell.
3. Nav: click Recipes/Plan/Shopping/Settings (placeholders + settings render; active item highlighted). On desktop, collapse/expand the sidebar (persists across reload). On a narrow viewport, the bottom bar shows.
4. Settings: switch language EN↔DE → nav labels and headings re-render in the chosen language and persist across reload (cookie + user record). Switch theme light/dark/system → colors change; reload shows no flash.
5. User menu → Log out → redirected to `/login`; visiting `/` again redirects to `/login`.

- [ ] **Step 7: Commit**

```bash
git add "web/app/(app)/settings" "web/app/(account)/set-language" "web/app/(app)/recipes" "web/app/(app)/plan" "web/app/(app)/shopping"
git commit -m "feat(web): settings (language + theme), placeholder feature pages, full-flow verification"
```

---

## Self-Review

**Spec coverage (against the design's build-order item 4 split + the foundation decisions):**
- Styling system (Tailwind 4 + OKLCH theme + `cn`) → Task 1. ✓
- Theme/dark mode → Task 2. ✓
- Server-side i18n from existing EN/DE JSON → Tasks 3–4. ✓
- Shared UI primitives → Tasks 5–6. ✓
- WebAuthn browser client → Task 7. ✓
- Auth UI: login → Task 8; invite/register → Task 9; onboarding wizard → Task 10. ✓
- App shell + responsive nav → Task 11. ✓
- Settings (language/theme/logout) + navigable placeholders → Tasks 11–12. ✓
- Household-scoped *read query layer* → **deferred to Plan 5** (built next to the pages that consume it; the foundational scoping guard `assertHouseholdAccess`/`requireHousehold` already exists from Plan 3). Noted here so the decision is explicit.

**Type consistency:** `UserDto.onboardingStep` (string, values `CHANGE_PASSWORD/ADD_PASSKEY/CREATE_HOUSEHOLD/COMPLETED`) used consistently in Tasks 8/10/11. Action result shapes (`{ ok, user? }` vs `{ ok, data }`) match Plan 3 verbatim. `Locale`/`Dictionary`/`TVars` flow consistently from Task 3 → server (Task 4) → provider (Task 4) → consumers. WebAuthn `{ credential, deviceName }` contract matches the Plan-3 routes.

**Known follow-ups for the executor (not placeholders, but watch-outs):**
- Verify the exact reachable path of the `set-language` route from the `next build` route list and align the fetch URL (the route group `(account)` is stripped → `/set-language`).
- If `next lint` flags unused lucide imports (e.g. `Home` in `app-nav.tsx`), remove them.
- The `optionsJSON as never` casts in the WebAuthn client are a pragmatic bridge to `@simplewebauthn/browser` v13 types; if the begin-route response types are exported from the lib, prefer importing them.
