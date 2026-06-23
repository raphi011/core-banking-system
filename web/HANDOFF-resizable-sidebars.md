# Handoff — Resizable sidebars (shadcn resizable panels)

Make both the **left nav** and the **right concept rail** resizable by dragging,
using shadcn's `resizable` component (wraps `react-resizable-panels` v4). Sizes
persist across reloads. Both panels are **collapsible**: the right rail keeps its
existing collapse-to-strip behavior; the left nav collapses to an **icons-only
rail** (links stay navigable as centered icons with tooltips).

This doc is self-sufficient: a fresh context can implement from here alone.

## Current state / progress

- Branch: `claude/resizable-sidebars` (off `main`).
- **Done & committed:**
  - This handoff (`web/HANDOFF-resizable-sidebars.md`).
  - `web/src/components/ui/resizable.tsx` — shadcn wrapper — and
    `react-resizable-panels ^4.11.2` added to `package.json`/`package-lock.json`
    (public npm registry; verified no Artifactory URLs). Commit `a254990`.
- **Remaining work:**
  1. add `web/src/components/use-is-desktop.ts`;
  2. rewrite `web/src/components/app-shell.tsx` (DesktopShell PanelGroup +
     MobileShell + collapse bridges + icons-only nav).
  - `web/src/components/concept-panel-provider.tsx` needs **no change** (see wiring).
- Run / verify:
  ```bash
  go run ./cmd/server            # backend, repo root, :8080
  cd web && npm run dev          # http://localhost:3000
  npm run typecheck && npm run lint && npm run build   # all must be clean
  ```

## Decision

Chosen approach: **shadcn `resizable`** (not a custom drag-handle hook). We want
two resizable panels now (left + right) and may add split views later; the
library gives keyboard-accessible, ARIA-instrumented handles and a real layout
engine, and v4 supports **pixel** sizing (the old percentage-only blocker is gone).

## Installed v4 API (authoritative — verified against `node_modules` types)

Import the shadcn wrappers from `@/components/ui/resizable`:
`ResizablePanelGroup` (→ rrp `Group`), `ResizablePanel` (→ `Panel`),
`ResizableHandle` with optional `withHandle` (→ `Separator`). The imperative
hooks come from `react-resizable-panels` directly: `usePanelRef`, `useGroupRef`.

- **Sizes:** a **numeric value = pixels** (`minSize={256}` ⇒ 256px). Unit-less
  strings = percent; `px/%/em/rem/vh/vw` accepted. `PanelSize = { asPercentage:
  number; inPixels: number }`.
- **`ResizablePanelGroup`** (GroupProps): `orientation="horizontal"`,
  `defaultLayout`, `onLayoutChanged` (fires after pointer release — use for
  saving), `onLayoutChange` (fires every move), `groupRef`, `id`, `disabled`.
- **`ResizablePanel`** (PanelProps): `id`, `collapsible`, `collapsedSize`,
  `defaultSize`, `minSize`, `maxSize`, `panelRef`, `onResize(panelSize, id, prev)`,
  `disabled`. ⚠️ **No `order` prop. No `onCollapse`/`onExpand`.**
- **Imperative handle** `PanelImperativeHandle` (via `panelRef` / `usePanelRef()`):
  `collapse()`, `expand()`, `isCollapsed()`, `getSize()`, `resize(size)`. Group
  handle (`useGroupRef()`): `getLayout()`, `setLayout()`.
- **Collapse semantics:** a `collapsible` panel collapses to `collapsedSize` when
  dragged below `minSize`. There is **no collapse event** — detect via `onResize`
  (`panelSize.inPixels <= collapsedSize`) or `panelRef.current?.isCollapsed()`.
- **Persistence:** **no `autoSaveId`.** Use
  `useDefaultLayout({ id, panelIds, storage? })` → `{ defaultLayout,
  onLayoutChanged }`; spread both onto `ResizablePanelGroup`. Default storage is
  `localStorage`; SSR-safe (returns `undefined` defaultLayout on the server).
  `panelIds` must match the rendered panel ids.

## Target architecture

One horizontal `ResizablePanelGroup` (id `app-shell`) spanning the desktop width,
three panels separated by two handles:

| Panel (id) | Content | default | min | max | collapsible |
|---|---|---|---|---|---|
| `nav` | Brand + NavLinks + ResetButton | 240px | 200px | 360px | yes, `collapsedSize={56}` (icons-only) |
| `main` | header (topbar) + `<main>` | fills | 480px | — | no |
| `concepts` | ConceptPanelBody / collapsed strip | 320px | 256px | 640px | yes, `collapsedSize={32}` |

## Decided wiring (do exactly this)

- **Size persistence:**
  `const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "app-shell",
  panelIds: ["nav", "main", "concepts"] })`, then
  `<ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout}
  onLayoutChanged={onLayoutChanged}>`. Persists all three sizes (incl. collapsed
  sizes) to localStorage.
