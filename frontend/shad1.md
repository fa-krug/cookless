# shad1 — Foundation & Theming

**Goal:** Set up shadcn/ui infrastructure with zero visual changes.

## Decisions Applied

| Question | Choice |
|----------|--------|
| Style | Default (rounded, softer) |
| Theming | Full token system |
| Forms | RHF + zod (installed here, used in shad7) |
| Mobile selects | Radix everywhere |
| Dark mode | Yes (variables here, activation in shad9) |
| Toasts | Sonner (shad4) |
| Overlays | Replace all with Radix (shad3) |
| Tests | Fix as we go |

## Scope

- Install `tailwind-merge`, `clsx`, `class-variance-authority` (shadcn peer deps)
- Create `src/lib/utils.ts` with `cn()` utility
- Create `components.json` (shadcn config — Default style, orange primary)
- Remap CSS variables in `src/index.css`: full token system (`--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`, `--border`, `--ring`, etc.) mapped to current palette (orange-500 as primary, gray tones for secondary/muted)
- Add dark mode variables alongside light ones
- No components replaced yet — existing UI unchanged

## New Dependencies

- `tailwind-merge`
- `clsx`
- `class-variance-authority`

## Files Changed

- `package.json` / `package-lock.json`
- `src/index.css` (CSS variable token system)
- New `src/lib/utils.ts` (`cn()` helper)
- New `components.json` (shadcn CLI config)

## Files Removed

None.

## Tests

None affected — infrastructure only.
