# Jantt Single-Codebase Flagship App Specification (Web + Native-Grade PWA + Google Play Android TWA)

## Role & Mission

You are a Principal Product Engineer, Design Systems Architect, and Mobile Web Platform Specialist working inside the Jantt monorepo (`d:\Repos\Jantt`).

Your mission is **NOT** to slap a thin "website wrapper" around Jantt. Your mission is to evolve Jantt's existing React + TypeScript + Vite workspace (`apps/playground`) into a **flagship, native-feeling multi-platform app** that runs from **ONE single codebase** deployed to GitHub Pages (`https://ahmadhassan-bted.github.io/Jantt/`) and adapts its UI, navigation, gestures, and system integration natively for every surface:

1. **Desktop Web & Desktop Installed PWA** (Windows, macOS, Linux: keyboard-first, multi-pane, OS `.json` double-click file opening, window-controls-overlay support)
2. **Mobile Web & Installed Mobile PWA** (Android & iOS: native AppBar, ergonomic 5-tab bottom navigation, swipe-to-dismiss bottom sheets, virtual-keyboard-aware AI Copilot, contextual Quick-Add FAB, smooth view transitions, haptics, offline-first persistence)
3. **Google Play Store Android App via Trusted Web Activity (TWA)** (100% full-screen Chrome-backed Android app pointing directly at the GitHub Pages PWA: seamless native-to-web splash handoff, dynamic Android status-bar & navigation-bar color sync per theme, hardware Back button overlay dismissal, Android home-screen app shortcuts, native OS share sheet, zero dual maintenance on every future release)

---

## The Golden Architectural Rule (Zero Dual Maintenance)

```text
+-------------------------------------------------------------------------+
|                  100% SHARED CORE & FEATURE CODEBASE                    |
|  packages/@jantt/*  +  apps/playground/src/{hooks,services,views,...}   |
|  (Scheduling, CPM, AI Copilot, Cloud Sync, Gantt, Canvas, Kanban,       |
|   Tasks, Health & PM, Notes, Undo/Redo, Export/Import: WRITTEN ONCE)    |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
|           THIN ADAPTIVE APP SHELL & PLATFORM LAYER (NEW/UPGRADED)       |
|  - services/platform/ (surface detection, SW policy/register, haptics,  |
|    dynamic theme-color, OS launchQueue, native share)                   |
|  - hooks/ (useAppPlatform, useAndroidBackNavigation,                    |
|    useSheetSwipeDismiss, useVisualViewport)                             |
|  - layout/ (adaptive Navbar, upgraded MobileNavbar, ergonomic 5-tab     |
|    MobileBottomNav, swipeable MobileActionMenuSheet, MobileQuickFab,    |
|    keyboard-aware CopilotDrawer, bottom-sheet Modal on mobile)          |
|  - Zero-JS-flicker branded boot splash in index.html + index.css        |
+------------------------------------+------------------------------------+
                                     |
        +----------------------------+----------------------------+
        v                            v                            v
   Desktop Web /              Mobile Web /                Google Play Store
   Desktop PWA                Mobile PWA                  Android TWA
   (GitHub Pages)             (GitHub Pages)              (GitHub Pages)
```

**Rule of Thumb:** Never fork any feature view (`Gantt`, `Canvas`, `Kanban`, `Tasks`, `BudgetKpiView`, `NotesView`) or business hook into "web vs app" copies. All platform specialization happens strictly through the thin Platform Layer, adaptive layout shell components, and declarative CSS (`html[data-surface]`, `html[data-standalone]`, `html[data-offline]`). When any future feature is added to `apps/playground` and pushed to `main`, Desktop Web, Desktop PWA, Mobile PWA, and Google Play Android TWA all receive it automatically.

---

## Non-Negotiable Constraints

1. **ONE FRAMEWORK ONLY:** Keep 100% React + TypeScript + Vite (`apps/playground`). Do NOT introduce Flutter, React Native, Capacitor, Cordova, Ionic, or Electron.
2. **GITHUB PAGES SUBPATH SAFE:** Keep `base: "./"` in `apps/playground/vite.config.ts`. Every manifest, icon, Service Worker, and privacy page URL MUST use relative `./` paths so it works identically on `https://ahmadhassan-bted.github.io/Jantt/` and on any custom root domain (`/`).
3. **ZERO HEAVY THIRD-PARTY PWA PLUGINS:** The repo runs Vite 8 / Rolldown (`vite@^8.3.5`). Do NOT add `vite-plugin-pwa` or Workbox. Build a clean, deterministic, zero-dependency Vite plugin (`apps/playground/vite-pwa-plugin.ts`).
4. **DO NOT BREAK OR POLLUTE WORKSPACES:**
   - Do NOT add `apps/android-twa` to root `package.json` `"workspaces"`.
   - Do NOT modify public APIs in `packages/*`, `cli/`, or `python/`.
   - Keep `apps/playground` 100% client-side.
