# App Shell: Card Surfaces + Vertical Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground floating content on card surfaces and vertically center sole-content empty states across all five main app routes.

**Architecture:** Two reusable mechanisms. (1) `main` becomes a flex column and `EmptyState` gains a `fill` prop so sole-content empty states grow to center in leftover space. (2) `EmptyState` renders as a card by default; the Recipes filter toolbar and every Settings section get wrapped in the existing `Card` primitive. Per-page changes are additive; no information architecture changes.

**Tech Stack:** Next.js (App Router, server + client components), React 19, Tailwind CSS 4, existing `Card` primitive (`@/components/ui/card`), Vitest.

## Global Constraints

- Do NOT change any `EmptyState` public prop names or behavior for existing callers; only ADD an optional `fill?: boolean` (default `false`).
- Do NOT redesign Settings IA — only wrap existing sections in cards.
- Do NOT card: the Recipes title header, the Plan config-button row, the Shopping meta row. Recipe list items and Shopping category groups are already cards — leave them.
- Card surface classes must match the existing primitive: `rounded-xl border bg-card shadow-sm` (light mode relies on the border for definition).
- Preserve existing outer spacing: Settings keeps `space-y-8` between cards.
- After every task: `cd web && npm run typecheck` must pass. Commit after each task.

---

### Task 1: Foundation — `EmptyState` card + `fill`, and `main` flex column

**Files:**
- Modify: `web/components/ui/empty-state.tsx` (full rewrite of the component body)
- Modify: `web/app/(app)/layout.tsx:25` (the `<main>` className)
- Test: none (presentational; verified by typecheck + later preview)

**Interfaces:**
- Produces: `EmptyState` now accepts `fill?: boolean` (default `false`). When `fill` is true it renders a growing, centering wrapper (`flex flex-1 items-center justify-center`) around the card; when false it renders a horizontally-centered card at natural height. All other props (`icon`, `title`, `subtitle`, `action`) unchanged.

- [ ] **Step 1: Rewrite `EmptyState`**

Replace the entire contents of `web/components/ui/empty-state.tsx` with:

```tsx
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  fill = false,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  fill?: boolean;
}) {
  const card = (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground" />}
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>}
      {action}
    </div>
  );

  if (fill) {
    return <div className="flex flex-1 items-center justify-center py-8">{card}</div>;
  }

  return <div className="flex justify-center py-8">{card}</div>;
}
```

- [ ] **Step 2: Make `main` a flex column**

In `web/app/(app)/layout.tsx`, change the `<main>` className (line 25) from:

```tsx
<main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:pb-8">
```

to:

```tsx
<main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-4 md:pb-8">
```

(Added `flex min-h-0 flex-col`; `min-h-0` keeps `overflow-y-auto` working on tall content.)

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 4: Run the test suite (baseline — props unchanged)**

Run: `cd web && npm test`
Expected: all tests pass (no `EmptyState` behavior changed).

- [ ] **Step 5: Commit**

```bash
git add web/components/ui/empty-state.tsx "web/app/(app)/layout.tsx"
git commit -m "feat(web): EmptyState card surface + fill prop; main flex column"
```

---

### Task 2: Home page — fill the empty state

**Files:**
- Modify: `web/app/(app)/page.tsx:7`

**Interfaces:**
- Consumes: `EmptyState` `fill` prop from Task 1.

- [ ] **Step 1: Add `fill` to the home EmptyState**

In `web/app/(app)/page.tsx`, change line 7 from:

```tsx
  return <EmptyState icon={Home} title={t("common.appName")} subtitle={t("nav.recipes")} />;
```

to:

```tsx
  return <EmptyState fill icon={Home} title={t("common.appName")} subtitle={t("nav.recipes")} />;
```

(No wrapper needed: the fill wrapper is the direct child of the flex-column `main`, so `flex-1` resolves.)

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(app)/page.tsx"
git commit -m "feat(web): center home placeholder in available space"
```

---

### Task 3: Recipes — card the filter toolbar, fill empty states

**Files:**
- Modify: `web/app/(app)/recipes/page.tsx` (import `Card`; line 44 root div; lines 66-73 wrap `RecipeFilters`; lines 77-81 and 83-95 empty states)

**Interfaces:**
- Consumes: `EmptyState` `fill` from Task 1; `Card` from `@/components/ui/card`.

- [ ] **Step 1: Import `Card`**

In `web/app/(app)/recipes/page.tsx`, add to the imports block (after the existing `Button` import on line 8):

```tsx
import { Card } from "@/components/ui/card";
```

- [ ] **Step 2: Make the page root a growing flex column**

Change line 44 from:

```tsx
    <div className="space-y-4">
```

to:

```tsx
    <div className="flex flex-1 flex-col gap-4">
