# Frontend Guide

How the browser app is laid out, how its two themes work, and the rules that keep a new screen consistent with the rest. The components can be seen live on the **Design System** page of the app.

---

## 1. Layout

`src/components/AppShell.tsx` frames every page:

- **Sidebar** with the navigation, grouped as Home, Field work, Coordination and Insight. From Tailwind's `lg` breakpoint up (64rem: 1024px at the default font size) it sits next to the page. Below that it is a drawer behind the menu button in the top bar.
- **Top bar** with the points and the theme switch. On wide screens it also holds the demo controls: city, weather, role (Volunteer or Coordinator) and offline mode. On narrow screens those controls are in the drawer.
- **Footer** with the link to the status page and the repository download.

| Page | File | Data |
| :--- | :--- | :--- |
| Overview (home) | `Overview.tsx` | Demo state in the browser |
| Freshness Map | `FreshnessMap.tsx` | Demo state |
| 1-Minute Missions, the check-in and its receipt | `MissionList.tsx`, `MissionCheckModal.tsx`, `ReceiptModal.tsx` | Demo state |
| Trace Hunts | `TraceHuntView.tsx` | Demo state |
| Crews & Streaks | `CrewsView.tsx` | Demo state |
| Dispatch Queue | `MissionsDispatchScreen.tsx`, `SignInPanel.tsx` | The API |
| Coordinator Console (coordinator role only) | `CoordinatorConsole.tsx` | Demo state |
| Systems to Streams | `FhirBridgeView.tsx` | Demo state |
| Evidence & Studies | `EvidenceView.tsx` | One live simulation, and three illustrative examples labelled as such |
| Design System | `DesignSystemShowcase.tsx` | Samples |
| Status (`/status`, outside the shell) | `StatusPage.tsx` | `GET /api/health` |

There is no router: `activeTab` in `AppContext` says which page shows, and `/status` is read from the address once at load.

The demo state lives in `src/context/AppContext.tsx`. Each city keeps its own reaches once opened, so progress survives a visit to another city. The rules for what a check earns and changes, how incidents take evidence and which missions are open are pure functions exported from that file and tested in `src/context/__tests__/rules.test.ts`. Confirming an advisory, handing an incident off and approving a FHIR request are coordinator steps: the buttons show in the Coordinator role only.

`src/components/presentation.ts` holds the rules several pages share: the three freshness states and their thresholds, age labels, the network summary, mission sources, points and ranking, incident status colours. The points a mission card shows come from the same engine rule that credits the check (`checkPoints` in `src/engine/freshness.ts`), so the two always agree.

---

## 2. Themes

Light is the default; the switch in the top bar changes to dark and back.

- The theme is the `data-theme` attribute on `<html>`, kept in `localStorage` under `naiad.theme`.
- `public/theme.js` applies a saved dark theme before the first paint. It is a file, not an inline script, because the production Content-Security-Policy allows scripts from the app's own origin only.
- `src/theme.ts` is the `useTheme()` hook behind the switch.
- All colours are in `src/index.css`.

### Colour roles

A step of a scale always plays the same role, and its value depends on the theme. Dark uses Tailwind's palette as it is; light overrides each step.

| Neutral step | Role |
| :--- | :--- |
| `slate-950` | Page background |
| `slate-900` | Card surface |
| `slate-850` | Quiet surface inside a card (wells, table headers) |
| `slate-800` | Fills and quiet borders |
| `slate-700`, `slate-600` | Borders, hover borders |
| `slate-500` | Marks and neutral fills. Not for text: it is too faint in the dark theme |
| `slate-400` | Muted text, the faintest text |
| `slate-300` | Body text |
| `slate-200` to `slate-50` | Strong text and headings |

| Accent step | Role |
| :--- | :--- |
| `950`, `900` | Tinted backgrounds |
| `800`, `700` | Borders of tinted elements |
| `600`, `500` | Strong fills and marks (bars, map nodes) |
| `400` | Text and icons on a plain surface |
| `300`, `200` | Text on the accent's own tint |

