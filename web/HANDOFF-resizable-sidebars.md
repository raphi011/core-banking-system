# Handoff — Resizable sidebars (shadcn resizable panels)

Make both the **left nav** and the **right concept rail** resizable by dragging,
using shadcn's `resizable` component (wraps `react-resizable-panels`). Sizes
persist across reloads. Both panels are **collapsible**: the right rail keeps its
existing collapse-to-strip behavior; the left nav collapses to an **icons-only
rail** (links stay navigable as centered icons with tooltips).

Branch: `claude/resizable-sidebars` (off `main`).

## Decision

Chosen approach: **shadcn `resizable`** (not the custom drag-handle hook).
Rationale: we want *two* resizable panels now (left + right) and may add more
split views later; the library gives keyboard-accessible, ARIA-instrumented
handles and a real layout engine. v4 supports **pixel** sizing, which removes the
old percentage-only blocker.

Verified facts (June 2026):
- `react-resizable-panels` latest **4.11.2**, **zero runtime deps**, peer
  `react ^18 || ^19` → our React 19.2.4 is fine.
- **Size units:** a *numeric* `minSize={256}` means **256px**; unit-less strings
  are percentages; `px/%/em/rem/vh/vw` all accepted.
- **Collapsible:** `collapsible` + `collapsedSize` (px ok) + imperative ref
  (`collapse/expand/isCollapsed/resize/getSize`).
- shadcn component: `npx shadcn@latest add resizable` → `src/components/ui/resizable.tsx`
  exporting `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle`
  (`withHandle` shows a grip; group takes `orientation="horizontal"`). Confirm the
  generated prop names against the installed version after running the CLI.

## Target architecture

One horizontal `ResizablePanelGroup` (id `app-shell`) spanning the desktop width,
three panels separated by two handles:

| Panel (id, order) | Content | default | min | max | collapsible |
|---|---|---|---|---|---|
| `nav` (1) | Brand + NavLinks + ResetButton | 240px | 200px | 360px | yes, `collapsedSize` 56px (icons-only) |
| `main` (2) | header (topbar) + `<main>` | fills | 480px | — | no |
| `concepts` (3) | ConceptPanelBody / collapsed strip | 320px | 256px | 640px | yes, `collapsedSize` 32px |

- `ResizableHandle withHandle` between nav|main and main|concepts, restyled to the
  existing subtle border aesthetic (`border-l`/`border-r` + hover highlight) — do
  not introduce a new look (`web/CLAUDE.md`).

## The two real integration costs

1. **Responsive gating (JS, not CSS).** Today both sidebars use CSS
   (`hidden md:flex`); the mobile layout uses Sheets (Menu → nav, BookOpen →
   concepts). `react-resizable-panels` measures pixels and **mis-measures hidden
   panels**, so the PanelGroup must render **only at `md+`**, switched by a
   `matchMedia('(min-width: 768px)')` store (mounted-safe, mirrors the provider's
   `DESKTOP_QUERY`). Plan:
   - `DesktopShell` = the `ResizablePanelGroup` (nav | main | concepts).
   - `MobileShell` = the center column only (header + `<main>`); nav and concepts
     come from the existing Sheets in the header.
   - Server snapshot returns **mobile** (desktop=false) to keep SSR deterministic;
     swap to desktop after mount. Accept a one-frame flash on desktop, or hide the
     shell until mounted — note the tradeoff, pick the smaller flash.
2. **Collapse reconciliation.** Collapse state currently lives in the provider +
   `localStorage` (`concept-panel-collapsed`) and is driven programmatically
   (`openConcept`/`togglePanel` reveal the rail). Bridge it to the concepts panel:
   - Hold a `ref<ImperativePanelHandle>` on the concepts `ResizablePanel`.
   - Effect: when provider `collapsed` changes, call `ref.collapse()` /
     `ref.expand()` (guard with `ref.isCollapsed()` to avoid loops).
   - `onCollapse`/`onExpand` on the panel call `setCollapsed(true/false)`.
   - Render the collapsed strip UI (vertical "Concepts" + expand button) inside the
     panel when collapsed (drive off provider `collapsed`).
   Keep `concept-panel-collapsed` as the collapse source of truth (so
   `openConcept`/`togglePanel` keep working unchanged).