```

- [ ] **Step 3: Wrap `RecipeFilters` in a `Card`**

Replace the `RecipeFilters` block (lines 65-73) — the comment plus the element — with:

```tsx
      {/* RecipeFilters is a client island — pass only serializable props, NO t function */}
      <Card className="p-3">
        <RecipeFilters
          list={list}
          q={q}
          sort={sort}
          tags={tagIds}
          allTags={allTags}
          locale={locale}
        />
      </Card>
```

- [ ] **Step 4: Add `fill` to both empty-state branches**

In the `totalCount === 0` block, add `fill` to both `EmptyState` elements. The no-search-results one becomes:

```tsx
          <EmptyState
            fill
            icon={Search}
            title={t("recipes.noSearchResults")}
            subtitle={t("recipes.noSearchResultsSubtitle")}
          />
```

and the no-recipes one becomes:

```tsx
          <EmptyState
            fill
            icon={BookOpen}
            title={t("recipes.noRecipesTitle")}
            subtitle={t("recipes.noRecipesSubtitle")}
            action={
              <Button asChild>
                <Link href={`/recipes/new?list=${list}`}>
                  <Plus size={16} />
                  {t("recipes.addFirstRecipe")}
                </Link>
              </Button>
            }
          />
```

(The `RecipeList` branch is unchanged — with recipes present it flows from the top.)

- [ ] **Step 5: Typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add "web/app/(app)/recipes/page.tsx"
git commit -m "feat(web): card the recipe filter toolbar and center empty states"
```

---

### Task 4: Plan — fill the "no plan" empty state

**Files:**
- Modify: `web/app/(app)/plan/page.tsx:21` (no-plan branch root) and `:23` (its EmptyState)

**Interfaces:**
- Consumes: `EmptyState` `fill` from Task 1.

- [ ] **Step 1: Make the no-plan branch root grow and fill**

In `web/app/(app)/plan/page.tsx`, in the early-return `if (!plan || plan.iterations.length === 0)` block, change line 21 from:

```tsx
      <div className="space-y-4">
```

to:

```tsx
      <div className="flex flex-1 flex-col gap-4">
```

- [ ] **Step 2: Add `fill` to that branch's EmptyState**

Change the EmptyState on lines 23-34 to add `fill` as the first prop:

```tsx
        <EmptyState
          fill
          icon={Calendar}
          title={t("plan.noPlanTitle")}
          subtitle={t("plan.noPlanSubtitle")}
          action={
            <GeneratePlanDrawer
              triggerLabel={t("plan.setup")}
              tags={tags}
              triggerClassName="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            />
          }
        />
```

(The main return with iterations is unchanged. The inline "no active iteration" `EmptyState` on lines 81-86 stays WITHOUT `fill` — it renders as a natural-height card among the iteration cards.)

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add "web/app/(app)/plan/page.tsx"
git commit -m "feat(web): center the no-plan empty state"
```

---

### Task 5: Shopping — fill empty and all-done states

**Files:**
- Modify: `web/components/shopping/shopping-list-view.tsx` (empty branch lines 22-36, all-done branch lines 40-54)

**Interfaces:**
- Consumes: `EmptyState` `fill` from Task 1.

- [ ] **Step 1: Fill the empty (no list) branch**

In `web/components/shopping/shopping-list-view.tsx`, change the `if (!list || list.items.length === 0)` return. Change its root `<div className="space-y-4">` (line 23) to `<div className="flex flex-1 flex-col gap-4">` and add `fill` to the `EmptyState`:

```tsx
    return (
      <div className="flex flex-1 flex-col gap-4">
        {title}
        <EmptyState
          fill
          icon={ShoppingCart}
          title={t("shopping.emptyTitle")}
          subtitle={t("shopping.emptySubtitle")}
          action={
            <Link href="/plan" className="text-sm font-medium text-primary hover:underline">
              {t("shopping.goToPlan")}
            </Link>
          }
        />
      </div>
    );
```

- [ ] **Step 2: Fill the all-done branch**

Change the `if (list.items.every((i) => i.isChecked))` return the same way — root to `<div className="flex flex-1 flex-col gap-4">` and add `fill`:

```tsx
    return (
      <div className="flex flex-1 flex-col gap-4">
        {title}
        <EmptyState
          fill
          icon={CheckCircle}
          title={t("shopping.allDoneTitle")}
          subtitle={t("shopping.allDoneSubtitle")}
          action={
            <Link href="/plan" className="text-sm font-medium text-primary hover:underline">
              {t("shopping.backToPlan")}
            </Link>
          }
        />
      </div>
    );
```

(The populated return — meta row + `ShoppingCategory` list — is unchanged; categories are already cards.)

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add web/components/shopping/shopping-list-view.tsx
git commit -m "feat(web): center shopping empty and all-done states"
```

---

### Task 6: Settings — wrap sections in cards

**Files:**
- Modify: `web/app/(app)/settings/settings-client.tsx` (import `Card`; five `<section>` blocks lines 46-89)
- Modify: `web/app/(app)/settings/account-section.tsx` (import `Card`; the returned `<section>` lines 48-63)

