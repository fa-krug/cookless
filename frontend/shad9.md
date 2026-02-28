# shad9 — Dark Mode Activation

**Goal:** Wire up the dark mode CSS variables and add a UI toggle.

## Scope

- Add shadcn-compatible theme provider (`next-themes` or custom ~20 lines)
- Add theme toggle to SettingsPage (Light / Dark / System)
- Persist preference to localStorage
- On mount, read preference and set `dark` class on `<html>`
- Ensure all shadcn components + custom components respect `dark:` variants
- Audit every page for dark mode visual bugs (contrast, borders, shadows)
- Add i18n strings for theme settings (EN + DE)
- Update `src/index.css` dark mode variables to align with shadcn's token system (from shad1)

## New Dependencies

- `next-themes` (optional — or implement custom provider)

## Files Changed

- New `src/components/theme-provider.tsx` (or use `next-themes`)
- `src/components/AppProviders.tsx` (wrap with ThemeProvider)
- `src/pages/SettingsPage.tsx` (add theme selector)
- `src/index.css` (audit/adjust dark mode variables)
- `src/i18n/en.json` (add theme strings)
- `src/i18n/de.json` (add theme strings)
- Various pages/components for dark mode fixes

## Files Removed

None.

## Tests

Add theme toggle test, verify dark class application.