Rules:

1. **Six palettes are theme-relative:** slate, cyan, emerald, amber, rose and indigo. Any other Tailwind palette keeps one value in both themes, so give it light values in `src/index.css` before using it.
2. **No `white` or `black`.** Use `slate-50` for the strongest text and `slate-900` for a surface.
3. **Solid fills come with their text colour:** `bg-primary text-on-primary`, and the same for `success`, `warning` and `danger`.
4. **Text fields use `border-control`**, which keeps a 3:1 outline on every surface (WCAG 1.4.11).
5. **Colour never carries meaning alone.** A freshness state, a status or an alert always has its word next to it.

`src/components/__tests__/contrast.test.ts` reads the colours from `src/index.css` and fails when one of the role pairs it lists drops below WCAG AA in either theme. It checks the tokens; whether a screen uses them as intended is still a matter of review.

### Type scale

System fonts. `text-xs` is 13px (body), `text-2xs` 12px (captions), `text-3xs` 11px (badges, table headers); larger sizes are Tailwind's.

---

## 3. Components

Everything in `src/components/design-system/` is exported from its `index.ts`.

| Component | Use |
| :--- | :--- |
| `PageHeader` | The title block of a page. It renders the page's only `<h1>` |
| `Panel` | A card with a titled header: the standard section. `flush` for tables |
| `StatCard` | One headline number with its label and caption |
| `Button`, `IconButton` | Seven variants and three sizes. A loading button ignores clicks but keeps keyboard focus. `IconButton` needs a `label` and becomes a toggle with `aria-pressed` |
| `Badge`, `Notice`, `Meter` | A status pill, a message block and a bar, in six tones |
| `Segmented`, `Chips` | One choice among a few short options (a track that wraps when it must), or among many or long ones (separate pills) |
| `Input`, `Select` | Labelled fields with a hint and an announced error |
| `Modal`, `useOverlay` | Dialogs. Focus moves in, Tab stays in, Escape closes, and focus goes back to what opened the dialog (or to the page when that is gone). The navigation drawer uses the same hook |
| `Table` | Scoped headers, a caption for screen readers, sideways scrolling in its own box |
| `ToastProvider`, `useToast` | Messages that dismiss themselves |
| `EmptyState`, `ErrorState`, `SkeletonCard` | Nothing to show, something failed, still loading |

CSS utilities defined in `src/index.css`: `card`, `well`, `badge`, `tile`, `shadow-pop`, and the `animate-in` family.

---

## 4. Rules for a New Screen

1. Start with `PageHeader`, then `Panel`s inside `<div className="space-y-6">`. The shell supplies the page padding and width.
2. Give every grid a base column count (`grid grid-cols-1 ...`). A grid without one lets long content push the page wider than a phone.
3. Do not pass a class that fights one the component already sets (a second background, height or text colour): which of the two wins is decided by the stylesheet's order, not by the order in `className`. Use the component's props or variants.
4. Build dialogs with `Modal`, tables with `Table`.
5. Keep what is simulated labelled as simulated in the screen's own text.
6. Treat motion as decoration. `animate-in`, the map's selection ring and the receipt's confetti all stop for visitors who ask for reduced motion; give a new animation a `motion-reduce:` variant.

---

## 5. Checks

- `npm test` includes the token contrast suite, the presentation rules, and the markup audit (labels, named buttons, dialog semantics, one `<h1>` per page, the shell's landmarks, text labels for freshness).
- `npm run test:e2e` drives the app on a desktop and a phone size: navigation and the drawer, the check-in, a trace drill up to the coordinator's approval, crews, sign-in, the theme switch, keyboard use of dialogs and the map, the demo controls (storm, offline queue, role), and progress (repeat checks, weekly streaks, a city round trip).
