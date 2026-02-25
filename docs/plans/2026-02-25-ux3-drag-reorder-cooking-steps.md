# UX3: Drag-to-Reorder Cooking Steps

## Problem

The `StepEditor` component only supports adding and removing steps. To reorder steps, users must delete and re-add them in the desired order, which is tedious and error-prone during recipe editing.

## Goal

Add drag-to-reorder capability to both "By Hand" and "Machine" step lists in the recipe create/edit forms.

## Design

### Library Choice

Use **@dnd-kit/core** + **@dnd-kit/sortable** — the standard React drag-and-drop library. It supports touch, keyboard, and pointer interactions out of the box, has good accessibility defaults, and works well with vertical lists.

Alternatives considered:
- `react-beautiful-dnd`: unmaintained (archived by Atlassian).
- Native HTML drag-and-drop: poor touch support, no keyboard reorder, complex accessibility.

### Interaction Model

- Each step row gets a **drag handle** (grip icon, `GripVertical` from lucide-react) on the left side.
- Dragging reorders within the same step type list (manual or machine). No cross-list dragging.
- On touch devices, press-and-hold the handle to initiate drag (dnd-kit's default touch behavior).
- Keyboard: focus the handle, press Space to pick up, arrow keys to move, Space to drop, Escape to cancel.
- Drop animation: smooth 200ms transition to final position.
- While dragging, the dragged item gets a slight scale-up (`scale-105`) and shadow (`shadow-lg`) overlay style.

### StepEditor Changes

Current step row layout:
```
[step number] [textarea] [remove button]
```

New layout:
```
[drag handle] [step number] [textarea] [remove button]
```

The `StepEditor` component wraps the step list in dnd-kit's `DndContext` + `SortableContext`. Each step row becomes a `SortableStep` component using `useSortable()`.

On drag end, the `steps` array is reordered (via `arrayMove` from `@dnd-kit/sortable`) and the parent form state is updated. Step numbers are derived from array index, so they auto-update after reorder.

### Accessibility

- Drag handle has `aria-label="Reorder step"` (translated).
- dnd-kit provides built-in screen reader announcements: "Picked up step 2", "Moved to position 3", "Dropped step 2 in position 3".
- Keyboard reorder fully supported via dnd-kit defaults.

### File Structure

```
frontend/src/components/
  StepEditor.tsx          # modified: wrap in DndContext
  SortableStep.tsx        # new: single sortable step row
```

### Dependencies

Add to `package.json`:
```
@dnd-kit/core
@dnd-kit/sortable
@dnd-kit/utilities
```

## Out of Scope

- Drag-to-reorder ingredients (separate enhancement, different layout complexity).
- Cross-list dragging (manual ↔ machine steps).
- Reordering on the `CookingViewPage` (read-only view).

## Testing

- Unit test: reordering updates the steps array correctly.
- Unit test: drag handle is keyboard-accessible.
- Manual test: touch drag on mobile devices.

## i18n

Add key `steps.reorder` → "Reorder step" / "Schritt neu anordnen".
