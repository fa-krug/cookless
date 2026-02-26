# Move Tags to Household Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move tag management from Settings to Household page and add a reset-to-defaults button.

**Architecture:** New backend endpoint for tag reset (delete all + re-seed). Frontend moves existing tag management JSX from SettingsPage to HouseholdPage and adds reset button with confirmation.

**Tech Stack:** Django Ninja, React, TanStack React Query, react-i18next

---

### Task 1: Backend — Add reset tags endpoint + test

**Files:**
- Modify: `backend/recipes/api.py:558-599`
- Modify: `backend/recipes/tag_defaults.py`
- Test: `backend/recipes/tests/test_tags.py`

**Step 1: Write the failing test**

Add to `backend/recipes/tests/test_tags.py`:

```python
@pytest.mark.django_db
def test_reset_tags_deletes_all_and_reseeds(auth_client):
    client, household = auth_client
    # Add a custom tag
    Tag.objects.create(
        household=household, category=TagCategory.CUISINE,
        name_en="Korean", name_de="Koreanisch", is_default=False,
    )
    # Delete a default tag
    Tag.objects.filter(household=household, name_en="Paleo").delete()
    # Rename a default tag
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    tag.name_en = "Strict Vegan"
    tag.save()

    response = client.post("/api/v1/tags/reset/")
    assert response.status_code == 200
    data = response.json()

    # All defaults restored, custom tag gone
    tags = Tag.objects.filter(household=household)
    assert tags.count() == 37
    assert all(t.is_default for t in tags)
    assert not tags.filter(name_en="Korean").exists()
    assert tags.filter(name_en="Vegan").exists()  # restored original name
    assert not tags.filter(name_en="Strict Vegan").exists()

    # Response is grouped tags
    assert "DIETARY" in data
    assert len(data["DIETARY"]) == 10


@pytest.mark.django_db
def test_reset_tags_clears_recipe_associations(auth_client):
    client, household = auth_client
    tag = Tag.objects.filter(household=household, name_en="Vegan").first()
    recipe = Recipe.objects.create(
        household=household, title="Salad", list_type="KNOWN", default_servings=2
    )
    recipe.tags.add(tag)

    response = client.post("/api/v1/tags/reset/")
    assert response.status_code == 200
    recipe.refresh_from_db()
    assert recipe.tags.count() == 0
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/recipes/tests/test_tags.py::test_reset_tags_deletes_all_and_reseeds backend/recipes/tests/test_tags.py::test_reset_tags_clears_recipe_associations -v`
Expected: FAIL — endpoint doesn't exist (404)

**Step 3: Implement the reset endpoint**

In `backend/recipes/api.py`, after the `delete_tag` endpoint (~line 599), add:

```python
@router.post("/tags/reset/", response=GroupedTagsOut, tags=["tags"])
def reset_tags(request):
    require_household_member(request)
    household = request.user.active_household
    Tag.objects.filter(household=household).delete()
    seed_default_tags(household)
    tags = Tag.objects.filter(household=household)
    grouped: dict[str, list[Tag]] = {cat.value: [] for cat in TagCategory}
    for tag in tags:
        grouped[tag.category].append(tag)
    return grouped
```

Add `seed_default_tags` to the imports at the top of `api.py`:

```python
from recipes.tag_defaults import seed_default_tags
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/recipes/api.py backend/recipes/tests/test_tags.py
git commit -m "feat: add POST /api/v1/tags/reset/ endpoint"
```

---

### Task 2: Frontend — Add i18n keys

**Files:**
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add translation keys**

In both `en.json` and `de.json`, add to the `tags` section:

English:
```json
"resetToDefaults": "Reset to Defaults",
"resetConfirm": "This will delete all tags (including custom ones) and remove them from your recipes. Start fresh with the defaults?",
"resetSuccess": "Tags reset to defaults!"
```

German:
```json
"resetToDefaults": "Auf Standard zurücksetzen",
"resetConfirm": "Das löscht alle Tags (auch eigene) und entfernt sie von deinen Rezepten. Mit den Standards neu starten?",
"resetSuccess": "Tags auf Standard zurückgesetzt!"
```

Also add error keys to the `errors` section:

English: `"tagsReset": "Couldn't reset tags. Try again?"`
German: `"tagsReset": "Tags zurücksetzen hat nicht geklappt. Nochmal?"`

**Step 2: Commit**

```bash
git add frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: add i18n keys for tag reset"
```

---

### Task 3: Frontend — Add useResetTags hook

**Files:**
- Modify: `frontend/src/hooks/useTags.ts`

**Step 1: Add the mutation hook**

Add to `frontend/src/hooks/useTags.ts`:

```typescript
export function useResetTags() {
  const queryClient = useQueryClient();
  return useMutation<GroupedTags, Error, void>({
    mutationFn: () => api.post("/api/v1/tags/reset/"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useTags.ts
git commit -m "feat: add useResetTags mutation hook"
```

---

### Task 4: Frontend — Move tag management to HouseholdPage

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Add tag management to HouseholdPage**

Add imports to `HouseholdPage.tsx`:
```typescript
import { TAG_CATEGORIES, type TagCategory } from "../api/types";
import { useCreateTag, useDeleteTag, useResetTags, useTags, useUpdateTag } from "../hooks/useTags";
import { RotateCcw, Tags } from "lucide-react";
```

Add tag state variables inside the `HouseholdPage` component (after existing state):
```typescript
// Tag state
const { data: groupedTags } = useTags();
const createTag = useCreateTag();
const updateTag = useUpdateTag();
const deleteTag = useDeleteTag();
const resetTags = useResetTags();
const [editingTag, setEditingTag] = useState<string | null>(null);
const [editNameEn, setEditNameEn] = useState("");
const [editNameDe, setEditNameDe] = useState("");
const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
const [newTagEn, setNewTagEn] = useState("");
const [newTagDe, setNewTagDe] = useState("");
```

Add the `useTranslation` destructuring to also include `i18n` (change `const { t } = useTranslation()` to `const { t, i18n } = useTranslation()`).

Add the tag management section JSX after the AI Settings section and before the Leave/Delete sections. This is the same tag management UI from SettingsPage, wrapped in an `activeHousehold && (...)` guard, with a "Reset to Defaults" button in the header:

```tsx
{/* Manage Tags */}
{activeHousehold && (
  <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Tags size={20} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">{t("tags.manageTags")}</h2>
      </div>
      <button
        onClick={async () => {
          const confirmed = await confirm({
            title: t("tags.resetToDefaults"),
            message: t("tags.resetConfirm"),
            confirmVariant: "danger",
            cancelLabel: t("common.cancel"),
          });
          if (confirmed) {
            resetTags.mutate(undefined, {
              onSuccess: () => addToast(t("tags.resetSuccess"), "success"),
              onError: () => addToast(t("errors.tagsReset"), "error"),
            });
          }
        }}
        disabled={resetTags.isPending}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        {resetTags.isPending ? <Spinner /> : <RotateCcw size={14} />}
        {t("tags.resetToDefaults")}
      </button>
    </div>
    <div className="space-y-3">
      {/* Copy the exact tag category details/summary blocks from SettingsPage lines 288-443 */}
    </div>
  </div>
)}
```

The inner tag management JSX (the `TAG_CATEGORIES.map(...)` block) is copied verbatim from `SettingsPage.tsx` lines 288-443.

**Step 2: Remove tag management from SettingsPage**

Remove from `SettingsPage.tsx`:
- Tag-related imports: `TAG_CATEGORIES`, `TagCategory`, `useCreateTag`, `useDeleteTag`, `useTags`, `useUpdateTag`
- Tag state variables (lines 53-63): `groupedTags`, `createTag`, `updateTag`, `deleteTag`, `editingTag`, `editNameEn`, `editNameDe`, `addingCategory`, `newTagEn`, `newTagDe`
- The entire "Manage Tags" JSX section (lines 284-445)

**Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx frontend/src/pages/SettingsPage.tsx
git commit -m "feat: move tag management to household page, add reset to defaults"
```

---

### Task 5: Run all tests

**Step 1: Run backend tests**

Run: `pytest backend/recipes/tests/test_tags.py -v`
Expected: ALL PASS

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Run pre-commit**

Run: `pre-commit run --all-files`
Expected: All checks pass

**Step 4: Final commit if any fixes needed**
