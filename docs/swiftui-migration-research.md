# SwiftUI Migration Research — Cookless iOS App

> **Date:** 2026-03-27
> **Status:** Research / Feasibility Analysis
> **Scope:** Effort estimation for migrating the Cookless PWA frontend to a native SwiftUI iOS app

---

## 1. Executive Summary

Cookless is a meal planning PWA with a Django Ninja API backend and a React 19 / TypeScript frontend. This document analyzes what it would take to build a native SwiftUI iOS app as a replacement (or complement) to the existing web frontend.

**Key findings:**
- The backend requires minimal changes — the existing PAT auth system and REST API are iOS-ready
- The frontend has **13 pages, 57 components, 22 query hooks, and 517 i18n keys** to replicate
- Estimated effort: **~18 person-weeks** (~4.5 months) for one senior iOS developer
- Highest-risk areas: passkey auth compatibility, offline shopping sync, and the complex recipe editor form

---

## 2. What Stays, What Changes

### Stays As-Is (Backend)
- Django 6.0 + Django Ninja API (40+ REST endpoints)
- All business logic (meal plan generation, shopping list aggregation, recipe CRUD)
- Database models (21 models, 28 relationships across 5 apps)
- Multi-tenant household scoping
- AI recipe generation via Gemini (NDJSON streaming endpoint)

### New (iOS App)
- Native SwiftUI client consuming the existing REST API
- Local persistence via SwiftData for offline support
- Apple Passkey integration via AuthenticationServices
- Push notifications (future, not in current PWA)

### Replaced (React Frontend)
- 13 lazy-loaded React pages (~3,500 LOC)
- 57 UI components (shadcn/ui + Radix + custom)
- 22 TanStack React Query hooks (~1,315 LOC)
- 7 Zod validation schemas
- Workbox service worker (offline shopping, caching)
- i18n: English + German (517 keys each)
- PWA install/update flow

### Backend Changes Required
| Change | Effort | Priority |
|--------|--------|----------|
| Add `/auth/token/` endpoint (login → returns bearer token) | Small | Required |
| Verify PAT auth covers all 40+ endpoints | Small | Required |
| Serve `apple-app-site-association` for Universal Links | Trivial | Required |
| CORS configuration for iOS dev/preview | Trivial | Required |
| Push notification support (APNs) | Medium | Optional/Future |

---

## 3. Recommended SwiftUI Architecture (2026)

### Target
- **iOS 17+** minimum deployment (for full SwiftData + `@Observable` support)
- **Swift 6.0** with strict concurrency checking
- **Xcode 16+**

### Patterns
| Concern | Recommendation |
|---------|----------------|
| **UI framework** | SwiftUI (no UIKit unless necessary) |
| **Architecture** | MVVM with `@Observable` (Observation framework) |
| **Navigation** | `NavigationStack` with typed `NavigationPath` + `TabView` |
| **Networking** | `URLSession` with `async/await` (or Alamofire for convenience) |
| **Streaming** | `URLSession.bytes` + `AsyncSequence` for NDJSON parsing |
| **Persistence** | SwiftData (local offline cache, replaces service worker caching) |
| **Auth storage** | iOS Keychain (via `KeychainAccess` or native Security framework) |
| **Dependency injection** | `@Environment` values or `swift-dependencies` (Point-Free) |
| **Concurrency** | Swift Concurrency (`async/await`, `Task`, `TaskGroup`, actors) |
| **Localization** | String Catalogs (`.xcstrings`, Xcode-native i18n) |

### Project Structure
```
Cookless/
├── App/
│   ├── CooklessApp.swift          # @main entry, TabView root
│   ├── AppState.swift             # Global observable state
│   └── ContentView.swift          # Auth guard + navigation
├── Models/                        # SwiftData models + API DTOs
│   ├── Recipe.swift
│   ├── Ingredient.swift
│   ├── MealPlan.swift
│   ├── ShoppingList.swift
│   ├── Household.swift
│   └── User.swift
├── Services/                      # Networking + business logic
│   ├── APIClient.swift            # Base HTTP client
│   ├── AuthService.swift          # Login, register, token management
│   ├── RecipeService.swift
│   ├── MealPlanService.swift
│   ├── ShoppingService.swift
│   ├── HouseholdService.swift
│   └── SyncService.swift          # Offline queue + sync
├── ViewModels/
│   ├── RecipeListViewModel.swift
│   ├── RecipeEditorViewModel.swift
│   ├── MealPlanViewModel.swift
│   ├── ShoppingListViewModel.swift
│   └── ...
├── Views/
│   ├── Auth/                      # Login, Register, Setup Wizard
│   ├── Recipes/                   # List, Detail, Editor, CookingView
│   ├── MealPlan/                  # Plan view, Generate drawer
│   ├── Shopping/                  # Shopping list, category groups
│   ├── Household/                 # Members, invites, settings
│   ├── Settings/                  # Preferences, passkeys, tokens
│   └── Components/                # Reusable UI components
├── Resources/
│   ├── Localizable.xcstrings      # EN + DE translations
│   └── Assets.xcassets
└── Tests/
```

