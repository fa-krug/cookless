# Settings Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, monotonous Settings page and its sub-pages with a cohesive visual language — grouped cards with amber icon badges, description lines, and clickable navigation rows.

**Architecture:** Introduce one shared presentational primitive (`SettingsSection` + `SettingsNavRow`) built on the existing shadcn `<Card>`, then rebuild the main Settings page and the Tags/AI/Household sub-pages on top of it. Purely presentational — no logic, data, routing, or state changes.

**Tech Stack:** Next.js (App Router) client components, React 19, Tailwind CSS 4, shadcn/ui, `lucide-react` icons, i18n via `useT`/dictionary JSON, Vitest + @testing-library/react.

## Global Constraints

- No new dependencies — icons come from the already-installed `lucide-react` (`^0.575.0`).
- No new design tokens or colors — reuse `--primary` (amber) and `--destructive` only.
- Icon-badge accent: `bg-primary/10 text-primary`; destructive variant: `bg-destructive/10 text-destructive`.
- Every new i18n key MUST exist in BOTH `web/lib/i18n/locales/en.json` and `de.json`.
- Must render correctly in light and dark themes.
- No behavior changes to forms, actions, toggles, or navigation targets.
- Verification commands run from the `web/` directory: `npm run typecheck`, `npm run lint`, `npm test`.

---

## File Structure

- **New:** `web/app/(app)/settings/settings-section.tsx` — `SettingsSection` + `SettingsNavRow` presentational components.
- **New:** `web/app/(app)/settings/settings-section.test.tsx` — render tests for the primitive.
- **Modify:** `web/app/(app)/settings/settings-client.tsx` — grouped sections.
- **Modify:** `web/app/(app)/settings/account-section.tsx` — rebuild on `SettingsSection`.
- **Modify:** `web/app/(app)/settings/ai/ai-settings-form.tsx` — wrap form in `SettingsSection`.
- **Modify:** `web/app/(app)/settings/tags/tag-management-client.tsx` — page header + section styling.
- **Modify:** `web/app/(app)/settings/household/{household-info,members-list,invite-section,manage-households,danger-zone}.tsx` — convert raw-div sections to `SettingsSection`.
- **Modify:** `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json` — description/subtitle copy.

---

### Task 1: `SettingsSection` + `SettingsNavRow` primitive

**Files:**
- Create: `web/app/(app)/settings/settings-section.tsx`
- Test: `web/app/(app)/settings/settings-section.test.tsx`

**Interfaces:**
- Produces:
  - `SettingsSection(props: { icon: LucideIcon; title: string; description?: string; variant?: "default" | "destructive"; className?: string; children?: React.ReactNode })` — a `<Card>` with an icon badge + title + optional description header, then `children` below.
  - `SettingsNavRow(props: { icon: LucideIcon; title: string; description?: string; href: string })` — a `<Card>` wrapping a Next `<Link>` with a trailing `ChevronRight`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "lucide-react";
import { SettingsSection, SettingsNavRow } from "./settings-section";