- **Responsive gating:** `useIsDesktop()` (`matchMedia('(min-width: 768px)')` via
  `useSyncExternalStore`, **server snapshot = false**). Render `<DesktopShell/>`
  only when desktop, else `<MobileShell/>`. The PanelGroup therefore never renders
  on the server (no SSR layout shift) and never on hidden panels (rrp mis-measures
  those — this is why we can't just CSS-hide it).
- **Concepts rail collapse — keep the provider as source of truth; do NOT refactor
  the provider:**
  - `const conceptRef = usePanelRef()`;
    `<ResizablePanel id="concepts" collapsible collapsedSize={32} minSize={256}
    maxSize={640} defaultSize={320} panelRef={conceptRef} onResize={…}>`.
  - Effect (deps `[collapsed]`): if `collapsed && !conceptRef.current?.isCollapsed()`
    → `conceptRef.current?.collapse()`; else if
    `!collapsed && conceptRef.current?.isCollapsed()` → `…expand()`.
  - `onResize={(s) => { const c = s.inPixels <= 40; if (c !== collapsed)
    setCollapsed(c); }}` (uses provider `setCollapsed`; the `!==` guard prevents
    loops).
  - Render the collapsed strip (vertical “Concepts” + expand button) vs
    `<ConceptPanelBody onCollapse={() => setCollapsed(true)} />` off `collapsed`.
  - `openConcept`/`togglePanel`/`revealPanel` already call `setCollapsed(false)` on
    desktop → the effect expands the panel. Unchanged.
- **Left nav collapse — local to DesktopShell; persisted via the layout (no extra
  storage):**
  - `const [navCollapsed, setNavCollapsed] = useState(false)`;
    `const navRef = usePanelRef()`;
    `<ResizablePanel id="nav" collapsible collapsedSize={56} minSize={200}
    maxSize={360} defaultSize={240} panelRef={navRef}
    onResize={(s) => { const c = s.inPixels <= 64; if (c !== navCollapsed)
    setNavCollapsed(c); }}>`.
  - Footer toggle button: `navCollapsed ? navRef.current?.expand() :
    navRef.current?.collapse()` (icons `PanelLeftOpen` / `PanelLeftClose`).
  - When `navCollapsed`: `NavLinks` render icon-only (centered `<Icon>`,
    `title={label}` + `aria-label` for a native tooltip — **no shadcn `tooltip`
    dependency**, active highlight kept); `Brand` shows the mark only; `ResetButton`
    renders icon-only. `useDefaultLayout` restores the nav’s collapsed size on
    reload and `onResize` then sets `navCollapsed` (a one-frame expanded flash is
    acceptable). **No `nav-panel-collapsed` key / `use-collapsed.ts` needed.**
- **Handles:** `<ResizableHandle withHandle />` between nav|main and main|concepts;
  the shadcn default already uses `bg-border` — keep it subtle per `web/CLAUDE.md`,
  no new aesthetic.

## Provider consumer map (don’t break these)

`useConceptPanel()` consumers:
- `openConcept` → `hint.tsx`, `concept-markdown.tsx`, `concept-panel.tsx`
- `setDefaultConcept` → `page-header.tsx`
- `collapsed` / `setCollapsed` / `mobileOpen` / `setMobileOpen` / `togglePanel`
  → `app-shell.tsx` only
- `ConceptPanelBody({ onCollapse })` lives in `concept-panel.tsx`.

Keep the `useConceptPanel()` interface (and the `concept-panel-collapsed`
localStorage behavior) exactly as-is.

## Layout sketch (app-shell.tsx after rewrite)

```
AppShell → ConceptPanelProvider → Shell
Shell: const desktop = useIsDesktop(); return desktop ? <DesktopShell> : <MobileShell>
DesktopShell:
  ResizablePanelGroup(orientation=horizontal, defaultLayout, onLayoutChanged)
    ResizablePanel#nav (collapsible, navRef, onResize→navCollapsed)
       NavSidebar(collapsed=navCollapsed, onToggle)   // Brand + NavLinks + ResetButton + toggle
    ResizableHandle withHandle
    ResizablePanel#main (minSize 480)
       Header(no Menu button on desktop) + <main>{children}</main>
    ResizableHandle withHandle
    ResizablePanel#concepts (collapsible, conceptRef, onResize→setCollapsed)
       collapsed ? <ConceptStrip onExpand> : <ConceptPanelBody onCollapse>
  + <ConceptSheet/> stays (harmless on desktop; it’s md:hidden)
MobileShell:  // current behavior
  Header(with Menu Sheet → nav, BookOpen → concepts) + <main>{children}</main>
  + <ConceptSheet/>
```
The header’s desktop vs mobile bits already use `md:hidden`; keep the mobile nav
`Sheet` (Menu) and the `ConceptTrigger` (BookOpen) for `MobileShell`.

## Gotchas

- v4 numeric sizes = **pixels**, not percent.
- rrp **mis-measures hidden panels** → gate the PanelGroup behind a JS media query,
  never CSS `hidden`.
- v4 has **no `onCollapse`/`onExpand` and no `order`** — detect collapse via
  `onResize`/`isCollapsed()`; order panels by DOM position.
- Persistence is `useDefaultLayout` (**no `autoSaveId`**); `panelIds` must match.
- shadcn CLI here runs under **npm**: `npx shadcn@4.11.0 add <comp> -y`.
- Mobile (below `md`) keeps the existing header Sheets; `MobileShell` is just
  header + `<main>` + `ConceptSheet`.

## Verification (browser; no FE test runner)

Manual checks:
1. Drag the left handle → nav resizes within 200–360px; drag the right handle →
   rail resizes within 256–640px.
2. Collapse the rail (existing button) → strip shows; expand restores width.
   Dragging the rail below its min collapses it; a `?`/concept link re-expands it.
3. Collapse the left nav (toggle) → icons-only rail; links still navigate (tooltips
   on hover), active item highlighted; toggle/drag re-expands.
4. Reload → both panel widths and both collapse states restored.
5. Shrink viewport below `md` → sidebars give way to the Menu/BookOpen Sheets;
   no layout errors. Grow back → panels return.
6. Dark mode + handle styling match the existing minimal aesthetic.

## Decisions locked

Both panels resizable + collapsible. Left nav → **icons-only** (56px), right rail →
**strip** (32px). Sizes persisted via `useDefaultLayout`; concepts collapse stays
provider-owned; provider unchanged.
