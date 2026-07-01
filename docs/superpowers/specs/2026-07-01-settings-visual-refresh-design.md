# Settings Visual Refresh — Design

**Date:** 2026-07-01
**Branch:** `design/nextjs-migration`
**Status:** Approved (pending spec review)

## Problem

The Settings page and its sub-pages read as visually "dry": a monotonous vertical
stack of near-identical bordered cards, each with only a tiny `text-sm` heading and
one bare control. No icons, no descriptions, no grouping, no visual hierarchy.

Two divergent card idioms exist today:

- **Main page** (`settings-client.tsx`, `account-section.tsx`): shadcn `<Card>` with
  `text-sm font-medium` headings.
- **Sub-pages** (household/*, ai, tags): raw `div.rounded-lg.border.border-border.bg-card.p-4.shadow-sm`
  wrappers with `text-lg font-semibold` headings.

## Goal

A single, cohesive settings visual language — grouped sections with icon badges,
description lines, and clickable navigation rows — applied to the main page **and**
all sub-pages (Tags, AI, Household). Purely presentational.

## Non-Goals

- No new design tokens or colors (reuse existing amber `--primary` + `--destructive`).
- No logic, data, routing, or state-management changes.
- No new dependencies — icons come from the already-installed `lucide-react`.
- No changes to forms' behavior (validation, submission, actions untouched).

## Design

### 1. New shared primitive: `SettingsSection`

File: `web/app/(app)/settings/settings-section.tsx` (client component, presentational).

A `<Card>`-based section with a consistent header layout:

- **Icon badge** — `size-9 rounded-lg` tile. Default variant: `bg-primary/10 text-primary`
  (ties into the amber brand). Destructive variant: `bg-destructive/10 text-destructive`.
  Holds a lucide icon passed by the caller.
- **Title** — `text-base font-semibold`.
- **Description** — optional `text-sm text-muted-foreground` line beneath the title.
- **Content** — `children`, rendered below the header (used for controls/forms).

Proposed props:

```tsx
interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  children?: React.ReactNode;
  className?: string;
}
```

A sibling **`SettingsNavRow`** (same file) renders a navigation entry: an icon badge +
title + description wrapped in a Next `<Link>`, with a trailing `ChevronRight` and a
hover state (`hover:bg-accent`). Used for the Tags / AI / Household entry points.

Both components must render correctly in light and dark themes.

### 2. Main Settings page — grouped sections

Rework `settings-client.tsx` into labeled groups. Each group has a small uppercase
group header (`text-xs font-medium uppercase tracking-wide text-muted-foreground`)
followed by one card containing the group's rows (divided by `border-t` between rows
where multiple rows share a card).

- **Preferences**
  - Language — icon `Languages` — en/de `ToggleGroup` (unchanged control).
  - Theme — icon `Palette` — light/dark/system `ToggleGroup` (unchanged control).
- **Recipes & Household** (navigation rows via `SettingsNavRow`)
  - Manage Tags — icon `Tag` — → `/settings/tags`.
  - AI Features — icon `Sparkles` — → `/settings/ai`.
  - Household — icon `Users` — → `/settings/household`.
- **Account** (`account-section.tsx`, rebuilt on `SettingsSection`)
  - Email display — icon `Mail`.
  - Password form (unchanged).
  - Passkey section (unchanged).
  - Logout — destructive button (unchanged behavior).

The main page header (`page.tsx`) keeps its `<h1>`; optionally gains a subtitle line
for consistency with sub-pages.

### 3. Sub-pages — same treatment

Rebuild each sub-page section on `SettingsSection` and add a page header with icon +
subtitle where missing.

- **Tags** (`tags/tag-management-client.tsx`) — page header (icon `Tag` + subtitle);
  category groups presented consistently.
- **AI** (`ai/ai-settings-form.tsx`) — page header already exists (`aiSettings.subtitle`);
  wrap the form in a `SettingsSection` (icon `Sparkles`).
- **Household** (`household/*.tsx`) — convert the five raw-div sections to `SettingsSection`:
  - Household info — icon `Home`.
  - Members — icon `Users`.
  - Invite — icon `UserPlus`.
  - Manage households — icon `Building2` (or `LayoutGrid`).
  - Danger zone — icon `TriangleAlert`, `variant="destructive"`.

### 4. Copy / i18n

Add description strings to **both** `en.json` and `de.json` under the relevant
namespaces (e.g. `settings.languageDescription`, `settings.themeDescription`,
`settings.accountDescription`, plus short descriptions for the Tags/AI/Household nav
rows and each household sub-section). Reuse existing titles where present
(`settings.language`, `settings.theme`, `aiSettings.subtitle`, etc.).

## Files Touched

- **New:** `web/app/(app)/settings/settings-section.tsx`
- **Edited:** `settings-client.tsx`, `account-section.tsx`, `page.tsx`,
  `tags/tag-management-client.tsx`, `ai/ai-settings-form.tsx`,
  `household/household-info.tsx`, `household/members-list.tsx`,
  `household/invite-section.tsx`, `household/manage-households.tsx`,
  `household/danger-zone.tsx`, `household/household-client.tsx` (if wrapper spacing needs adjusting)
- **i18n:** `web/lib/i18n/locales/en.json`, `web/lib/i18n/locales/de.json`

## Testing / Verification

- `cd web && npm run lint` and `npm run typecheck` pass.
- `npm test` (vitest) passes — existing settings/household tests still green.
- Manual: visual check of Settings + all three sub-pages in light and dark themes,
  including nav-row hover and the destructive danger-zone styling.

## Risks

- Existing tests may query the old DOM structure (headings/roles). Update selectors
  as needed without weakening assertions.
- i18n: every new key must exist in both locales or the translate layer will surface
  missing-key fallbacks.
