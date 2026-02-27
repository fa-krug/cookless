# Recipe List Declutter Design

## Problem

The recipe list page on mobile has too many controls competing for space: search bar, two action buttons, sort dropdown, and four tag filter pills. The tag dropdowns overlap recipe cards awkwardly. Overall visual overload.

## Solution

### 1. Replace tag filter pills with a single Filter button

Remove the 4 tag category `<details>` pills from the main page. Replace with a compact toolbar row:

```
[Name A-Z ▾]  [Filter (2)]
```

- Sort dropdown: unchanged, left-aligned
- Filter button: right-aligned, shows Lucide `SlidersHorizontal` icon + "Filter" label + orange badge with active count (hidden when 0)

### 2. Filter drawer via ResponsiveOverlay

Tapping the Filter button opens a ResponsiveOverlay (Drawer on mobile, Modal on desktop) containing:
- All 4 tag categories as labeled sections (DIETARY, PROTEIN, CUISINE, MEAL_TYPE)
- Checkboxes per tag within each section, same styling as current dropdowns
- "Clear all" button at bottom when any filters are active
- Live updates — no "Apply" button needed

### 3. Tighten spacing

- Reduce `mt-4` gaps to `mt-3` between header/tabs and between tabs/search row

## Out of Scope

- No changes to search bar, action buttons, recipe cards, or backend
- No changes to sort functionality
- No changes to RecipeCard component
