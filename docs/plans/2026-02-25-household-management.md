# Household Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full household management — delete household, leave household, transfer ownership, edit name UI, and household name in navigation.

**Architecture:** Three new backend endpoints (delete, leave, transfer-ownership) following existing patterns in `backend/users/api.py`. Frontend adds hooks, updates HouseholdPage with new sections, and adds household name to BottomNav/Layout.

**Tech Stack:** Django Ninja, React, TanStack React Query, Tailwind CSS, react-i18next, Lucide icons

---

### Task 1: Backend — Delete Household Endpoint

**Files:**
- Modify: `backend/users/api.py:115-160` (households section)
- Test: `backend/users/tests/test_api.py`

**Step 1: Write the failing tests**

Add to `backend/users/tests/test_api.py`:

```python
@pytest.mark.django_db
class TestHouseholdDelete:
    def test_owner_deletes_household_sole_member(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/")
        assert resp.status_code == 204
        assert not Household.objects.filter(pk=household.pk).exists()
        user.refresh_from_db()
        assert user.active_household is None

    def test_owner_deletes_household_switches_to_next(self, api_client, user, household):
        h2 = Household.objects.create(name="Second Home")
        HouseholdMember.objects.create(household=h2, user=user, role=HouseholdMember.Role.MEMBER)
        api_client.force_login(user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/")
        assert resp.status_code == 204
        user.refresh_from_db()
        assert user.active_household == h2

    def test_owner_cannot_delete_with_other_members(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/")
        assert resp.status_code == 409
        assert Household.objects.filter(pk=household.pk).exists()

    def test_member_cannot_delete_household(self, api_client, other_user, household):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(other_user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/")
        assert resp.status_code == 403

    def test_non_member_cannot_delete_household(self, api_client, other_user, household):
        api_client.force_login(other_user)
        resp = api_client.delete(f"/api/v1/households/{household.pk}/")
        assert resp.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_api.py::TestHouseholdDelete -v`