5. **STRICT ZERO-EMOJI & ZERO-EM-DASH RULE:** Never use emojis or em dashes anywhere (not in UI, code, comments, HTML, manifests, docs, or commits). Use `lucide-react` icons, crisp Swiss typography, and colons (`:`) instead of em dashes.
6. **STRICT CSP & PRIVACY COMPLIANCE:**
   - NO inline `<script>` tags in `index.html` (production CSP blocks inline scripts!). Boot splash must be 100% pure HTML + CSS, dismissed cleanly from `src/main.tsx` or `App.tsx` on first React mount.
   - Keep `apps/playground/src/main.tsx` (`buildProductionCsp`) and `apps/playground/public/_headers` 100% in sync.
   - Service Worker MUST NEVER cache Firebase RTDB, Firebase Auth, GitHub API, BYOK AI Copilot provider calls, remote URL fetches, `/sw.js`, or any non-`GET` request.
   - Never commit Android keystores (`.keystore`, `.jks`), `.aab`, `.apk`, or signing configs: ignore them in `.gitignore`.
7. **NEVER TOUCH UNRELATED UNTRACKED FILES:** Do not stage or modify `stepcontainer-viewport-height-removal.json`.
8. **READ BEFORE EDITING:** Always read target files before editing to match existing TypeScript strictness (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`), CSS variables (`--jantt-*`), and accessibility patterns (ARIA roles, focus traps, keyboard support).

---

## Existing Codebase Inventory (Read First)

Inspect these files before modifying them:
- `apps/playground/vite.config.ts`: Vite 8 / Rolldown config (`base: "./"`).
- `apps/playground/index.html`: Entry HTML (`viewport-fit=cover`, SEO/JSON-LD, `favicon.svg`).
- `apps/playground/src/main.tsx`: Runtime production CSP (`buildProductionCsp`) and React root mount.
- `apps/playground/public/_headers`: Static CSP headers synced with `main.tsx`.
- `apps/playground/public/favicon.svg`: Official Jantt vector mark (`#090E1A` bg, `#38BDF8` accent).
- `apps/playground/src/App.tsx`: Root workspace orchestrator.
- `apps/playground/src/hooks/useMobileDetection.ts`: Existing `matchMedia` mobile/tablet/immersive-landscape detector.
- `apps/playground/src/hooks/useProjectState.ts`: Check exact signature of `handleImportJsonFile` and `handleOpenAddPlanModal`.
- `apps/playground/src/hooks/useGanttViewport.ts`: Manages `activeView`, `selectedThemeId`, `activeTheme`.
- `apps/playground/src/hooks/useTaskActions.ts`: Manages `handleAddNewTask`.
- `apps/playground/src/components/layout/Navbar.tsx`: Desktop top navbar.
- `apps/playground/src/components/layout/MobileNavbar.tsx`: Mobile top AppBar & floating immersive button.
- `apps/playground/src/components/layout/MobileBottomNav.tsx`: Mobile bottom navigation bar.
- `apps/playground/src/components/layout/MobileActionMenuSheet.tsx`: Mobile slide-up Tools & Settings sheet.
- `apps/playground/src/components/copilot/CopilotDrawer.tsx`: AI Copilot side/mobile drawer.
- `apps/playground/src/components/modals/Modal.tsx` (or shared modal shell inside `src/components/modals/`): Shared modal container.
- `apps/playground/src/components/modals/ShareModal.tsx`: Share dialog.
- `apps/playground/src/index.css`: All playground styles (desktop + mobile `@media` rules).

---

## Complete 10-Phase Implementation Plan

Execute every phase carefully in order. Every phase must be fully wired: zero dead code, zero unused helpers, zero placeholder stubs.

---

### Phase 1: Branded Zero-Flicker Boot Splash Screen & App Icons

#### 1.1 Deterministic PNG & Maskable App Icons (`apps/playground/scripts/generate-pwa-icons.mjs`)
Create a zero-dependency Node script (`node:fs`, `node:path`, `node:zlib`) that renders Jantt's exact geometric brand mark (matching `apps/playground/public/favicon.svg`: `#090E1A` background, `#38BDF8` outer braces and top bar, `#3B82F6` middle bar, `#10B981` lower bar, `#F59E0B` rotated milestone diamond, `#94A3B8` orthogonal dependency connector) into crisp anti-aliased RGBA pixels and writes valid PNG files under `apps/playground/public/icons/`:
1. `icon-192.png` (`192x192`, `purpose: "any"`, subtle rounded border)
2. `icon-512.png` (`512x512`, `purpose: "any"`)
3. `icon-maskable-192.png` (`192x192`, `purpose: "maskable"`, full-bleed solid `#090E1A` background with mark centered inside the inner 66% safe zone so Android circular/squircle adaptive icon masks never clip the logo)
4. `icon-maskable-512.png` (`512x512`, `purpose: "maskable"`, inner 66% safe zone)
5. `apple-touch-icon-180.png` (`180x180`, solid opaque `#090E1A` background for iOS Home Screen)

Run the script and verify every file has valid PNG magic bytes (`89 50 4E 47 0D 0A 1A 0A`) and exact IHDR pixel dimensions.

#### 1.2 Web App Manifest (`apps/playground/public/manifest.webmanifest`)
Create `apps/playground/public/manifest.webmanifest` using relative `./` paths:
- `id: "./"`, `start_url: "./?source=pwa"`, `scope: "./"`
- `name: "Jantt - AI Gantt & Timeline Planner"`, `short_name: "Jantt"`
- `display: "standalone"`, `display_override: ["window-controls-overlay", "standalone"]`, `orientation: "any"`
- `background_color: "#090E1A"`, `theme_color: "#090E1A"`
- `categories: ["productivity", "business", "education", "utilities"]`
- Separate `icons` entries for `purpose: "any"` (`192`, `512`) and `purpose: "maskable"` (`192`, `512`): NEVER combine `"any maskable"` into one entry.
- Android / Desktop long-press `shortcuts`:
  - `New Plan` (`./?action=new-plan`)
  - `AI Copilot` (`./?action=copilot`)
  - `Tasks Checklist` (`./?view=tasks`)
  - `Project Notes` (`./?view=notes`)
- Desktop / ChromeOS / Android `file_handlers`:
  - `action: "./"`, `accept: { "application/json": [".json", ".jantt.json"] }`

#### 1.3 Zero-Flicker Branded Splash Screen (`apps/playground/index.html` + `src/main.tsx`)
When a user taps the Jantt icon on Android (TWA) or iOS/Desktop (PWA), the OS shows a native splash screen (`#090E1A` + centered icon), then hands off to `index.html`. If `index.html` has an empty `#root`, users see an ugly blank flash while JS initializes.

Eliminate the flash completely with a **100% CSP-safe (zero inline script!)** seamless boot splash:
1. In `apps/playground/index.html` `<head>`:
   - Add `<link rel="manifest" href="./manifest.webmanifest" />`
   - Add `<link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon-180.png" />`
   - Update favicon href to relative `./favicon.svg`
   - Add `<meta name="mobile-web-app-capable" content="yes" />`, `<meta name="apple-mobile-web-app-capable" content="yes" />`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`, `<meta name="apple-mobile-web-app-title" content="Jantt" />`
   - Add a minimal inline `<style id="jantt-boot-splash-style">` (style-src already allows `'unsafe-inline'`) styling `#jantt-boot-splash`: fixed full-screen `#090E1A` backdrop (`#FFFFFF` under `@media (prefers-color-scheme: light)` only when not dark; default `#090E1A` matches TWA `backgroundColor` seamlessly!), centered crisp inline SVG Jantt mark (64x64), subtle wordmark `JANTT`, a refined 2px indeterminate Swiss loading track (zero bounce/spinner gimmicks, respects `prefers-reduced-motion`), and smooth `opacity 180ms ease-out` fade-out class `.is-hidden`.
2. Place `<div id="jantt-boot-splash" aria-hidden="true">...</div>` inside `<body>` as a sibling of `<div id="root"></div>`.
3. In `apps/playground/src/main.tsx` (or `App.tsx` first `useEffect`):
   - After React mounts the first frame (`requestAnimationFrame`), add `.is-hidden` to `#jantt-boot-splash`, then remove `#jantt-boot-splash` and `#jantt-boot-splash-style` from the DOM after `200ms` so zero splash DOM stays in memory.

---

### Phase 2: Zero-Dependency Vite 8 Offline Service Worker & Update Lifecycle

#### 2.1 Pure SW Policy Module (`apps/playground/src/services/platform/sw-policy.ts`)
Export pure, unit-testable functions:
- `shouldBypassServiceWorker(requestUrl: string, method: string, swOrigin: string): boolean`
  - Returns `true` (bypass untouched) if:
    - `method !== "GET"`
    - protocol is not `http:` or `https:`
    - `origin !== swOrigin` (guarantees Firebase RTDB, Firebase Auth, GitHub API, Google Fonts, remote URLs, and ALL 10 AI Copilot providers including `localhost:11434` Ollama are NEVER intercepted or cached)
    - pathname ends with `/sw.js`
- `isImmutableAssetPath(pathname: string): boolean`
  - Matches Vite hashed assets `/assets/.*-[A-Za-z0-9_-]{6,}\.(js|css|woff2?)$/i`.

#### 2.2 Zero-Dependency Vite Build Plugin (`apps/playground/vite-pwa-plugin.ts`)
Register `janttPwaPlugin()` in `apps/playground/vite.config.ts` (`apply: "build"`):
- In `closeBundle()`:
  - Scans `outDir` recursively for emitted static assets (`index.html`, `manifest.webmanifest`, `favicon.svg`, `privacy.html`, `icons/*.png`, `schema/v1.json`, `assets/*.js`, `assets/*.css`; excludes `sw.js`, `_headers`, `*.map`).
  - Computes a deterministic short SHA-256 build hash -> `CACHE_NAME = "jantt-shell-<hash>"`.
  - Emits `dist/sw.js` implementing:
    - `install`: resilient precache of all `./...` entries + `"./"`; skips waiting automatically only on first install (when no active controller exists), otherwise waits cleanly for user-triggered `{ type: "SKIP_WAITING" }`.
    - `activate`: purges stale `jantt-shell-*` caches and calls `self.clients.claim()`.
    - `message`: handles `{ type: "SKIP_WAITING" }`.
    - `fetch`:
      - Enforces exact `shouldBypassServiceWorker` rules.
      - Navigations (`request.mode === "navigate"`): **Network-First with Offline Fallback** (fetches fresh GitHub Pages HTML when online and updates cached `./index.html`; falls back to cached `./index.html` immediately when offline).
      - Hashed `/assets/*`: **Cache-First** (0ms instant app launch on Android!).
      - Other same-origin static files (`manifest.webmanifest`, `icons/*`, `favicon.svg`, `privacy.html`, `schema/*`): **Stale-While-Revalidate**.

#### 2.3 Safe Service Worker Registration (`apps/playground/src/services/platform/sw-register.ts`)
- Registers `"./sw.js"` (`{ scope: "./", updateViaCache: "none" }`) ONLY in production (`import.meta.env.PROD`) on `https:` or `localhost`/`127.0.0.1`.
- Exposes `onUpdateAvailable(applyUpdate)` for both already-waiting and newly installed workers.
- Checks for updates cleanly when the app returns to foreground (`visibilitychange` -> `visible`, throttled to once per 30 minutes) so returning Android TWA users pick up fresh GitHub Pages releases smoothly.
- Guard `controllerchange` reload with a single-fire boolean so the page never enters a reload loop.

---

### Phase 3: Production CSP Synchronization (`main.tsx` + `public/_headers`)

Update BOTH `apps/playground/src/main.tsx` (`buildProductionCsp`) and `apps/playground/public/_headers` in lockstep:
1. Add `manifest-src 'self'` explicitly.
2. Keep `worker-src 'self' blob:` (covers `./sw.js` + Monte Carlo & Resource Leveling workers).
3. Update `connect-src` so BYOK AI Copilot providers (OpenAI, Gemini, Anthropic, Groq, DeepSeek, OpenRouter, Mistral, xAI, custom HTTPS endpoints, and local Ollama `http://localhost:* http://127.0.0.1:*`) and remote HTTPS plan imports work cleanly in production GitHub Pages & Android TWA (`'self' https: wss://*.firebaseio.com wss://*.firebasedatabase.app http://localhost:* http://127.0.0.1:* data: blob:` plus configured Firebase/emulator origins), while keeping `script-src`, `frame-src`, `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'` strictly locked down.

---

### Phase 4: Platform Specialization Layer & Native Gesture Primitives

Create `apps/playground/src/services/platform/`:
- `types.ts`
- `detect.ts`
- `haptics.ts`
- `sw-policy.ts`
- `sw-register.ts`
- `launch-queue.ts`
- `index.ts`

And create 4 focused hooks in `apps/playground/src/hooks/`:
- `useAppPlatform.ts`
- `useAndroidBackNavigation.ts`
- `useSheetSwipeDismiss.ts`
- `useVisualViewport.ts`

#### 4.1 Platform Detection, Status Bar Theme Sync & Haptics
- **`detect.ts`:**
  - `AppSurface = "web-desktop" | "web-mobile" | "pwa-desktop" | "pwa-mobile" | "twa-android"`
  - `detectIsTwa(referrer, sessionStorage)`: detects `android-app://` referrer and persists `jantt_twa_android_session = "1"` in `sessionStorage` so internal route changes preserve TWA detection.
  - `detectIsStandalone(win)`: checks `(display-mode: standalone)`, `(display-mode: fullscreen)`, `navigator.standalone === true`, or `isTwa`.
  - `detectIsIosSafari(userAgent, maxTouchPoints)`: cleanly detects iOS/iPadOS Safari for guided install instructions.
  - `resolveAppSurface({ isMobile, isStandalone, isTwa })`.
  - `syncDocumentPlatformAttributes({ surface, isStandalone, isOnline })`: sets `data-surface`, `data-standalone`, and `data-offline` on `document.documentElement`.
  - `syncThemeColorMeta(mode, bgColor)`: live-updates `<meta name="theme-color">` whenever the user switches Jantt themes (`#090E1A` for Swiss Noir, `#FFFFFF` for Swiss Light, or the active theme's `--jantt-bg` hex) so Android's system status bar and gesture nav bar seamlessly match the active theme!
- **`haptics.ts`:**
  - `triggerHaptic(style: "light" | "medium" | "success")`: triggers subtle `navigator.vibrate([8])` / `[14]` / `[10, 30, 10]` ONLY when supported and `prefers-reduced-motion: reduce` is NOT active. Silently no-ops on desktop/iOS/jsdom.
- **`launch-queue.ts`:**
  - `registerLaunchQueueHandler(onJsonFile: (file: File) => void)`: wires `window.launchQueue` so opening a `.json` file from Android Files / Windows Explorer / macOS Finder launches Jantt directly into that plan!

#### 4.2 Native Gesture & Viewport Hooks
- **`useAppPlatform(isMobile: boolean)`:**
  - Unifies `surface`, `isStandalone`, `isTwa`, `isOnline`, `isIosSafari`, `canNativeShare`, `canInstall`, `promptInstall()`, `updateAvailable`, `applyUpdate()`.
  - Captures `beforeinstallprompt`, listens to `appinstalled`, `online`/`offline`, and registers the Service Worker in prod.
  - Fully SSR- and jsdom-safe.
- **`useVisualViewport()`:**
  - Tracks `window.visualViewport` height & offset on mobile/standalone and updates CSS custom property `--jantt-vvh` on `document.documentElement` (plus `data-keyboard-open="true"|"false"` when viewport shrinks by >140px from `window.innerHeight`).
  - Guarantees that when the Android/iOS virtual keyboard pops up inside **AI Copilot**, **Notes**, or **Task Edit Modals**, the input composer and Save buttons dock cleanly ABOVE the keyboard and `MobileBottomNav` smoothly hides while typing!
- **`useSheetSwipeDismiss({ onClose, enabled, thresholdPx = 92 })`:**
  - Real 60fps pointer/touch drag-to-dismiss hook for bottom sheets and mobile drawers!
  - Returns `{ handleProps, sheetStyle, isDragging }` to attach onto the pull-handle / sheet header.
  - Moves the sheet smoothly downward (`translateY(dy)` with slight backdrop opacity fade) while dragging down (`dy > 0`), dismisses on release if `dy >= thresholdPx` or downward velocity `>= 0.5px/ms` (with subtle light haptic), and springs smoothly back to `0` otherwise.
  - Never hijacks inner vertical scrolling inside `.mobile-sheet-body` or `.copilot-messages` (only initiates from the drag handle / header, or when scroll container `scrollTop <= 0`).
- **`useAndroidBackNavigation(overlays, enabled)`:**
  - Active when `mobile.isMobile || platform.isStandalone`.
  - Maintains a clean history sentinel stack (`{ janttOverlay: id }`) preserving `window.location.href` verbatim (never clobbering `?room=`, `?view=`, `?theme=`).
  - Pressing Android's hardware/gesture Back button closes the top-most open overlay (`MobileActionMenuSheet`, `CopilotDrawer`, `TaskSidebar`, `CommandPalette`, `ShortcutsModal`, `PlanManagerModal`, `ShareModal`, `PeopleModal`, etc.) instead of closing the app!
  - Cleans up its sentinel safely when an overlay is closed via UI button/Escape without triggering cascade pops.

---

### Phase 5: Full Specialized Mobile & Standalone App UI (Header, Footer, Sheets, FAB, Modals, Copilot)

This is where Jantt stops feeling like a "responsive website" and feels like a **purpose-built, native mobile & desktop app**, while sharing 100% of the same state and view components.

#### 5.1 Upgraded Mobile Top AppBar (`apps/playground/src/components/layout/MobileNavbar.tsx`)
Refine `MobileNavbar` (desktop `Navbar.tsx` stays desktop-optimized!):
- **Clean Native 2-Zone AppBar (`52px` + `env(safe-area-inset-top)`):**
  - **Left:** Tappable brand + plan switcher pill (`[JanttLogo] [Active Plan Name] [ChevronDown]`), with a subtle live green dot for active Cloud Rooms or a calm muted dot + `Offline` badge when `!isOnline`. Keeps `Viewer` / `Sign in to Edit` role pill when applicable.
  - **Right (3 crisp `40x40` thumb targets, zero clutter):**
    1. **1-Tap AI Copilot Button** (`Sparkles` icon, accented active state when `showCopilot` is open!): promotes Jantt's #1 flagship feature out of the buried menu onto the primary AppBar!
    2. **Share Button** (`Share2` icon)
    3. **Tools & Settings Sheet Trigger** (`MoreVertical` icon, with a subtle accent indicator dot when `updateAvailable` is true)
  - Move `Create New Plan` cleanly into the Plan Manager modal (already 1 tap from the plan pill!) and the Tools & Settings sheet so the AppBar stays airy and uncluttered on `360px` screens.

#### 5.2 Ergonomic 5-Tab Native Mobile Footer (`apps/playground/src/components/layout/MobileBottomNav.tsx`)
Upgrade `MobileBottomNav` for true native Android/iOS ergonomics (desktop `ViewNavBar` keeps all 6 tabs unchanged!):
- **5 Spacious Primary Bottom Tabs** (`Timeline` [Gantt], `Board` [Kanban], `Tasks`, `Health`, `Notes` with badge count):
  - Each tab gets `>= 20%` width (`72px+` on `360px` phones) and `>= 48px` tap height with a crisp Swiss **active indicator capsule** above/around the icon (Material 3 / iOS native feel) and `env(safe-area-inset-bottom)` padding.
  - Note: **60 FPS Canvas** remains 1 tap away inside `MobileActionMenuSheet` under `Views` (and if `activeView === "canvas"`, the `Timeline` tab highlights with a subtle `Canvas` label so users always know where they are!).
  - Tapping a tab triggers `triggerHaptic("light")`.
  - Automatically hides smoothly when `html[data-keyboard-open="true"]` (so the bottom nav never floats awkwardly above the Android keyboard while typing in Notes or Copilot!).

#### 5.3 Contextual Mobile Quick-Add FAB (`apps/playground/src/components/layout/MobileQuickFab.tsx`)
Create a sleek, Swiss-styled contextual Floating Action Button rendered ONLY on mobile (`mobile.isMobile && !mobile.isImmersiveLandscape && !isReadOnly && !hasAnyOverlayOpen`):
- Positioned cleanly above `MobileBottomNav` (`right: 16px; bottom: calc(var(--mobile-bottom-nav-h) + env(safe-area-inset-bottom) + 14px)`).
- Adapts contextually to the active view:
  - On `gantt`, `canvas`, `kanban`, `tasks`: **Add Task** (`Plus` icon, calls `tasks.handleAddNewTask()` + `triggerHaptic("light")`).
  - On `summary`: hidden (dashboard is read/analyze oriented) or jumps to AI Copilot (`Sparkles`).
  - On `notes`: hidden if `NotesView` already renders its own primary New Note button (verify `NotesView.tsx` first so there are NEVER duplicate floating `+` buttons!).
- Automatically hides when `data-keyboard-open="true"` or any modal/drawer/sheet is open.

#### 5.4 Real Swipe-to-Dismiss Sheets & Mobile Bottom-Sheet Modals
1. **`MobileActionMenuSheet.tsx`:**
   - Wire `useSheetSwipeDismiss` onto `.mobile-sheet-pull-handle` and `.mobile-sheet-header` so users can physically swipe the sheet down smoothly to dismiss!
   - Always include a compact **Views & Renderer** quick-toggle row (allowing 1-tap switch between `Gantt` and `60fps Canvas` on mobile, plus all 6 views when in immersive landscape).
   - Add a **New Plan** quick tile and an **Install App** row visible ONLY when `(canInstall || isIosSafari) && !isStandalone` (with crisp inline iOS Safari instructions if `isIosSafari && !canInstall`).
   - Add a clean **Update Available: Refresh Now** card at the top of the sheet when `updateAvailable` is true.
   - Add a subtle footer row inside the sheet showing **Jantt App Mode** (`Standalone App` / `Android App` / `Web`) + **Privacy Policy** link (`./privacy.html`, `target="_blank" rel="noopener noreferrer"`).
2. **`CopilotDrawer.tsx`:**
   - On mobile (`isMobile`), present as a sleek **full-height / 92% bottom sheet** with a pull-handle wired to `useSheetSwipeDismiss`, using `height: var(--jantt-vvh, 100dvh)` (capped cleanly) and `padding-bottom: env(safe-area-inset-bottom)` so the chat composer stays pinned directly above the virtual keyboard!
   - Add subtle `triggerHaptic("success")` when the user clicks Apply Changes on an AI diff.
3. **Shared Modal Shell (`apps/playground/src/components/modals/Modal.tsx`: inspect exact filename first):**
   - On narrow mobile viewports (`max-width: 640px`), style modals as smooth **slide-up bottom sheets** (`align-items: flex-end`, rounded top corners `16px 16px 0 0`, full width, `max-height: calc(var(--jantt-vvh, 100dvh) - 24px)`, `padding-bottom: env(safe-area-inset-bottom)`) instead of tiny cramped floating boxes! Desktop modals remain centered dialogs unchanged.

#### 5.5 Desktop App & Web Polish (`Navbar.tsx`, `ShareModal.tsx`, `App.tsx`)
- **Desktop `Navbar.tsx`:** Show a subtle, compact `Install App` button (or item inside the workspace menu) ONLY when `canInstall && !isStandalone`. Disappears automatically once installed as a Desktop PWA.
- **Desktop PWA Window-Controls-Overlay (`html[data-surface="pwa-desktop"]`):** Support safe padding when installed as a standalone desktop app; clean native feel with zero web-only install nags.
- **Native Share in `ShareModal.tsx`:** When `navigator.share` is available, add a clean **"Share via Device"** button next to Copy Link (uses the sanitized shareable URL only: never exposes editor keys; ignores `AbortError` silently).
- **Offline & Update Pills in `App.tsx`:**
  - Offline: subtle non-blocking Swiss pill (`Offline - Local changes saved`) + graceful disabled states only for cloud-only actions when offline (local editing, Gantt, Kanban, Tasks, Notes, Local Ollama AI all stay 100% functional!).
  - Update Ready: crisp dismissible Swiss toast/pill (`New version ready` + `Refresh` button calling `platform.applyUpdate()`).
- **PWA Shortcuts & File Launch in `App.tsx`:**
  - Handle `?action=new-plan` and `?action=copilot` once on mount and clean `action` & `source` params via `history.replaceState` without dropping `room`, `view`, or `theme`.
  - Wire `registerLaunchQueueHandler` to import launched `.json` plans cleanly with a confirmation toast.

#### 5.6 Platform-Specialized CSS (`apps/playground/src/index.css`)
Add a cleanly sectioned `/* === Platform Specialization (PWA / TWA / Native Mobile Shell) === */` block:
- `html[data-standalone="true"], html[data-surface="twa-android"]`:
  - `overscroll-behavior-y: contain;` (prevents accidental Android pull-to-refresh during vertical chart/Kanban dragging!)
  - `-webkit-tap-highlight-color: transparent;`
- Keyboard-aware layout:
  - `html[data-keyboard-open="true"] .mobile-bottom-nav, html[data-keyboard-open="true"] .mobile-quick-fab { display: none; }`
  - Mobile sheets & Copilot drawer use `var(--jantt-vvh, 100dvh)`.
- Safe-area insets (`env(safe-area-inset-top/bottom/left/right)`) on `.mobile-navbar`, `.mobile-bottom-nav`, `.mobile-sheet-card`, `.jantt-copilot-drawer`, and mobile modal sheets.
- Crisp `140ms` Swiss view-switch entrance animation on mobile/standalone (disabled under `@media (prefers-reduced-motion: reduce)`).
- Smooth sheet slide-up / drag transitions (`.is-dragging { transition: none !important; }`).
- Zero horizontal page overflow at `360px` width in both Swiss Noir Dark and Swiss Light themes.

---

### Phase 6: Hosted Privacy Policy Page (`apps/playground/public/privacy.html`)

Create a clean, self-contained, **zero-script** Swiss-styled HTML page at `apps/playground/public/privacy.html` (served live at `https://ahmadhassan-bted.github.io/Jantt/privacy.html`):
- Supports both dark and light mode via `@media (prefers-color-scheme: light)`.
- Clearly documents:
  1. Local-first storage (plans, preferences, snapshots, and BYOK AI keys live strictly on-device in browser storage).
  2. BYOK AI Copilot (prompts/plan snapshots go directly from browser to the user's chosen provider or local Ollama: never through Jantt servers).
  3. Optional Cloud Rooms (GitHub OAuth `read:user` scope + Firebase Realtime Database solely for live collaboration).
  4. Zero ads, zero third-party ad/analytics trackers, zero selling of user data.
  5. Data deletion instructions and maintainer contact (`ahmadhassan.bted@gmail.com`).

---

### Phase 7: Google Play Android TWA Packaging Kit (`apps/android-twa/`)

Create an isolated directory `apps/android-twa/` (NOT in root `package.json` `"workspaces"`!):
1. **`apps/android-twa/twa-manifest.template.json`:** Complete Bubblewrap TWA configuration pointing to `https://ahmadhassan-bted.github.io/Jantt/manifest.webmanifest`, `startUrl: "/Jantt/?source=twa"`, `display: "standalone"`, `themeColor: "#090E1A"`, `backgroundColor: "#090E1A"`, `navigationColor: "#090E1A"`, `splashScreenFadeOutDuration: 250`, `enableNotifications: false`, `fallbackType: "customtabs"`.
2. **`apps/android-twa/assetlinks.template.json`:** Exact Digital Asset Links JSON for `io.github.ahmadhassan_bted.jantt` with placeholder SHA-256 fingerprint.
3. **`apps/android-twa/PLAY_STORE_GUIDE.md`:** Step-by-step release & zero-maintenance operations playbook covering:
   - Installing Bubblewrap, generating the release `.aab`, and backing up the upload keystore safely outside Git.
   - **Critical GitHub Pages root-domain step:** Hosting `/.well-known/assetlinks.json` at `https://ahmadhassan-bted.github.io/.well-known/assetlinks.json` (in the root `AhmadHassan-BTed/ahmadhassan-bted.github.io` repo) with BOTH upload & Play App Signing SHA-256 fingerprints so Android opens Jantt 100% full-screen with zero URL bar.
   - Exact Google Play Console fields: Privacy Policy URL (`https://ahmadhassan-bted.github.io/Jantt/privacy.html`), Category (`Productivity`), Data Safety responses, Store Listing screenshots (portrait + landscape).
   - Ongoing operations: Pushing to `main` automatically ships features to Web, PWA, and Google Play Android users simultaneously without re-uploading `.aab` files!
4. **Update Root `.gitignore`**: Ignore `apps/android-twa/*.keystore`, `apps/android-twa/*.jks`, `apps/android-twa/*.aab`, `apps/android-twa/*.apk`, `apps/android-twa/app/`, `apps/android-twa/build/`, `apps/android-twa/.gradle/`, and `apps/android-twa/signing.properties`.

---

### Phase 8: Comprehensive Automated Test Suite

Create `apps/playground/src/services/platform/platform.test.ts` (Vitest) testing:
1. **Surface & TWA Detection:** `web-desktop`, `web-mobile`, `pwa-desktop`, `pwa-mobile`, `twa-android` (`android-app://` referrer + `sessionStorage` persistence across internal navigations), and `detectIsIosSafari`.
2. **Service Worker Policy (`sw-policy.ts`):**
   - Bypasses non-`GET` methods, `/sw.js`, and ALL cross-origin origins (Firebase RTDB, Firebase Auth, GitHub API, OpenAI, Gemini, Anthropic, Groq, DeepSeek, OpenRouter, Mistral, xAI, Ollama `http://localhost:11434`).
   - Handles same-origin shell & hashed `/assets/*` routes accurately.
3. **Theme-Color & Platform DOM Sync:** `syncDocumentPlatformAttributes` and `syncThemeColorMeta` update `<html>` attributes and `<meta name="theme-color">` across dark/light themes.
4. **Haptics Safety:** `triggerHaptic` respects `prefers-reduced-motion` and never throws when `navigator.vibrate` is unavailable.
5. **Manifest & PNG Binary Integrity:** Reads `apps/playground/public/manifest.webmanifest` from disk, verifies relative `./` URLs, verifies separate `any` vs `maskable` purposes, and validates every referenced icon file exists on disk with valid PNG magic bytes (`89 50 4E 47`) and exact IHDR dimensions matching `"sizes"`.
6. **Boot Splash & Privacy Policy Safety:** Verifies `apps/playground/index.html` contains `#jantt-boot-splash` with zero inline executable `<script>` tags (only `application/ld+json` and `<script type="module" src="...">`), and verifies `apps/playground/public/privacy.html` exists with zero `<script>` tags.
7. **CSP Parity:** Verifies `apps/playground/src/main.tsx` and `apps/playground/public/_headers` both declare `manifest-src 'self'` and `worker-src 'self' blob:`.

---

### Phase 9: Local CI, Build Output Audit & Visual Verification Gate

Run ALL of the following and ensure **100% exit code 0** before completing:

1. `npm run build` (all workspaces)
2. **Production Bundle Audit on `apps/playground/dist/`:**
   - Verify `dist/manifest.webmanifest`, `dist/sw.js`, `dist/privacy.html`, `dist/icons/icon-192.png`, `dist/icons/icon-512.png`, `dist/icons/icon-maskable-192.png`, `dist/icons/icon-maskable-512.png`, and `dist/icons/apple-touch-icon-180.png` all exist.
   - Run `node --check apps/playground/dist/sw.js` to verify valid Service Worker syntax.
   - Verify `dist/sw.js` precache list includes `./index.html` and hashed `./assets/*.js` & `./assets/*.css`.
3. `npm run lint` (all 10 `tsc --noEmit` projects + CLI/MCP syntax checks)
4. `npm test` (full monorepo test suite: 0 failures)
5. `npm run check:packages` (`publint --level warning` across all workspaces)
6. `python -m unittest discover -s python/tests`
7. **Zero-Emoji & Zero-Em-Dash Audit** across every created and modified file.

---

### Phase 10: Final Report

When every verification step passes, report concisely:
1. Exact list of created and modified files.
2. How each surface specializes natively (Desktop Web, Desktop PWA, Mobile Web/PWA, Google Play Android TWA) while maintaining **zero duplicated business logic**.
3. Verification results from all CI stages and the `dist/` PWA audit.
4. The exact 3 manual steps for the maintainer to generate and upload the initial `.aab` to Google Play Console using `apps/android-twa/PLAY_STORE_GUIDE.md`.
