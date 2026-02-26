# Frontend — CLAUDE.md

React 19 + TypeScript + Vite + Tailwind CSS 4 PWA.

## Commands

```bash
npm run dev      # Vite dev server on :5173, proxies /api to :8000
npm run build    # tsc + Vite production build
npm run lint     # ESLint
npm test         # Vitest (single run)
npm run preview  # preview production build locally
```

For watch mode tests: `npx vitest` (no npm script defined).

## Key Dependencies

- **React 19** + React DOM
- **TanStack React Query** -- server state (global staleTime 60s)
- **React Router DOM v7** -- client routing
- **react-i18next** -- i18n (en/de)
- **@dnd-kit** (core + sortable + utilities) -- drag-and-drop for cooking steps
- **lucide-react** -- icon library
- **vite-plugin-pwa** + **Workbox** -- PWA with custom service worker
- **@tailwindcss/vite** -- Tailwind CSS 4 Vite plugin (no tailwind.config.js)

## Project Structure

```
src/
  api/
    client.ts           # fetch wrapper with CSRF, credentials, ApiError
    types.ts            # all TypeScript types (mirrors backend schemas)
    webauthn.ts         # WebAuthn browser API helpers
  components/
    ui/                 # shared headless primitives
      Modal.tsx         # native <dialog>, sizes sm/md/lg
      Drawer.tsx        # native <dialog>, bottom sheet, drag handle
      ResponsiveOverlay # Modal (>=640px) or Drawer (<640px)
      ConfirmDialog.tsx # typed confirmation, password input, danger variant
      Skeleton.tsx      # base pulse skeleton
      *Skeleton.tsx     # per-page skeletons (RecipeList, RecipeDetail, MealPlan, ShoppingList, Settings)
      EmptyState.tsx    # icon + title + subtitle + action (Link or button)
      SortSelect.tsx    # controlled <select>
      useMediaQuery.ts  # SSR-safe media query hook
    AppLogo.tsx         # "Cookless" branding
    AppProviders.tsx    # QueryClient + AuthProvider setup
    BottomNav.tsx       # mobile bottom bar / desktop left sidebar
    Layout.tsx          # auth guard + onboarding guard + nav + install banner
    InstallBanner.tsx   # PWA install prompt
    RecipeCard.tsx      # compact recipe card
    RecipePreviewModal  # recipe preview via ResponsiveOverlay
    IngredientForm.tsx  # editable ingredient list with autocomplete
    StepEditor.tsx      # drag-reorderable cooking steps (@dnd-kit)
    SortableStep.tsx    # single draggable step (useSortable)
    GenerateDrawer.tsx  # meal plan config form in Drawer
    IterationCard.tsx   # meal plan iteration display
    ShoppingCategory.tsx # shopping items grouped by category
  contexts/
    AuthContext.tsx      # AuthProvider + useAuth hook
    authContextValue.ts  # AuthContextValue interface
    ToastContext.tsx      # ToastProvider + useToast hook
    toastContextValue.ts # ToastContextValue interface
  hooks/
    useAuth.ts          # re-exports from AuthContext
    useRecipes.ts       # useRecipes, useRecipe, useCreateRecipe, useUpdateRecipe, useMoveRecipe, useDeleteRecipe
    useRecipeImage.ts    # useUploadRecipeImage, useGenerateRecipeImage, useDeleteRecipeImage
    useIngredients.ts   # useIngredients (staleTime 5min), createIngredient (standalone async fn)
    useUnits.ts         # useUnits (staleTime Infinity)
    useMealPlan.ts      # useMealPlans, useMealPlan, useSetupPlan, useRenewIteration, useNextIteration
    useShoppingList.ts  # useShoppingLists, useShoppingList, useToggleItem, useBulkToggle
    useHousehold.ts     # useHouseholds, useCreateHousehold, useSwitchHousehold, useUpdateHousehold, useDeleteHousehold, useLeaveHousehold, useCreateInvite, useAcceptInvite, useRemoveMember, useTransferOwnership
    useToast.ts         # re-exports from ToastContext
    useConfirm.ts       # imperative confirm dialog: confirm(options) -> Promise<string|boolean>
    useInstallPrompt.ts # PWA beforeinstallprompt listener
    useOnlineSync.ts    # replays offline toggles on reconnect via SW messaging
    useWakeLock.ts      # Screen Wake Lock API (CookingViewPage)
  i18n/
    index.ts            # i18next setup (detection: localStorage -> navigator)
    en.json             # English translations
    de.json             # German translations
  pages/                # all lazy-loaded via React.lazy
    LoginPage.tsx
    InvitePage.tsx
    SetupWizardPage.tsx
    WelcomePage.tsx
    RecipeListPage.tsx
    RecipeCreatePage.tsx
    RecipeDetailPage.tsx
    MealPlanPage.tsx
    ShoppingListPage.tsx
    ShoppingListDetailPage.tsx
    CookingViewPage.tsx
    SettingsPage.tsx
    HouseholdPage.tsx
  sw.ts                 # custom Workbox service worker
  index.css             # Tailwind 4 imports + custom animations
  setupTests.ts         # @testing-library/jest-dom import
```

