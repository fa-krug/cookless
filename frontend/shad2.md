# shad2 — Form Primitives

**Goal:** Replace hand-rolled form inputs with shadcn equivalents + install form tooling.

## Scope

- Add shadcn: **Button**, **Input**, **Label**, **Select** (Radix), **Textarea**, **Checkbox**
- Install `react-hook-form`, `zod`, `@hookform/resolvers`
- Add shadcn **Form** component (wires RHF + Label + error messages)
- Replace `components/ui/Input.tsx` → shadcn Input
- Replace `components/ui/Select.tsx` → shadcn Select (Radix everywhere)
- Replace `components/ui/Textarea.tsx` → shadcn Textarea
- Replace all inline button styles (`bg-orange-500 px-5 py-2.5...`) → `<Button>` with variants (default/secondary/destructive/outline/ghost)
- Replace `components/ui/SortSelect.tsx` → shadcn Select
- Update all imports across pages/components

## New Dependencies

- `@radix-ui/react-select`
- `@radix-ui/react-label`
- `@radix-ui/react-checkbox`
- `@radix-ui/react-slot`
- `react-hook-form`
- `zod`
- `@hookform/resolvers`

## Files Changed

- New `src/components/ui/button.tsx` (shadcn)
- New `src/components/ui/input.tsx` (shadcn, replaces old)
- New `src/components/ui/label.tsx` (shadcn)
- New `src/components/ui/select.tsx` (shadcn, replaces old)
- New `src/components/ui/textarea.tsx` (shadcn, replaces old)
- New `src/components/ui/checkbox.tsx` (shadcn)
- New `src/components/ui/form.tsx` (shadcn)
- All pages and components that use buttons, inputs, selects, or textareas (import updates + prop changes)

## Files Removed

- Old `src/components/ui/Input.tsx`
- Old `src/components/ui/Select.tsx`
- Old `src/components/ui/Textarea.tsx`
- Old `src/components/ui/SortSelect.tsx`

## Tests

Update all tests that query buttons/inputs/selects — new DOM structure from Radix Select, new class names on Button variants.
