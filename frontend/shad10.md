# shad10 — Cleanup & Final Audit

**Goal:** Remove all legacy code, audit bundle, ensure consistency.

## Scope

- Remove any remaining old UI components not yet deleted
- Remove unused CSS (old animations if replaced)
- Remove unused dependencies from `package.json`
- Audit bundle size (`npm run build` + check chunk sizes)
- Full lint pass (`npm run lint`)
- Full test suite run (`npm test`)
- Visual audit of every page (light + dark)
- Update `CLAUDE.md` / `frontend/CLAUDE.md` if component patterns changed

## New Dependencies

None.

## Files Changed

- `package.json` (remove unused deps)
- `src/index.css` (remove unused animations/variables)
- `CLAUDE.md` / `frontend/CLAUDE.md` (update component docs)

## Files Removed

- Any leftover old components
- Dead imports

## Tests

Full green suite — all tests must pass.