## Routes

All pages lazy-loaded with `React.lazy` + `<Suspense>`.

**Unauthenticated (no Layout):**

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | LoginPage | Passkey or password login |
| `/invite/:code` | InvitePage | Join household via invite |
| `/setup` | SetupWizardPage | 3-step onboarding wizard |
| `/welcome` | WelcomePage | Post-onboarding landing |

**Authenticated (wrapped in Layout):**

| Path | Component | Description |
|------|-----------|-------------|
| `/recipes` | RecipeListPage | KNOWN/TO_TRY tabs, search, sort, soft-delete with undo |
| `/recipes/new` | RecipeCreatePage | New recipe form (`?list=KNOWN\|TO_TRY`) |
| `/recipes/:id` | RecipeDetailPage | Edit recipe, move between lists, delete |
| `/plan` | MealPlanPage | Active iteration, archives, generate/renew |
| `/shopping` | ShoppingListPage | Current shopping list with category groups |
| `/shopping/:id` | ShoppingListDetailPage | Specific shopping list by ID |
| `/cook/:id` | CookingViewPage | Step-by-step with wake lock |
| `/settings` | SettingsPage | Household, language, AI config, passkeys, password, admin link, logout |
| `/household` | HouseholdPage | Members, invites, ownership, multi-household |
| `*` | Redirect to `/recipes` | |

**Layout** guards: redirects to `/login` if unauthenticated, to `/setup` if `onboarding_step !== "COMPLETED"`.

## API Client (`api/client.ts`)

Thin `fetch` wrapper:
- `credentials: "include"` on every request (Django session cookies)
- CSRF token auto-attached from `csrftoken` cookie on non-GET/HEAD via `X-CSRFToken` header
- `VITE_API_BASE_URL` env var for base URL (empty = Vite proxy)
- Body auto-serialized with `JSON.stringify`, `Content-Type: application/json`
- HTTP errors throw `ApiError(status, body)` extending `Error` with `.status` and `.body`
- HTTP 204 returns `undefined as T`

```typescript
export const api = {
  get<T>(url, options?),
  post<T>(url, body?, options?),
  put<T>(url, body?, options?),
  patch<T>(url, body?, options?),
  delete<T = void>(url, body?, options?),
}
```

## Contexts

### AuthContext

```typescript
interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login(email): Promise<void>              // passkey
  loginWithPassword(email, password): Promise<void>
  register(email, inviteCode): Promise<void>   // passkey
  registerWithPassword(email, password, inviteCode): Promise<void>
  logout(): Promise<void>
  refreshUser(): Promise<void>
}
```

- Fetches `/api/v1/users/me/` on mount (useRef guard for StrictMode)
- `login`/`register` delegate to `webauthn.ts`
- All methods are stable `useCallback` references; value memoized with `useMemo`

### ToastContext

```typescript
interface ToastContextValue {
  addToast(message, type: "error" | "success", options?: ToastOptions): void
  removeToast(id: number): void
}

interface ToastOptions {
  action?: { label: string; onClick: () => void }
  duration?: number   // default 4000ms
}
```

- Max 3 toasts visible, auto-dismiss after duration
- Toast with `action` shows inline button; without action, clickable to dismiss
- `animate-slide-down` entrance animation

### AppProviders

- `QueryClient` with `defaultOptions.queries.staleTime = 60_000`
- `MutationCache.onError` global handler: auto-shows error toast if mutation has no own `onError`

## React Query Patterns

### Cache keys
- `["recipes"]` / `["recipes", listType]` -- recipe list
- `["recipes", id]` -- single recipe
- `["meal-plans"]` / `["meal-plans", id]` -- meal plans
- `["shopping-lists"]` / `["shopping-lists", id]` -- shopping lists
- `["households"]` -- household list
- `["ingredients"]` -- all ingredients (staleTime 5min)
- `["units"]` -- all units (staleTime Infinity)

### Mutation invalidation
All mutations invalidate their parent list key. Recipe mutations invalidate both `["recipes"]` and `["recipes", id]`.

### Optimistic patterns
- **Soft-delete with undo:** RecipeListPage hides recipe immediately, shows toast with "Undo" button (5s timer). After timeout, calls DELETE. Undo cancels timer and restores from cache.
- **Shopping toggles:** Optimistic via standard mutation + invalidation. Offline: SW queues to IndexedDB, replays on reconnect.

## Service Worker (`sw.ts`)

Strategy: `injectManifest` (custom SW with Workbox manifest injection).

**Precaching:** `precacheAndRoute(self.__WB_MANIFEST)` for `*.{js,css,html,ico,png,svg,woff2}`.

**Runtime caching:**

| Route pattern | Strategy | Cache name | Notes |
|---------------|----------|------------|-------|
| `/api/v1/meal-plans/*`, `/api/v1/shopping-lists/*` | StaleWhileRevalidate | `api-plan-shopping` | Only 200 responses |
| `/api/v1/recipes/*` | NetworkFirst | `api-recipes` | 3s network timeout |
| script, style, image, font | CacheFirst | `static-assets` | Max 60 entries, 30-day expiry |

