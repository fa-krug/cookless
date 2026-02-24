# Responsive Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a sidebar navigation on md+ screens and cap page content width for better space usage on larger displays.

**Architecture:** The `Layout.tsx` shell switches from vertical (mobile) to horizontal (md+) flex layout. `BottomNav.tsx` renders two modes — bottom bar on mobile, fixed left sidebar on md+. Content area gets `max-w-3xl mx-auto` centering.

**Tech Stack:** React, Tailwind CSS v4, react-router-dom, react-i18next

---

### Task 1: Make BottomNav responsive — add sidebar mode

**Files:**
- Modify: `frontend/src/components/BottomNav.tsx`

**Step 1: Add sidebar render alongside existing bottom nav**

Replace the entire content of `BottomNav.tsx` with:

```tsx
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import AppLogo from "./AppLogo";

const navItems = [
  {
    to: "/recipes",
    labelKey: "nav.recipes",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
        />
      </svg>
    ),
  },
  {
    to: "/plan",
    labelKey: "nav.plan",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
        />
      </svg>
    ),
  },
  {
    to: "/shopping",
    labelKey: "nav.shopping",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
        />
      </svg>
    ),
  },
  {
    to: "/settings",
    labelKey: "nav.settings",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const { t } = useTranslation();

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-center justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? "text-orange-500" : "text-gray-500"
                }`
              }
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop: sidebar */}
      <nav className="fixed left-0 top-0 hidden h-full w-56 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="px-5 py-6">
          <AppLogo className="text-2xl" />
        </div>
        <div className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive
                    ? "bg-orange-50 text-orange-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
```

Key changes:
- Import `AppLogo`
- Mobile nav gets `md:hidden` to hide on desktop
- New sidebar section with `hidden md:flex` to show on desktop only
- Sidebar: fixed left, `w-56`, full height, brand at top, vertical nav items with icon + label
- Active state: `bg-orange-50 text-orange-600` for sidebar (more appropriate than just text color)

**Step 2: Verify the build compiles**

Run: `cd /Users/skrug/PycharmProjects/cookless/frontend && npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add frontend/src/components/BottomNav.tsx
git commit -m "feat: add responsive sidebar navigation for md+ screens"
```

---

### Task 2: Update Layout.tsx for sidebar offset and content centering

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Update the shell layout**

Replace the return JSX (lines 23-31) with:

```tsx
  return (
    <div className="flex min-h-screen bg-white md:flex-row">
      <BottomNav />
      <div className="flex min-h-screen flex-1 flex-col md:ml-56">
        <InstallBanner />
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
```

Key changes:
- Outer div: `md:flex-row` so sidebar and content sit side by side
- `BottomNav` moved before content div (sidebar is fixed-positioned so DOM order doesn't matter visually, but keeps it logically grouped)
- Content wrapper: `md:ml-56` offsets for the fixed sidebar width
- `<main>`: `mx-auto w-full max-w-3xl` centers content with 768px cap
- `pb-16 md:pb-0` — bottom padding only on mobile (for bottom nav clearance)

**Step 2: Verify the build compiles**

Run: `cd /Users/skrug/PycharmProjects/cookless/frontend && npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: add sidebar offset and centered content cap to layout"
```

---

### Task 3: Visual verification and lint

**Step 1: Run lint**

Run: `cd /Users/skrug/PycharmProjects/cookless/frontend && npm run lint`
Expected: No errors

**Step 2: Run frontend tests**

Run: `cd /Users/skrug/PycharmProjects/cookless/frontend && npm test`
Expected: All tests pass

**Step 3: Manual visual check**

Start dev server: `cd /Users/skrug/PycharmProjects/cookless/frontend && npm run dev`

Verify:
- At < 768px: bottom nav visible, no sidebar, content full width with `p-4` padding
- At >= 768px: sidebar visible on left with brand + nav items, bottom nav hidden, content centered with max-width cap
- Active nav item highlighted orange in both modes
- All pages render correctly within the capped content area