---

## 4. Feature-by-Feature Mapping

### Navigation & Layout

| React | SwiftUI | Notes |
|-------|---------|-------|
| React Router (13 routes) | `NavigationStack` + `TabView` (4 tabs) | Simpler — no lazy loading needed |
| Bottom nav (mobile) + sidebar (desktop) | `TabView` with 4 tabs | iOS-native pattern, trivial |
| Lazy-loaded pages | Not needed | SwiftUI views are lightweight |
| Responsive layout | Not needed | iOS-only, single form factor |

### Data Fetching & State

| React | SwiftUI | Notes |
|-------|---------|-------|
| TanStack React Query (22 hooks) | `@Observable` ViewModels + `async/await` | Need to build pagination, caching, invalidation manually or use a library |
| Query key invalidation | Manual invalidation or reactive SwiftData queries | SwiftData `@Query` auto-updates on local changes |
| Infinite scroll (`useInfiniteQuery`) | `List` + `.onAppear` on last item → load more | Standard pattern |
| Optimistic updates (shopping toggle) | SwiftData local write + background API call | Natural with local-first architecture |
| React Context (AuthContext) | `@Environment` + `@Observable` singleton | Cleaner in SwiftUI |

### Forms & Validation

| React | SwiftUI | Notes |
|-------|---------|-------|
| react-hook-form + Zod (7 schemas) | Native SwiftUI `Form` + custom validation | SwiftUI forms are more verbose but straightforward |
| Recipe form (ingredients + steps + programs) | Multi-section `Form` with `@Observable` model | Most complex screen — ~2.5 weeks |
| Ingredient autocomplete | `.searchable` modifier + filtered list | Built-in SwiftUI |
| Drag-and-drop steps | `List` with `.onMove` modifier | Much simpler than @dnd-kit |
| Generate plan form (custom day-gap validator) | Custom validation in ViewModel | Straightforward port |

### UI Components

| React (shadcn/ui + custom) | SwiftUI Native | Notes |
|---|---|---|
| Modal / Dialog | `.sheet` modifier | Native |
| Drawer (bottom sheet) | `.sheet(detents:)` with custom detents | iOS 16+ |
| ResponsiveOverlay (modal on desktop, drawer on mobile) | `.sheet` (always bottom sheet on iOS) | Simpler |
| ConfirmDialog | `.confirmationDialog` or `.alert` | Native |
| Toast (Sonner) | Custom overlay view or third-party | No native equivalent; use `AlertToast` library |
| Tabs | `TabView` or `Picker(.segmented)` | Native |
| Badge | Native `Text` with background | Trivial |
| Skeleton loading | `redacted(reason: .placeholder)` | Built-in |
| Spinner | `ProgressView()` | Built-in |
| EmptyState | Custom view (simple) | Trivial |
| Card | Custom view with `.background` + `.cornerRadius` | Trivial |
| Popover | `.popover` modifier | Native |
| Dropdown menu | `.menu` or `.contextMenu` | Native |
| Tooltip | Not standard on iOS | Skip or use long-press info |
| ScrollArea | `ScrollView` | Built-in |
| Slider | `Slider` | Built-in |
| Toggle | `Toggle` | Built-in |
| Avatar | `AsyncImage` with `.clipShape(.circle)` | Easy |

### Complex Features

| Feature | SwiftUI Approach | Complexity |
|---------|-----------------|------------|
| **WebAuthn passkeys** | `ASAuthorizationController` (AuthenticationServices framework) | Medium — needs backend compatibility testing |
| **Offline shopping sync** | SwiftData local store + pending operations queue + `BGTaskScheduler` | High — most complex offline feature |
| **AI recipe generation (NDJSON streaming)** | `URLSession.bytes` → parse lines as JSON → update `@Observable` array | Medium |
| **Cooking step-by-step view** | `TabView(.page)` with swipe + `UIApplication.shared.isIdleTimerDisabled` | Low |
| **Recipe image upload** | `PhotosPicker` → resize → multipart `URLSession` upload | Low |
| **AI image generation** | Simple POST + async polling/loading state | Low |
| **PDF recipe export** | `UIGraphicsPDFRenderer` or render SwiftUI view to PDF via `ImageRenderer` | Low |
| **Deep link invites** | Universal Links + `onOpenURL` modifier | Low-Medium |
| **PWA install prompt** | N/A — App Store distribution | Eliminated |
| **Service worker caching** | `URLCache` + SwiftData offline store | Medium (but more robust) |