**Interfaces:**
- Consumes: `Card` from `@/components/ui/card`.

- [ ] **Step 1: Import `Card` in `settings-client.tsx`**

Add after the existing `Button` import (line 9):

```tsx
import { Card } from "@/components/ui/card";
```

- [ ] **Step 2: Wrap each of the five sections in a `Card`**

Replace the five `<section className="space-y-2">…</section>` blocks (lines 46-89) with `Card` wrappers. The outer `<div className="space-y-8">` stays. Result:

```tsx
    <div className="space-y-8">
      <Card className="space-y-2 p-4">
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
      </Card>

      <Card className="space-y-2 p-4">
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
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-medium">{t("tags.manageTags")}</h2>
        <Button asChild variant="outline"><Link href="/settings/tags">{t("tags.manageLink")}</Link></Button>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-medium">{t("aiSettings.title")}</h2>
        <Button asChild variant="outline"><Link href="/settings/ai">{t("aiSettings.link")}</Link></Button>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-medium">{t("nav.manageHousehold")}</h2>
        <Button asChild variant="outline"><Link href="/settings/household">{t("nav.manageHousehold")}</Link></Button>
      </Card>

      <AccountSection email={email} hasPassword={hasPassword} hasPasskey={hasPasskey} />
    </div>
```

- [ ] **Step 3: Import `Card` in `account-section.tsx`**

Add after the existing `Button` import (line 9):

```tsx
import { Card } from "@/components/ui/card";
```

- [ ] **Step 4: Wrap the account section in a `Card`**

Change the returned `<section className="space-y-4">…</section>` (lines 48-63) to a `Card`:

```tsx
    <Card className="space-y-4 p-4">
      <h2 className="text-sm font-medium">{t("settings.account")}</h2>

      <p className="text-sm text-muted-foreground">{email}</p>

      <PasswordForm hasPassword={hasPassword} hasPasskey={hasPasskey} />

      <PasskeySection hasPassword={hasPassword} />

      <Button variant="destructive" className="w-full" onClick={handleLogout}>
        <LogOut size={16} />
        {t("settings.logout")}
      </Button>

      {dialog}
    </Card>
```

- [ ] **Step 5: Typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add "web/app/(app)/settings/settings-client.tsx" "web/app/(app)/settings/account-section.tsx"
git commit -m "feat(web): wrap settings sections in card surfaces"
```

---

### Task 7: Full preview verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use `preview_start` with the web dev config (create `.claude/launch.json` with a `web` config running `npm run dev` on the Next.js port if none exists). Then load the app authenticated (an existing user session).

- [ ] **Step 2: Verify each empty/sparse state is a centered card**

Navigate and confirm via `preview_snapshot` / `preview_screenshot`:
- `/recipes` with no recipes → empty state is a centered card, filter toolbar is inside a card, content is NOT hugging the top.
- `/recipes?q=zzzznotarecipe` → no-results centered card.
- `/plan` with no plan → centered card.
- `/shopping` with no list, and with an all-checked list → centered card.
- `/` (home) → centered placeholder card.
- `/settings` → five distinct section cards + account card; page fills naturally.

- [ ] **Step 3: Verify content-present layouts are unchanged**

- `/recipes` with recipes → list flows from the top, toolbar card present, no giant gap.
- `/shopping` with unchecked items → categories render as before; verify the page scrolls when the list is tall (confirms `min-h-0` on `main`).

- [ ] **Step 4: Verify light + dark + mobile**

- `preview_resize` `colorScheme: light` → card borders visible on recipes empty state and settings.
- `preview_resize` `colorScheme: dark` → card surfaces read as elevated.
- `preview_resize` preset `mobile` → cards are full-width, no horizontal overflow.

- [ ] **Step 5: Run the test suite one final time**

Run: `cd web && npm test`
Expected: all tests pass.

- [ ] **Step 6: Capture proof**

Take `preview_screenshot` of `/recipes` (empty) and `/settings` to share the before/after improvement.

---

## Self-Review

**Spec coverage:**
- Mechanism 1 (main flex + fill prop) → Task 1. ✓
- Mechanism 2 (EmptyState card) → Task 1. ✓
- Home fill → Task 2. ✓
- Recipes toolbar card + fill → Task 3. ✓
- Plan no-plan fill; no-active stays inline → Task 4. ✓
- Shopping empty + all-done fill; categories untouched → Task 5. ✓
- Settings sections + account card → Task 6. ✓
- Verification (light/dark/mobile, content-present unchanged) → Task 7. ✓
- Non-goals respected: no title/config-row/meta-row carding; no Settings IA change. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Task 7 references `.claude/launch.json` creation conditionally with the exact command to run. ✓

**Type consistency:** `fill?: boolean` prop defined in Task 1 is the same name used in Tasks 2-5. `Card` import path `@/components/ui/card` consistent across Tasks 3 and 6. ✓