3. **Left-nav collapse (icons-only).** New, simpler than the rail (no programmatic
   reveal). A generic `useCollapsed(storageKey)` hook (localStorage +
   `useSyncExternalStore` + a custom event, mirroring the provider's collapse
   plumbing) backs key `nav-panel-collapsed`. Bridge it to the `nav` panel's
   imperative ref the same way (effect drives `collapse()/expand()`;
   `onCollapse/onExpand` write the hook). When collapsed, `NavLinks` render
   icon-only: centered `<Icon>`, `title={label}` + `aria-label` for a tooltip
   (no shadcn `tooltip` dependency), active highlight preserved; `Brand` shows the
   mark only; `ResetButton` renders icon-only. A toggle button (`PanelLeftClose` /
   `PanelLeftOpen`) sits at the nav footer; dragging below `minSize` also collapses
   it (library behavior).

## Persistence

- **Sizes:** prefer the library's built-in persistence if the installed v4 exposes
  it (`autoSaveId="app-shell-layout"` on the group). If v4 dropped it, persist via
  `onLayout(sizes) → localStorage["app-shell-layout"]` and restore through each
  panel's `defaultSize`. Confirm which exists by reading the generated
  `resizable.tsx` / `node_modules/react-resizable-panels` types.
- **Collapse:** unchanged — provider + `concept-panel-collapsed`.

## Files

- **add** `src/components/ui/resizable.tsx` (shadcn CLI; also installs
  `react-resizable-panels`).
- **add** `src/components/use-is-desktop.ts` — `matchMedia` store via
  `useSyncExternalStore` (snapshot=false on server).
- **add** `src/components/use-collapsed.ts` — generic `useCollapsed(storageKey)`
  (localStorage + `useSyncExternalStore` + custom event) for the left-nav collapse.
- **edit** `src/components/app-shell.tsx` — split into `DesktopShell` (PanelGroup)
  + `MobileShell`; responsive switch; nav + concepts panel refs + collapse bridges;
  icons-only `NavLinks`/`Brand`/`ResetButton` collapsed states; nav collapse
  toggle; restyle handles.
- **edit (maybe)** `src/components/concept-panel-provider.tsx` — only if the
  collapse bridge needs an extra hook; prefer keeping the bridge in `app-shell`.

## Gotchas

- v4 numeric sizes = **pixels** (not percent). Don't pass `256` expecting 256%.
- PanelGroup mis-measures hidden panels → gate by JS media query, never CSS `hidden`.
- Each panel needs a stable `id`/`order` for persistence to associate correctly.
- shadcn CLI here runs under **npm** (not pnpm): `npx shadcn@latest add resizable`.
  Verify the generated component's prop names (`orientation` vs `direction`,
  `withHandle`) against what shipped.
- Avoid a hydration mismatch: the PanelGroup is client-only; SSR renders the mobile
  shell.

## Verification (no FE test runner — verify in browser)

```bash
# backend (repo root)
go run ./cmd/server
# frontend (web/)
npm run dev            # http://localhost:3000
npm run typecheck      # must be clean
npm run lint           # must be clean
npm run build          # must be clean
```

Manual checks:
1. Drag the left handle → nav resizes within 200–360px; drag the right handle →
   rail resizes within 256–640px.
2. Collapse the rail (existing button) → strip shows; expand restores width.
   Dragging the rail below its min collapses it; `?`/concept links re-expand it.
3. Collapse the left nav (toggle) → icons-only rail; links still navigate (tooltips
   on hover), active item highlighted; toggle/drag re-expands.
4. Reload → both panel widths and both collapse states restored.
5. Shrink viewport below `md` → sidebars give way to the Menu/BookOpen Sheets;
   no layout errors. Grow back → panels return.
6. Dark mode + handle styling match the existing minimal aesthetic.

## Decisions locked

- Both panels resizable + **collapsible**. Left nav collapses to **icons-only**
  (56px), right rail to its **strip** (32px). Confirmed with the user.