### Localization

| Aspect | Current (React) | SwiftUI |
|--------|----------------|---------|
| Framework | react-i18next | String Catalogs (`.xcstrings`) |
| Languages | English + German (517 keys each) | Same — manual migration of 517 keys |
| Detection | localStorage → navigator.language | iOS system language (automatic) |
| Pluralization | i18next built-in | String Catalog plural rules |
| Effort | — | ~1 week to migrate and verify all strings |

---

## 5. Effort Estimation

### By Module (Senior iOS Developer)

| Module | Weeks | Details |
|--------|-------|---------|
| **Project setup & architecture** | 1.0 | Xcode project, SwiftData models, API client, DI, CI pipeline |
| **Auth (passkey + password + token)** | 2.0 | `ASAuthorizationController`, Keychain, login/register/logout flows, token refresh |
| **Recipe list** | 1.5 | Infinite scroll, search, tag filter, sort, recipe cards, image loading |
| **Recipe detail & cooking view** | 1.5 | Detail display, step-by-step cooking, wake lock, serving adjustment |
| **Recipe create/edit form** | 2.5 | Ingredient autocomplete, drag-drop steps, machine program config (temp/speed/duration/direction/weight) |
| **Meal plan** | 1.5 | Iteration display, generate/renew/next actions, configuration form with custom validation |
| **Shopping list + offline sync** | 2.0 | SwiftData models, background sync queue, category grouping, bulk toggle |
| **Household management** | 1.5 | Members list, invite creation/acceptance, ownership transfer, tag management, AI settings |
| **Settings & profile** | 0.5 | Theme (follows system), language, password management, passkey list, API tokens |
| **Onboarding** | 1.0 | Setup wizard (3 steps), invite deep link handling, welcome screen |
| **Localization (EN + DE)** | 1.0 | Migrate 517 keys to String Catalogs, verify all screens |
| **AI features** | 1.0 | NDJSON streaming recipe generation, preview/select UI, image generation |
| **PDF export** | 0.5 | Recipe PDF rendering |
| **Testing & polish** | 2.0 | Unit tests, UI tests, accessibility, App Store screenshots/metadata |
| **Total** | **~19.5** | **~5 months for 1 senior iOS developer** |

### Adjusted Estimates by Team Size

| Team | Duration | Notes |
|------|----------|-------|
| 1 senior iOS dev | ~5 months | Sequential development |
| 2 iOS devs | ~3 months | Parallelize: one on recipes/cooking, one on auth/household/shopping |
| 1 senior + 1 junior | ~4 months | Senior handles arch + complex features, junior handles settings/i18n/polish |

### Comparison to Original Frontend
The React frontend was likely built in a similar timeframe. However, the SwiftUI version benefits from:
- No responsive layout concerns (iOS only)
- Native components replace many custom UI components
- No PWA/service worker complexity (SwiftData is simpler)
- No build tooling complexity (Vite/Webpack equivalent is just Xcode)

And faces additional costs from:
- Apple developer program ($99/year)
- App Store review process
- No hot-reload deployment (requires App Store updates for fixes)
- Passkey integration needs backend compatibility work

---

## 6. Key Technical Risks

### High Risk
1. **Passkey/WebAuthn Compatibility**
   - Apple's `ASAuthorizationController` implements FIDO2/WebAuthn, but the challenge format, attestation type, and credential storage must match what `py_webauthn` expects on the backend
   - **Mitigation:** Prototype passkey flow in week 1, before building any other UI
   - **Fallback:** Password-only auth for v1, add passkeys in v1.1

2. **Offline Shopping Sync Reliability**
   - The current PWA queues toggle operations in IndexedDB and replays on reconnect
   - SwiftData + background sync must handle: app terminated while offline, conflicting server state, partial sync failures
   - **Mitigation:** Keep sync simple (last-write-wins, sequential replay, stop on first failure — same as PWA)

### Medium Risk
3. **NDJSON Streaming Parsing**
   - `URLSession.bytes` with `AsyncSequence` line parsing can be fragile with network interruptions
   - **Mitigation:** Use a well-tested `AsyncLineSequence` pattern with timeout and retry