describe("SettingsSection", () => {
  it("renders title, description, and children", () => {
    render(
      <SettingsSection icon={Tag} title="Manage Tags" description="Organize recipes">
        <button>child</button>
      </SettingsSection>,
    );
    expect(screen.getByText("Manage Tags")).toBeInTheDocument();
    expect(screen.getByText("Organize recipes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "child" })).toBeInTheDocument();
  });

  it("applies destructive styling on the icon badge", () => {
    const { container } = render(
      <SettingsSection icon={Tag} title="Danger" variant="destructive" />,
    );
    expect(container.querySelector(".text-destructive")).not.toBeNull();
  });
});

describe("SettingsNavRow", () => {
  it("renders a link to href with title", () => {
    render(<SettingsNavRow icon={Tag} title="Tags" href="/settings/tags" />);
    const link = screen.getByRole("link", { name: /Tags/ });
    expect(link).toHaveAttribute("href", "/settings/tags");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run app/\(app\)/settings/settings-section.test.tsx`
Expected: FAIL — cannot resolve `./settings-section`.

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

function IconBadge({
  icon: Icon,
  variant = "default",
}: {
  icon: LucideIcon;
  variant?: "default" | "destructive";
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        variant === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary",
      )}
    >
      <Icon size={18} />
    </span>
  );
}

export function SettingsSection({
  icon,
  title,
  description,
  variant = "default",
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("space-y-4 p-4", className)}>
      <div className="flex items-start gap-3">
        <IconBadge icon={icon} variant={variant} />
        <div className="min-w-0 space-y-0.5">
          <h2
            className={cn(
              "text-base font-semibold leading-tight",
              variant === "destructive" && "text-destructive",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

export function SettingsNavRow({
  icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  href: string;
}) {
  return (
    <Card className="p-0 transition-colors hover:bg-accent">
      <Link href={href} className="flex items-center gap-3 p-4">
        <IconBadge icon={icon} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </Link>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run app/\(app\)/settings/settings-section.test.tsx`
Expected: PASS (3 tests). If `toBeInTheDocument` is unavailable, the repo's vitest setup includes jest-dom; confirm by checking `vitest.config` / setup file and use `expect(...).not.toBeNull()` style already shown as fallback.

- [ ] **Step 5: Commit**

```bash
git add "web/app/(app)/settings/settings-section.tsx" "web/app/(app)/settings/settings-section.test.tsx"
git commit -m "feat(web): add SettingsSection + SettingsNavRow primitive"
```

---

### Task 2: i18n description copy

**Files:**
- Modify: `web/lib/i18n/locales/en.json`
- Modify: `web/lib/i18n/locales/de.json`

**Interfaces:**
- Produces new keys consumed by Tasks 3–5:
  - `settings.preferences` / `settings.dataGroup` / `settings.accountGroup` (group headers)
  - `settings.subtitle`
  - `settings.languageDescription`, `settings.themeDescription`, `settings.accountDescription`
  - `tags.manageDescription` (nav row), `aiSettings.navDescription` (nav row), `nav.householdDescription` (nav row)
  - `household.info` (title), `household.infoDescription`, `household.membersDescription`, `household.inviteDescription`, `household.manageDescription`, `household.dangerDescription`
  - `tags.subtitle`

- [ ] **Step 1: Add keys to `en.json`**

Under `"settings"` (extend the existing block):

```json
    "subtitle": "Manage your preferences, household, and account.",
    "preferences": "Preferences",
    "dataGroup": "Recipes & Household",
    "accountGroup": "Account",
    "languageDescription": "Choose the app language.",
    "themeDescription": "Pick light, dark, or match your system.",
    "accountDescription": "Your sign-in and security options.",
```

Under `"tags"`: add `"subtitle": "Organize your recipes with tags.",` and `"manageDescription": "Create, rename, and organize your tags.",`

Under `"aiSettings"`: add `"navDescription": "Generate recipes and photos with AI.",`

Under `"nav"`: add `"householdDescription": "Members, invites, and household settings.",`

Under `"household"`: add
```json
    "info": "Current household",
    "infoDescription": "Name and details of your active household.",
    "membersDescription": "People who share this household.",
    "inviteDescription": "Invite someone to join.",
    "manageDescription": "Switch between or create households.",
    "dangerDescription": "Irreversible actions for this household.",
```
(Only add keys that don't already exist — check first with a grep; reuse existing titles like `household.members`, `household.currentHousehold`, `household.generateInvite` for titles.)

- [ ] **Step 2: Add the SAME keys to `de.json`** with German translations:

```
settings.subtitle: "Verwalte deine Einstellungen, deinen Haushalt und dein Konto."
settings.preferences: "Einstellungen"
settings.dataGroup: "Rezepte & Haushalt"
settings.accountGroup: "Konto"
settings.languageDescription: "Wähle die App-Sprache."
settings.themeDescription: "Hell, dunkel oder wie dein System."
settings.accountDescription: "Deine Anmelde- und Sicherheitsoptionen."
tags.subtitle: "Organisiere deine Rezepte mit Tags."
tags.manageDescription: "Tags erstellen, umbenennen und organisieren."
aiSettings.navDescription: "Rezepte und Fotos mit KI generieren."
nav.householdDescription: "Mitglieder, Einladungen und Haushaltseinstellungen."
household.info: "Aktueller Haushalt"
household.infoDescription: "Name und Details deines aktiven Haushalts."
household.membersDescription: "Personen, die diesen Haushalt teilen."
household.inviteDescription: "Lade jemanden ein."
household.manageDescription: "Zwischen Haushalten wechseln oder neue erstellen."
household.dangerDescription: "Unwiderrufliche Aktionen für diesen Haushalt."
```

- [ ] **Step 3: Verify JSON validity + key parity**

Run: `cd web && node -e "const en=require('./lib/i18n/locales/en.json');const de=require('./lib/i18n/locales/de.json');console.log('ok')"`
Expected: prints `ok` (no JSON parse error). If the i18n test suite has a parity test, run `npx vitest run lib/i18n`.

- [ ] **Step 4: Commit**

```bash
git add web/lib/i18n/locales/en.json web/lib/i18n/locales/de.json
git commit -m "i18n(web): add settings description + group copy (en/de)"
```

---

### Task 3: Rebuild the main Settings page

**Files:**
- Modify: `web/app/(app)/settings/settings-client.tsx`
- Modify: `web/app/(app)/settings/account-section.tsx`
- Modify: `web/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `SettingsSection`, `SettingsNavRow` (Task 1); i18n keys (Task 2).

- [ ] **Step 1: Rewrite `settings-client.tsx`** into grouped sections. Keep all handlers (`changeLanguage`, `useTheme`, toggle logic) and props unchanged; only restructure JSX.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Languages, Palette, Tag, Sparkles, Users } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useTheme, type Theme } from "@/components/theme/use-theme";
import { updateProfileAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/lib/i18n/config";
import { SettingsSection, SettingsNavRow } from "./settings-section";
import { AccountSection } from "./account-section";

export function SettingsClient({
  currentLanguage,
  email,
  hasPassword,
  hasPasskey,
}: {
  currentLanguage: Locale;
  email: string;
  hasPassword: boolean;
  hasPasskey: boolean;
}) {
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
    await fetch("/set-language", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.preferences")}
        </h2>
        <SettingsSection
          icon={Languages}
          title={t("settings.language")}
          description={t("settings.languageDescription")}
        >
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
        </SettingsSection>
        <SettingsSection
          icon={Palette}
          title={t("settings.theme")}
          description={t("settings.themeDescription")}
        >
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
        </SettingsSection>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.dataGroup")}
        </h2>
        <SettingsNavRow
          icon={Tag}
          title={t("tags.manageTags")}
          description={t("tags.manageDescription")}
          href="/settings/tags"
        />
        <SettingsNavRow
          icon={Sparkles}
          title={t("aiSettings.title")}
          description={t("aiSettings.navDescription")}
          href="/settings/ai"
        />
        <SettingsNavRow
          icon={Users}
          title={t("nav.manageHousehold")}
          description={t("nav.householdDescription")}
          href="/settings/household"
        />
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("settings.accountGroup")}
        </h2>
        <AccountSection email={email} hasPassword={hasPassword} hasPasskey={hasPasskey} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `account-section.tsx`** to use `SettingsSection`. Keep `handleLogout`, offline-queue clearing, `PasswordForm`, `PasskeySection`, and the confirm dialog exactly as they are; only swap the outer `<Card>`/heading for `SettingsSection` and add the email/password/passkey/logout as children.

```tsx
  return (
    <SettingsSection
      icon={Mail}
      title={t("settings.account")}
      description={t("settings.accountDescription")}
    >
      <p className="text-sm text-muted-foreground">{email}</p>
      <PasswordForm hasPassword={hasPassword} hasPasskey={hasPasskey} />
      <PasskeySection hasPassword={hasPassword} />
      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut size={16} />
        {t("settings.logout")}
      </Button>
      {dialog}
    </SettingsSection>
  );
```

Update imports: add `import { Mail } from "lucide-react";` (keep `LogOut`), replace `Card` import with `import { SettingsSection } from "./settings-section";`, keep `Button`. The children get their own vertical spacing from `SettingsSection`'s `space-y-4`.

- [ ] **Step 3: Update `page.tsx`** to add the subtitle under the `<h1>`:

```tsx
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>
      <SettingsClient
        currentLanguage={current}
        email={account.email}
        hasPassword={account.hasPassword}
        hasPasskey={account.hasPasskey}
      />
    </div>
  );
```

- [ ] **Step 4: Verify typecheck + lint + build-adjacent tests**

Run: `cd web && npm run typecheck && npm run lint && npm test`
Expected: typecheck clean, lint clean, all tests pass (including Task 1's).

- [ ] **Step 5: Commit**

```bash
git add "web/app/(app)/settings/settings-client.tsx" "web/app/(app)/settings/account-section.tsx" "web/app/(app)/settings/page.tsx"
git commit -m "feat(web): grouped icon-badged sections on main Settings page"
```

---

### Task 4: Household sub-page sections

**Files:**
- Modify: `web/app/(app)/settings/household/household-info.tsx`
- Modify: `web/app/(app)/settings/household/members-list.tsx`
- Modify: `web/app/(app)/settings/household/invite-section.tsx`
- Modify: `web/app/(app)/settings/household/manage-households.tsx`
- Modify: `web/app/(app)/settings/household/danger-zone.tsx`

**Interfaces:**
- Consumes: `SettingsSection` (Task 1); i18n keys (Task 2).

For each file, replace the outer `<div className="rounded-lg border border-border bg-card p-4 shadow-sm">` + inner `<h2 className="... text-lg font-semibold ...">` with a `SettingsSection` wrapper, moving the rest of the section body into its children. Preserve ALL existing logic, handlers, and inner markup below the heading.

- [ ] **Step 1: `household-info.tsx`** — wrap in:

```tsx
import { SettingsSection } from "../settings-section";
import { Home } from "lucide-react";
// ...
  return (
    <SettingsSection icon={Home} title={t("household.info")} description={t("household.infoDescription")}>
      {/* existing body that followed the old <h2>, minus the removed heading */}
    </SettingsSection>
  );
```
(The old title used `household.currentHousehold`; keep using that key for the title if preferred — either is defined. Use `household.info` per Task 2, or reuse `household.currentHousehold` and drop the new key. Pick one and be consistent.)

- [ ] **Step 2: `members-list.tsx`** — icon `Users`, title `t("household.members")`, description `t("household.membersDescription")`. Remove the old `<h2>`; keep the members map/body as children.

- [ ] **Step 3: `invite-section.tsx`** — icon `UserPlus`, title `t("household.generateInvite")`, description `t("household.inviteDescription")`.

- [ ] **Step 4: `manage-households.tsx`** — this file renders MULTIPLE raw-div cards. Convert each to a `SettingsSection`. Primary "manage/switch" card: icon `Building2`, description `t("household.manageDescription")`, title from the existing heading key. Preserve the create-household and list sub-blocks as children of the appropriate section(s). Keep the `w-full justify-start` button rows unchanged.

- [ ] **Step 5: `danger-zone.tsx`** — icon `TriangleAlert`, `variant="destructive"`, description `t("household.dangerDescription")`, title from the existing destructive heading key. The `SettingsSection` destructive variant already colors the title/badge, so remove the now-redundant `text-destructive` from the old `<h2>` (the heading itself is removed).

- [ ] **Step 6: Verify**

Run: `cd web && npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add "web/app/(app)/settings/household/"
git commit -m "feat(web): unify Household sub-sections on SettingsSection"
```

---

### Task 5: AI + Tags sub-pages

**Files:**
- Modify: `web/app/(app)/settings/ai/ai-settings-form.tsx`
- Modify: `web/app/(app)/settings/tags/tag-management-client.tsx`
- Modify: `web/app/(app)/settings/tags/page.tsx` (only if a page header/subtitle needs adding at the page level)

**Interfaces:**
- Consumes: `SettingsSection` (Task 1); i18n keys (Task 2).

- [ ] **Step 1: `ai-settings-form.tsx`** — wrap the form body (currently `<div className="max-w-md space-y-4">`) in a `SettingsSection`:

```tsx
import { SettingsSection } from "../settings-section";
import { Sparkles } from "lucide-react";
// ...
  return (
    <SettingsSection
      icon={Sparkles}
      title={t("aiSettings.title")}
      description={t("aiSettings.subtitle")}
      className="max-w-md"
    >
      {/* existing form fields */}
    </SettingsSection>
  );
```
The page's existing `<h1>`/subtitle in `ai/page.tsx` stays. (If it now duplicates the section title, keep the page `<h1>` and drop the section title's redundancy by leaving the section title as the AI title — acceptable; do not restructure `ai/page.tsx`.)

- [ ] **Step 2: `tag-management-client.tsx`** — give the page a consistent header. The current `<h1 className="text-xl font-semibold">` becomes a header block with a subtitle:

```tsx
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("tags.manageTags")}</h1>
        <p className="text-sm text-muted-foreground">{t("tags.subtitle")}</p>
      </div>
```
Keep the category groups. Optionally wrap the whole tag-editing area in a single `SettingsSection` (icon `Tag`, title `t("tags.manageTags")`, description `t("tags.subtitle")`) if it improves cohesion — but do NOT double the title with the page `<h1>`; if wrapping in a section, drop the section title/description and keep only the page header, using a plain `<Card>` instead. Prefer the simplest change that matches the other pages.

- [ ] **Step 3: Verify**

Run: `cd web && npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add "web/app/(app)/settings/ai/" "web/app/(app)/settings/tags/"
git commit -m "feat(web): unify AI + Tags sub-pages with settings visual language"
```

---

## Final Verification

- [ ] Run full suite from `web/`: `npm run typecheck && npm run lint && npm test` — all clean.
- [ ] Manual visual check (dev server) of Settings + Tags + AI + Household in BOTH light and dark themes: icon badges tinted amber, descriptions present, nav rows show chevron + hover, danger zone tinted red.

## Self-Review Notes

- **Spec coverage:** Primitive (Task 1) ✓; grouped main page + account (Task 3) ✓; i18n en+de parity (Task 2) ✓; household sections (Task 4) ✓; AI + Tags (Task 5) ✓; light/dark + no-new-deps constraints carried in Global Constraints ✓.
- **No behavior change:** All tasks explicitly preserve handlers, actions, and navigation targets.
- **Ambiguity flagged:** household title key choice (`household.info` vs `household.currentHousehold`) and the Tags section-vs-header choice are called out with a decision rule ("pick one, be consistent" / "simplest change").