**Offline shopping toggle sync:**
- Intercepts PATCH to `.../items/:id/toggle/` and `.../items/bulk-toggle/`
- On network failure: stores in IndexedDB (`cookless-offline` db, `pending-toggles` store), returns synthetic 200
- `REPLAY_PENDING` message (from `useOnlineSync`): replays all pending, stops on first failure
- On full success: posts `SYNC_COMPLETE` to all window clients (triggers query invalidation)

## UI Component Patterns

### Modal / Drawer / ResponsiveOverlay
All use native `<dialog>` with `showModal()`. Backdrop click closes. Focus restored on close.
- **Modal:** `size` prop (sm/md/lg). X button in header.
- **Drawer:** Bottom sheet with drag handle. `maxHeight` prop (default 85vh). Close text button.
- **ResponsiveOverlay:** Renders Modal on desktop (>=640px), Drawer on mobile. Based on `useMediaQuery`.

### ConfirmDialog
Props: `open`, `title`, `message`, `confirmVariant` (danger/primary), `requireTypedConfirmation` (must type exact string), `inputField` (text/password). Used via `useConfirm()` hook which returns `{ confirm(options): Promise<string|boolean>, dialogProps }`.

### Skeleton loading
Each major page has a dedicated skeleton component (`RecipeListSkeleton`, `RecipeDetailSkeleton`, etc.) with `data-testid` for testing. Base `Skeleton` is `animate-pulse rounded bg-gray-200`.

### EmptyState
`icon` (LucideIcon) + `title` + optional `subtitle` + optional `action` (renders `<Link>` or `<button>`).

## i18n

- Languages: `en`, `de`. Fallback: `en`.
- Detection: `localStorage` -> `navigator`. Cached to `localStorage`.
- Resources bundled as JSON imports (not async).
- Top-level keys: `common`, `nav`, `auth`, `invite`, `passkeys`, `recipes`, `recipeImage`, `ingredients`, `steps`, `plan`, `shopping`, `cooking`, `household`, `install`, `ai`, `password`, `settings`, `errors`, `success`, `setup`, `welcome`
- `plan.weekdays` is an array accessed with `{ returnObjects: true }`.

### Tone: cozy and friendly

All user-facing text must feel warm, casual, and encouraging — like a friend helping you cook.

- Use contractions ("Couldn't", "Let's", "You've")
- Prefer "you/your" over impersonal phrasing
- End error messages with a gentle nudge ("Try again?", "Give it another try?")
- Celebrate small wins ("All done!", "Nice!", "Welcome!")
- Use casual alternatives ("Got it!" not "Mark as purchased", "Leg los!" not "Beginnen")
- Keep labels short and human ("Prep" not "Preparation time", "What's it called?" not "Enter recipe title")
- German translations use informal "du" (never "Sie") and match the same warmth

## Vite Config

- **Plugins:** `@vitejs/plugin-react`, `@tailwindcss/vite`, `VitePWA`
- **PWA:** `registerType: "autoUpdate"`, `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "sw.ts"`. Theme: `#f97316` (orange-500).
- **Dev server:** `host: "0.0.0.0"`, optional HTTPS (reads `.certs/cert.pem` + `key.pem`), proxy `/api` -> `http://localhost:8000`
- **Manual chunks:** `react-vendor`, `query-vendor`, `i18n-vendor`, `dnd-vendor`

## Tailwind CSS 4

Configured via `@tailwindcss/vite` plugin (no config file). Custom theme in `index.css`:

```css
@import "tailwindcss";

@theme {
  --animate-slide-down: slide-down 0.3s ease-out;
}
```

Base layer: prevents iOS text zoom (`font-size: 16px` on inputs), cursor pointer on buttons. Brand accent: orange-500 (`#f97316`). No `@apply` -- utilities only.

## Testing

**Stack:** Vitest + @testing-library/react + @testing-library/jest-dom + jsdom

**Setup:** `setupTests.ts` imports `@testing-library/jest-dom`.

**Standard render wrapper:**
```tsx
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ComponentUnderTest />
        </MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  );
}
```

**Common mock patterns:**

i18n:
```typescript
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));
```

API client:
```typescript
const mockGet = vi.fn();
vi.mock("../api/client", () => ({
  api: { get: (...args) => mockGet(...args), post: vi.fn(), delete: vi.fn() },
}));
```

**Timer testing:** `vi.useFakeTimers({ shouldAdvanceTime: true })` + `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` for undo-delete 5s timer.

**Skeleton tests:** Verify `data-testid` appears while queries are pending (mock never resolves).

**Test files:** Located in `src/__tests__/` -- cover pages (RecipeListPage, sorting, undo, skeleton), UI components (ConfirmDialog, Drawer, EmptyState, InstallBanner, Modal, StepEditor), and hooks (useConfirm, useInstallPrompt).