4. **Complex Recipe Form**
   - The recipe editor (ingredients autocomplete + drag-and-drop steps + machine program config) is the most complex UI in the app
   - SwiftUI `Form` can be verbose and has performance issues with many dynamic fields
   - **Mitigation:** Break into sub-views, use `@Observable` view models, consider `LazyVStack` for step lists

5. **App Store Review**
   - Apple may flag: WebAuthn/passkey usage patterns, AI-generated content, or household data sharing
   - **Mitigation:** Follow Apple Human Interface Guidelines, add required privacy disclosures

### Low Risk
6. **API Compatibility** — REST API is well-structured and already documented via Django Ninja's OpenAPI; Swift Codable models can be auto-generated from the OpenAPI schema
7. **i18n Migration** — Mechanical work, low risk but tedious (517 keys)
8. **Image Handling** — Standard patterns with `PhotosPicker` + `AsyncImage`

---

## 7. Recommended Libraries

| Purpose | Library | Why |
|---------|---------|-----|
| HTTP client | `URLSession` (native) | Sufficient for this API; no need for Alamofire |
| Keychain | `KeychainAccess` | Clean API wrapper, well-maintained |
| Image loading | `Nuke` | Best performance + caching, SwiftUI integration |
| Toast notifications | `AlertToast` | Closest to Sonner experience |
| DI | `swift-dependencies` | Testable, Point-Free ecosystem |
| Testing | `swift-testing` + `swift-snapshot-testing` | Modern test framework |
| Linting | `SwiftLint` | Industry standard |
| OpenAPI codegen | `swift-openapi-generator` | Auto-generate API models from Django Ninja's OpenAPI spec |
| PDF | Native `UIGraphicsPDFRenderer` | No library needed |

---

## 8. Migration Strategy (Phased)

### Phase 1 — Foundation (Weeks 1–4)
- Xcode project setup, SwiftData models, API client
- Auth flow (passkey + password → token storage)
- Recipe list (read-only, infinite scroll, search, tag filter)
- Recipe detail view (read-only)
- **Milestone:** Can browse recipes natively

### Phase 2 — Core CRUD (Weeks 5–9)
- Recipe create/edit form (full complexity)
- Meal plan view + generation
- Shopping list (online-only initially)
- **Milestone:** Feature parity for core workflows (minus offline)

### Phase 3 — Full Features (Weeks 10–14)
- Offline shopping list sync (SwiftData + background queue)
- Cooking step-by-step view
- AI recipe + image generation
- Household management (members, invites, tags)
- **Milestone:** Feature parity with PWA

### Phase 4 — Polish & Ship (Weeks 15–19.5)
- Onboarding wizard + invite deep links
- Localization (EN + DE, 517 keys)
- PDF export
- Settings screen
- UI polish, accessibility, dark mode verification
- Unit tests, UI tests, snapshot tests
- App Store assets, metadata, TestFlight beta
- **Milestone:** App Store submission

---

## 9. Should You Do It?

### Advantages of Native iOS Over PWA
- **Better performance** — native scrolling, animations, transitions
- **Passkey integration** — seamless with iCloud Keychain, Face ID / Touch ID
- **Offline support** — SwiftData is more robust than service worker + IndexedDB
- **Home screen presence** — first-class citizen, not a web shortcut
- **Push notifications** — possible future feature (APNs)
- **Widgets** — WidgetKit could show today's meal plan or shopping list on home screen
- **Siri / Shortcuts** — voice-activated recipe lookup or shopping list
- **App Clips** — invite acceptance without installing the full app
- **Apple Watch** — future companion app for shopping list

### Advantages of Keeping the PWA
- **Cross-platform** — works on iOS, Android, desktop with one codebase
- **Instant deployment** — no App Store review delays
- **Lower cost** — no Apple developer program fee, no iOS-specific maintenance
- **Already built** — zero additional effort
- **Shared codebase** — one team maintains one frontend

### Recommendation
If your user base is primarily iOS and you value the native experience (passkeys, offline, performance, widgets), the migration is justified at ~5 months for a senior developer. If cross-platform reach matters more, the PWA is already a solid solution and the investment may not be warranted — consider improving the PWA instead (e.g., better offline support, native-like animations with View Transitions API).

A middle ground: **keep the PWA as the primary frontend** and build a lightweight iOS companion app that covers only the most-used mobile flows (shopping list + meal plan + cooking view), using the same API. This would take ~8–10 weeks and deliver the highest-value native features.
