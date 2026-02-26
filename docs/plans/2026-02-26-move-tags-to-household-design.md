# Move Tags to Household Page + Reset to Defaults

## Problem
Tag management UI lives on the Settings page, but tags are per-household. It belongs on the Household page. Additionally, there's no way to restore deleted default tags — users need a "Reset to Defaults" button that wipes all tags and re-seeds the 37 built-in defaults.

## Design

### Backend
- New endpoint: `POST /api/v1/tags/reset/` — owner-only, deletes ALL tags for the household, re-seeds defaults, returns grouped tags
- This is destructive: removes all custom tags and all recipe-tag associations

### Frontend
- Move the "Manage Tags" section from `SettingsPage.tsx` to `HouseholdPage.tsx` (after AI Settings, before danger zone)
- Add `useResetTags()` mutation hook
- Add "Reset to Defaults" button with confirmation dialog warning about data loss
- Remove tag management section and related state/imports from SettingsPage
- Add i18n keys for reset functionality (EN + DE)
