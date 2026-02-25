# UX5: Accessible Modals and Drawers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all modal/drawer overlays to native `<dialog>` elements with proper focus management, keyboard support, and ARIA attributes.

**Architecture:** Create reusable `Modal` and `Drawer` base components built on `<dialog>`, plus a `ResponsiveOverlay` wrapper. Then migrate `GenerateDrawer` and `RecipePreviewModal` to use these base components.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, native HTML `<dialog>`, Vitest + Testing Library

---

## Task 1: Create Modal base component

**Files:**
- Create: `frontend/src/components/ui/Modal.tsx`
- Test: `frontend/src/__tests__/Modal.test.tsx`

**Step 1: Write the failing tests**

Create `frontend/src/__tests__/Modal.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import Modal from "../components/ui/Modal";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

describe("Modal", () => {
  it("renders title and children when open", () => {
    render(
      <Modal open onClose={() => {}} title="Test Title">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("calls showModal when open becomes true", () => {
    render(
      <Modal open onClose={() => {}} title="Test">
        <p>Content</p>
      </Modal>,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it("calls close when open becomes false", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Test">
        <p>Content</p>
      </Modal>,
    );
    rerender(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>Content</p>
      </Modal>,
    );
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    dialog.dispatchEvent(new Event("cancel", { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    // Simulate click on the dialog element itself (backdrop area)
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  it("has aria-labelledby pointing to title", () => {
    render(
      <Modal open onClose={() => {}} title="My Title">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl?.textContent).toBe("My Title");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/__tests__/Modal.test.tsx
```

Expected: FAIL — Modal component not found.

**Step 3: Implement Modal component**

Create `frontend/src/components/ui/Modal.tsx`:

```tsx
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel(e: Event) {
      e.preventDefault();
      onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className={`w-full rounded-2xl border-none bg-transparent p-0 backdrop:bg-black/40 ${SIZE_CLASSES[size]}`}
    >
      <div className="rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/__tests__/Modal.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/ui/Modal.tsx frontend/src/__tests__/Modal.test.tsx
git commit -m "feat(ux5): add accessible Modal base component"
```

---

## Task 2: Create Drawer base component

**Files:**
- Create: `frontend/src/components/ui/Drawer.tsx`
- Test: `frontend/src/__tests__/Drawer.test.tsx`

**Step 1: Write the failing tests**

Create `frontend/src/__tests__/Drawer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import Drawer from "../components/ui/Drawer";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

describe("Drawer", () => {
  it("renders title and children when open", () => {
    render(
      <Drawer open onClose={() => {}} title="Drawer Title">
        <p>Drawer content</p>
      </Drawer>,
    );
    expect(screen.getByText("Drawer Title")).toBeInTheDocument();
    expect(screen.getByText("Drawer content")).toBeInTheDocument();
  });

  it("calls showModal when open becomes true", () => {
    render(
      <Drawer open onClose={() => {}} title="Test">
        <p>Content</p>
      </Drawer>,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Test">
        <p>Content</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog");
    dialog.dispatchEvent(new Event("cancel", { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Test">
        <p>Content</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  it("has aria-labelledby pointing to title", () => {
    render(
      <Drawer open onClose={() => {}} title="My Drawer">
        <p>Content</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl?.textContent).toBe("My Drawer");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/__tests__/Drawer.test.tsx
```

Expected: FAIL — Drawer component not found.

**Step 3: Implement Drawer component**

Create `frontend/src/components/ui/Drawer.tsx`:

```tsx
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  maxHeight = "85vh",
}: DrawerProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel(e: Event) {
      e.preventDefault();
      onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className="m-0 mt-auto w-full max-w-lg border-none bg-transparent p-0 backdrop:bg-black/40"
    >
      <div
        className="rounded-t-2xl bg-white shadow-xl"
        style={{ maxHeight }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: `calc(${maxHeight} - 5rem)` }}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/__tests__/Drawer.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/ui/Drawer.tsx frontend/src/__tests__/Drawer.test.tsx
git commit -m "feat(ux5): add accessible Drawer base component"
```

---

## Task 3: Create ResponsiveOverlay and useMediaQuery

**Files:**
- Create: `frontend/src/components/ui/useMediaQuery.ts`
- Create: `frontend/src/components/ui/ResponsiveOverlay.tsx`

**Step 1: Create useMediaQuery hook**

Create `frontend/src/components/ui/useMediaQuery.ts`:

```ts
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    function handleChange(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
```

**Step 2: Create ResponsiveOverlay**

Create `frontend/src/components/ui/ResponsiveOverlay.tsx`:

```tsx
import Drawer from "./Drawer";
import Modal from "./Modal";
import { useMediaQuery } from "./useMediaQuery";

interface ResponsiveOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  maxHeight?: string;
}

export default function ResponsiveOverlay({
  open,
  onClose,
  title,
  children,
  size = "md",
  maxHeight = "85vh",
}: ResponsiveOverlayProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <Modal open={open} onClose={onClose} title={title} size={size}>
        {children}
      </Modal>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={title} maxHeight={maxHeight}>
      {children}
    </Drawer>
  );
}
```

**Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add frontend/src/components/ui/useMediaQuery.ts frontend/src/components/ui/ResponsiveOverlay.tsx
git commit -m "feat(ux5): add ResponsiveOverlay and useMediaQuery"
```

---

## Task 4: Migrate GenerateDrawer to use Drawer base component

**Files:**
- Modify: `frontend/src/components/GenerateDrawer.tsx`

**Step 1: Read the current GenerateDrawer component**

Read `frontend/src/components/GenerateDrawer.tsx` fully to understand the form content inside it.

**Step 2: Replace the custom overlay with the Drawer base component**

The current component has:
- A backdrop `<div>` (lines ~256-262)
- A drawer container `<div>` with transform animation (lines ~264-274)
- A drag handle, title, and close button inside
- Form content

Replace the outer structure. Keep all form content exactly as-is. The key changes:

1. Remove the backdrop `<div>` and the outer drawer `<div>`
2. Wrap the form content in `<Drawer open={isOpen} onClose={onClose} title={...}>`
3. Remove the manually-rendered drag handle and close button (Drawer provides these)
4. Keep the `openCount` key-based remount pattern

The component should now look like:

```tsx
import Drawer from "./ui/Drawer";
// ... other existing imports stay the same

export default function GenerateDrawer({ isOpen, onClose, existingPlan }: GenerateDrawerProps) {
  const { t } = useTranslation();
  // ... all existing state and form logic stays the same
  // ... openCount pattern stays the same

  return (
    <Drawer open={isOpen} onClose={onClose} title={existingPlan ? t("plan.updateConfig") : t("plan.setup")}>
      <form key={openCount} onSubmit={handleSubmit} className="space-y-5">
        {/* All existing form fields stay exactly the same */}
      </form>
    </Drawer>
  );
}
```

Remove: the backdrop div, the outer fixed container div, the drag handle div, the title/close header div, the `max-h-[85vh]` wrapper (Drawer handles this).

**Step 3: Verify TypeScript compiles and lint passes**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

**Step 4: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add frontend/src/components/GenerateDrawer.tsx
git commit -m "feat(ux5): migrate GenerateDrawer to Drawer base component"
```

---

## Task 5: Migrate RecipePreviewModal to use ResponsiveOverlay

**Files:**
- Modify: `frontend/src/components/RecipePreviewModal.tsx`

**Step 1: Read the current RecipePreviewModal component**

Read `frontend/src/components/RecipePreviewModal.tsx` fully.

**Step 2: Replace the custom overlay with ResponsiveOverlay**

The current component has:
- A fixed container div with `items-end sm:items-center`
- A backdrop div
- A modal content div

Replace the outer structure with `<ResponsiveOverlay>`. Keep all inner content (recipe display, ingredients, steps) exactly as-is.

The component needs an `open` prop now (currently it's conditionally rendered by the parent). Two options:
- Add `open` prop and always render, OR
- Keep conditional rendering in parent and always pass `open={true}`

Since the parent (`IterationCard`) conditionally renders it, add an `open` prop and update the parent:

```tsx
import ResponsiveOverlay from "./ui/ResponsiveOverlay";

interface RecipePreviewModalProps {
  open: boolean;
  recipe: Recipe;
  servings: number;
  onClose: () => void;
}

export default function RecipePreviewModal({ open, recipe, servings, onClose }: RecipePreviewModalProps) {
  // ... existing content logic stays the same

  return (
    <ResponsiveOverlay open={open} onClose={onClose} title={recipe.title}>
      {/* All existing recipe display content, minus the title (ResponsiveOverlay renders it) */}
    </ResponsiveOverlay>
  );
}
```

**Step 3: Update IterationCard usage**

In `frontend/src/components/IterationCard.tsx`, change from conditional rendering to always rendering with `open` prop:

From:
```tsx
{previewEntry && (
  <RecipePreviewModal
    recipe={previewEntry.recipe}
    servings={previewEntry.servings}
    onClose={() => setPreviewEntry(null)}
  />
)}
```

To:
```tsx
{previewEntry && (
  <RecipePreviewModal
    open={true}
    recipe={previewEntry.recipe}
    servings={previewEntry.servings}
    onClose={() => setPreviewEntry(null)}
  />
)}
```

Or restructure to always render and control via `open`:
```tsx
<RecipePreviewModal
  open={previewEntry !== null}
  recipe={previewEntry?.recipe ?? null}
  servings={previewEntry?.servings ?? 1}
  onClose={() => setPreviewEntry(null)}
/>
```

Choose whichever is simpler given the current code. If recipe is required, keep conditional rendering and pass `open={true}`.

**Step 4: Verify TypeScript compiles and lint passes**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

**Step 5: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add frontend/src/components/RecipePreviewModal.tsx frontend/src/components/IterationCard.tsx
git commit -m "feat(ux5): migrate RecipePreviewModal to ResponsiveOverlay"
```

---

## Task 6: Final verification

**Step 1: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass.

**Step 2: Run lint and type check**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

Expected: Clean.

**Step 3: Run pre-commit hooks**

```bash
pre-commit run --all-files
```

Expected: All hooks pass.

**Step 4: Run backend tests (ensure no regressions)**

```bash
pytest
```

Expected: All tests pass.