Expected: FAIL (endpoint doesn't exist yet)

**Step 3: Implement the endpoint**

Add to `backend/users/api.py` after the `switch_household` function (after line 159):

```python
@router.delete("/households/{household_id}/", response={204: None}, tags=["households"])
def delete_household(request, household_id: UUID):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    member_count = household.members.count()
    if member_count > 1:
        raise HttpError(409, "Remove all other members before deleting.")
    household.delete()
    # Auto-switch active household
    if request.user.active_household_id == household_id:
        next_membership = request.user.household_memberships.select_related("household").first()
        request.user.active_household = next_membership.household if next_membership else None
        request.user.save()
    return None
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_api.py::TestHouseholdDelete -v`
Expected: PASS

**Step 5: Run linting**

Run: `ruff check backend/users/ --fix && ruff format backend/users/`

**Step 6: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_api.py
git commit -m "feat: add delete household endpoint"
```

---

### Task 2: Backend — Leave Household Endpoint

**Files:**
- Modify: `backend/users/api.py` (after delete_household)
- Test: `backend/users/tests/test_api.py`

**Step 1: Write the failing tests**

```python
@pytest.mark.django_db
class TestHouseholdLeave:
    def test_member_leaves_household(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        other_user.active_household = household
        other_user.save()
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/leave/")
        assert resp.status_code == 200
        assert not HouseholdMember.objects.filter(household=household, user=other_user).exists()
        other_user.refresh_from_db()
        assert other_user.active_household is None

    def test_member_leaves_switches_to_next(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        h2 = Household.objects.create(name="Other Home")
        HouseholdMember.objects.create(household=h2, user=other_user, role=HouseholdMember.Role.OWNER)
        other_user.active_household = household
        other_user.save()
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/leave/")
        assert resp.status_code == 200
        other_user.refresh_from_db()
        assert other_user.active_household == h2

    def test_owner_cannot_leave_with_other_members(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/leave/")
        assert resp.status_code == 409

    def test_owner_can_leave_sole_member(self, api_client, user, household):
        api_client.force_login(user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/leave/")
        assert resp.status_code == 200
        assert not HouseholdMember.objects.filter(household=household, user=user).exists()

    def test_non_member_cannot_leave(self, api_client, other_user, household):
        api_client.force_login(other_user)
        resp = api_client.post(f"/api/v1/households/{household.pk}/leave/")
        assert resp.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_api.py::TestHouseholdLeave -v`

**Step 3: Implement the endpoint**

Add to `backend/users/api.py` after `delete_household`:

```python
@router.post("/households/{household_id}/leave/", response=MessageOut, tags=["households"])
def leave_household(request, household_id: UUID):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    membership = HouseholdMember.objects.get(household=household, user=request.user)
    if membership.role == HouseholdMember.Role.OWNER and household.members.count() > 1:
        raise HttpError(409, "Transfer ownership before leaving.")
    membership.delete()
    # Auto-switch active household
    if request.user.active_household_id == household_id:
        next_membership = request.user.household_memberships.select_related("household").first()
        request.user.active_household = next_membership.household if next_membership else None
        request.user.save()
    return {"detail": "Left household."}
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_api.py::TestHouseholdLeave -v`

**Step 5: Run linting**

Run: `ruff check backend/users/ --fix && ruff format backend/users/`

**Step 6: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_api.py
git commit -m "feat: add leave household endpoint"
```

---

### Task 3: Backend — Transfer Ownership Endpoint

**Files:**
- Modify: `backend/users/api.py` (after leave_household)
- Test: `backend/users/tests/test_api.py`

**Step 1: Write the failing tests**

```python
@pytest.mark.django_db
class TestTransferOwnership:
    def test_owner_transfers_to_member(self, api_client, user, household, other_user):
        other_membership = HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        api_client.force_login(user)
        resp = api_client.post(
            f"/api/v1/households/{household.pk}/members/{other_membership.pk}/transfer-ownership/"
        )
        assert resp.status_code == 200
        other_membership.refresh_from_db()
        assert other_membership.role == HouseholdMember.Role.OWNER
        owner_membership = HouseholdMember.objects.get(household=household, user=user)
        assert owner_membership.role == HouseholdMember.Role.MEMBER

    def test_member_cannot_transfer(self, api_client, user, household, other_user):
        HouseholdMember.objects.create(
            household=household, user=other_user, role=HouseholdMember.Role.MEMBER
        )
        owner_membership = HouseholdMember.objects.get(household=household, user=user)
        api_client.force_login(other_user)
        resp = api_client.post(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/transfer-ownership/"
        )
        assert resp.status_code == 403

    def test_cannot_transfer_to_self(self, api_client, user, household):
        owner_membership = HouseholdMember.objects.get(household=household, user=user)
        api_client.force_login(user)
        resp = api_client.post(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/transfer-ownership/"
        )
        assert resp.status_code == 400

    def test_non_member_cannot_transfer(self, api_client, other_user, household):
        owner_membership = HouseholdMember.objects.get(household=household)
        api_client.force_login(other_user)
        resp = api_client.post(
            f"/api/v1/households/{household.pk}/members/{owner_membership.pk}/transfer-ownership/"
        )
        assert resp.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `pytest backend/users/tests/test_api.py::TestTransferOwnership -v`

**Step 3: Implement the endpoint**

Add to `backend/users/api.py` after `leave_household`:

```python
@router.post(
    "/households/{household_id}/members/{member_pk}/transfer-ownership/",
    response=MessageOut,
    tags=["households"],
)
def transfer_ownership(request, household_id: UUID, member_pk: int):
    household = get_object_or_404(
        Household.objects.filter(members__user=request.user), pk=household_id
    )
    require_household_owner(request, household)
    target_member = get_object_or_404(HouseholdMember, pk=member_pk, household=household)
    if target_member.user == request.user:
        raise HttpError(400, "Cannot transfer ownership to yourself.")
    # Demote current owner, promote target
    current_membership = HouseholdMember.objects.get(household=household, user=request.user)
    current_membership.role = HouseholdMember.Role.MEMBER
    current_membership.save()
    target_member.role = HouseholdMember.Role.OWNER
    target_member.save()
    return {"detail": "Ownership transferred."}
```

**Step 4: Run tests to verify they pass**

Run: `pytest backend/users/tests/test_api.py::TestTransferOwnership -v`

**Step 5: Run linting and full test suite**

Run: `ruff check backend/users/ --fix && ruff format backend/users/ && pytest backend/users/tests/test_api.py -v`

**Step 6: Commit**

```bash
git add backend/users/api.py backend/users/tests/test_api.py
git commit -m "feat: add transfer ownership endpoint"
```

---

### Task 4: Frontend — New Hooks and i18n Keys

**Files:**
- Modify: `frontend/src/hooks/useHousehold.ts`
- Modify: `frontend/src/i18n/en.json`
- Modify: `frontend/src/i18n/de.json`

**Step 1: Add new hooks to `frontend/src/hooks/useHousehold.ts`**

Add after the existing `useRemoveMember` hook:

```typescript
export function useUpdateHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Household>(`/api/v1/households/${id}/`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useDeleteHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/households/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useLeaveHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<MessageOut>(`/api/v1/households/${id}/leave/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}

export function useTransferOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ householdId, memberId }: { householdId: string; memberId: number }) =>
      api.post<MessageOut>(
        `/api/v1/households/${householdId}/members/${memberId}/transfer-ownership/`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
    },
  });
}
```

**Step 2: Add new i18n keys to `frontend/src/i18n/en.json`**

Add to the `household` section:

```json
"editName": "Rename",
"deleteHousehold": "Delete Household",
"deleteConfirm": "Type \"{{name}}\" to confirm deletion:",
"deleteConfirmPlaceholder": "Household name",
"transferOwnership": "Make Owner",
"transferOwnershipConfirm": "Transfer ownership to {{email}}?",
"cannotDeleteHasMembers": "Remove all other members first.",
"cannotLeaveAsOwner": "Transfer ownership before leaving."
```

Add to the `errors` section:

```json
"householdDelete": "Couldn't delete the household.",
"householdLeave": "Couldn't leave the household.",
"ownershipTransfer": "Couldn't transfer ownership."
```

Add to the `success` section:

```json
"householdDeleted": "Household deleted.",
"householdLeft": "You left the household.",
"ownershipTransferred": "Ownership transferred!"
```

**Step 3: Add corresponding German keys to `frontend/src/i18n/de.json`**

Add to the `household` section:

```json
"editName": "Umbenennen",
"deleteHousehold": "Haushalt löschen",
"deleteConfirm": "Gib \"{{name}}\" ein, um das Löschen zu bestätigen:",
"deleteConfirmPlaceholder": "Haushaltsname",
"transferOwnership": "Zum Eigentümer machen",
"transferOwnershipConfirm": "Eigentümerschaft an {{email}} übertragen?",
"cannotDeleteHasMembers": "Entferne zuerst alle anderen Mitglieder.",
"cannotLeaveAsOwner": "Übertrage zuerst die Eigentümerschaft."
```

Add to `errors`:

```json
"householdDelete": "Haushalt konnte nicht gelöscht werden.",
"householdLeave": "Haushalt konnte nicht verlassen werden.",
"ownershipTransfer": "Eigentümerschaft konnte nicht übertragen werden."
```

Add to `success`:

```json
"householdDeleted": "Haushalt gelöscht.",
"householdLeft": "Du hast den Haushalt verlassen.",
"ownershipTransferred": "Eigentümerschaft übertragen!"
```

**Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`

**Step 5: Commit**

```bash
git add frontend/src/hooks/useHousehold.ts frontend/src/i18n/en.json frontend/src/i18n/de.json
git commit -m "feat: add household management hooks and i18n keys"
```

---

### Task 5: Frontend — Household Name in Navigation

**Files:**
- Modify: `frontend/src/components/BottomNav.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Add household name to the sidebar and a mobile top bar**

In `frontend/src/components/BottomNav.tsx`:
- Import `useAuth` from `../hooks/useAuth` and `Link` from `react-router-dom`
- After the `<AppLogo>` div in the desktop sidebar (line 117), add a tappable household name that links to `/household`
- Before the mobile bottom `<nav>`, add a mobile top bar with the household name

Desktop sidebar addition (after the AppLogo div, before the nav items):

```tsx
{user?.active_household && (
  <Link
    to="/household"
    className="mx-3 mb-2 block truncate rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900"
  >
    {user.active_household.name}
  </Link>
)}
```

Mobile top bar (rendered above the Outlet in Layout.tsx or as part of BottomNav):

In `frontend/src/components/Layout.tsx`, add a mobile top bar inside the main content div, before `<InstallBanner />`:

```tsx
{user.active_household && (
  <Link
    to="/household"
    className="flex items-center border-b border-gray-200 px-4 py-2 md:hidden"
  >
    <span className="truncate text-sm font-medium text-gray-700">
      {user.active_household.name}
    </span>
    <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
  </Link>
)}
```

Import `Link` from `react-router-dom` and `ChevronRight` from `lucide-react` in Layout.tsx.

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`

**Step 3: Commit**

```bash
git add frontend/src/components/BottomNav.tsx frontend/src/components/Layout.tsx
git commit -m "feat: add household name to navigation"
```

---

### Task 6: Frontend — HouseholdPage Edit Name Section

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx`

**Step 1: Replace the static "Current Household" section with an editable name**

Replace the existing "Current household info" section (lines 284-295) with an inline-editable name. When not editing, show the name with a pencil icon (OWNER only). When editing, show an input with save/cancel buttons.

Add state for editing:

```tsx
const [isEditing, setIsEditing] = useState(false);
const [editName, setEditName] = useState("");
```

Import `useUpdateHousehold` from the hooks. The edit section:

```tsx
{activeHousehold && (
  <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
    <h2 className="mb-2 text-lg font-semibold text-gray-900">
      {t("household.currentHousehold")}
    </h2>
    {isEditing ? (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!editName.trim()) return;
          updateHousehold.mutate(
            { id: activeHousehold.id, name: editName.trim() },
            {
              onSuccess: async () => {
                setIsEditing(false);
                await refreshUser();
              },
              onError: () => addToast(t("errors.settingsSave"), "error"),
            },
          );
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={!editName.trim() || updateHousehold.isPending}
          className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          {t("common.cancel")}
        </button>
      </form>
    ) : (
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-600">
          {activeHousehold.name} · {t("household.members")} ({activeHousehold.members.length})
        </p>
        {isOwner && (
          <button
            onClick={() => {
              setEditName(activeHousehold.name);
              setIsEditing(true);
            }}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t("household.editName")}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    )}
  </div>
)}
```

Import `Pencil` from `lucide-react` and `useUpdateHousehold` from the hooks.

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`

**Step 3: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx
git commit -m "feat: add inline household name editing"
```

---

### Task 7: Frontend — Transfer Ownership in Members List

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx` (MembersList component)

**Step 1: Add transfer ownership button to MembersList**

In the `MembersList` component, import `useTransferOwnership`. For each member that is not the current user and is not already OWNER, add a "Make Owner" button (a crown/shield icon). Clicking it shows a `window.confirm` dialog, then calls the mutation.

Add next to the existing remove button:

```tsx
{isOwner && member.email !== currentUserEmail && member.role !== "OWNER" && (
  <button
    onClick={() => {
      if (!window.confirm(t("household.transferOwnershipConfirm", { email: member.email }))) return;
      transferOwnership.mutate(
        { householdId: household.id, memberId: member.id },
        {
          onSuccess: () => addToast(t("success.ownershipTransferred"), "success"),
          onError: () => addToast(t("errors.ownershipTransfer"), "error"),
        },
      );
    }}
    disabled={transferOwnership.isPending}
    className="rounded-md p-1.5 text-orange-500 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50"
    aria-label={t("household.transferOwnership")}
  >
    <Shield size={16} />
  </button>
)}
```

Import `Shield` from `lucide-react` and `useTransferOwnership` from the hooks.

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`

**Step 3: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx
git commit -m "feat: add transfer ownership button to members list"
```

---

### Task 8: Frontend — Leave Household Section

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx`

**Step 1: Add Leave Household section for non-owners**

Add a new section between "Join Household" and the bottom of the page. Only shown if the user is a member but NOT an owner. Uses `useLeaveHousehold` hook.

```tsx
{activeHousehold && !isOwner && (
  <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
    <button
      onClick={() => {
        if (!window.confirm(t("household.leaveConfirm"))) return;
        leaveHousehold.mutate(activeHousehold.id, {
          onSuccess: async () => {
            await refreshUser();
            addToast(t("success.householdLeft"), "success");
          },
          onError: () => addToast(t("errors.householdLeave"), "error"),
        });
      }}
      disabled={leaveHousehold.isPending}
      className="flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      <LogOut size={16} />
      {t("household.leaveHousehold")}
    </button>
  </div>
)}
```

Import `LogOut` from `lucide-react` and `useLeaveHousehold` from the hooks.

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`

**Step 3: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx
git commit -m "feat: add leave household section"
```

---

### Task 9: Frontend — Delete Household Section with Name Confirmation

**Files:**
- Modify: `frontend/src/pages/HouseholdPage.tsx`

**Step 1: Add Delete Household danger zone at the bottom (OWNER only)**

Add state for the delete confirmation:

```tsx
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [deleteConfirmName, setDeleteConfirmName] = useState("");
```

The section (at the very bottom, after Leave Household):

```tsx
{activeHousehold && isOwner && (
  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
    <h2 className="mb-2 text-lg font-semibold text-red-900">
      {t("household.deleteHousehold")}
    </h2>
    {!showDeleteConfirm ? (
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        {t("household.deleteHousehold")}
      </button>
    ) : (
      <div>
        <p className="mb-2 text-sm text-red-800">
          {t("household.deleteConfirm", { name: activeHousehold.name })}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={t("household.deleteConfirmPlaceholder")}
            className="flex-1 rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <button
            onClick={() => {
              deleteHousehold.mutate(activeHousehold.id, {
                onSuccess: async () => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmName("");
                  await refreshUser();
                  addToast(t("success.householdDeleted"), "success");
                },
                onError: () => addToast(t("errors.householdDelete"), "error"),
              });
            }}
            disabled={deleteConfirmName !== activeHousehold.name || deleteHousehold.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t("common.delete")}
          </button>
          <button
            onClick={() => {
              setShowDeleteConfirm(false);
              setDeleteConfirmName("");
            }}
            className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

Import `useDeleteHousehold` from the hooks.

**Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`

**Step 3: Commit**

```bash
git add frontend/src/pages/HouseholdPage.tsx
git commit -m "feat: add delete household with name confirmation"
```

---

### Task 10: Final Verification

**Step 1: Run all backend tests**

Run: `pytest backend/ -v`

**Step 2: Run frontend lint and build**

Run: `cd frontend && npm run lint && npm run build`

**Step 3: Run pre-commit hooks**

Run: `pre-commit run --all-files`

**Step 4: Manual smoke test checklist**
- [ ] Navigate to `/household` from sidebar/top bar
- [ ] Edit household name (owner)
- [ ] Transfer ownership to a member
- [ ] Leave household (as non-owner)
- [ ] Delete household (as sole owner, with name confirmation)
- [ ] Verify auto-switch when leaving/deleting active household

**Step 5: Final commit if any fixes needed, then done**
