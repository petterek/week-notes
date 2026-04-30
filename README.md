# 📅 Ukenotater (Week Notes)

> 🌀 **Totally vibe-coded.** No specs, no tickets, no roadmap — just a long conversation with an AI pair-programmer and a steady stream of "ooh, what if it also did this?" Every feature here exists because it felt right in the moment. Reader discretion advised.

A self-hosted, single-binary Node.js web app for keeping structured weekly notes, tasks, people and results across multiple isolated **contexts** — each one its own git repo.

Built for the daily reality of knowledge work: notes are markdown, tasks live next to the week they came up in, and everything is plain files on disk you can grep, back up, and version with git.

---

## 📜 Changelog

### 2026-04-30 (settings: + Ny kontekst, default meeting length)
- **Settings page** got a `+ Ny kontekst` button at the bottom of the contexts rail. Opens a small modal (name / icon / description / optional git remote), `POST /api/contexts`, then auto-selects the new context. Replaces the legacy SSR `newCtxForm` that disappeared during the SPA port.
- **Meeting types** now have a per-type `defaultMinutes` field (number input next to the all-day toggle). When you create a meeting from the calendar (header `+ Nytt`, dblclick or right-click), the end time is computed as `start + type.defaultMinutes`, falling back to the context's `defaultMeetingMinutes` and finally 60. Wired in both `<today-calendar>` and `<week-notes-calendar>`.

### 2026-04-30 (today-calendar create)
- **`<today-calendar>`** can now create meetings: a `+ Nytt` button in the heading and a right-click / dblclick on the grid open an overlay with `<meeting-create>` (pre-filled with today's date or the picked slot). On save the overlay closes and the grid reloads.

### 2026-04-29 (today calendar on home)
- **`<today-calendar>`** added to the home page sidebar, below `<upcoming-meetings>`. Wraps a single-day `<week-calendar>` (start = end = today) and loads today's meetings from the meetings service. Picks up the active context's `workHours` / `visibleStartHour` / `visibleEndHour` from `/api/contexts`. Auto-rolls over at midnight via `nav-meta:newDay` and re-loads on `context-selected`. Heading shows the localized day + date.

### 2026-04-29 (nav-meta boundary events)
- **`<nav-meta>`** now emits `nav-meta:newMinute`, `nav-meta:newHour`, `nav-meta:newDay`, `nav-meta:newWeek`, `nav-meta:newMonth` and `nav-meta:newYear` (composed/bubbles) when the wall clock crosses each boundary. Detail payload contains the new value (`minute` / `hour` / `date` / `week` / `month` / `year`) and the `now` Date. No event fires on initial mount — only on actual transitions. Pages can listen on `document` to refresh "today / this week" derived UI without polling.

### 2026-04-29 (inline-create markers)
- **`{{X}}` and `[[X]]` markers in notes.** New shorthand for inline-creating entities while writing notes:
    - `{{X}}` → creates a new task with text X
    - `[[X]]` → creates a new result with text X (replaces the legacy single-bracket `[X]` syntax)
  Markers render as styled pills (green for tasks, blue for results) in any markdown preview via the new `<inline-action>` component, registered through `linkMentions` (server + client). On **explicit** save (Save / Lagre button on note editor, or task-note-modal save), the server creates the corresponding entities, strips the markers (keeping inner text), and writes a clean note. On **autosave** (the editor's 30s countdown), markers are preserved untouched so half-typed text like `{{Send rep` won't accidentally create a "Send rep" task. The `/api/save` response now includes `content` (cleaned) and `createdTasks` / `createdResults` counts; the note editor reflects the cleaned content back into the textarea after explicit save.

### 2026-04-29 (note editing modal + ➕ button on open list)
- **`<task-note-modal>`** — new dumb modal that edits a task's note. Same callback API as `<task-complete-modal>` / `<task-create-modal>`: `modal.open(task, cb)` runs the callback once with `{ saved, id, note }` (or `{ saved: false, id }` on Esc / backdrop / ✕). Markdown + `@mentions` are written through to the existing `tasks_service.update(id, { note })` API. Pre-fills the textarea with the existing note and places the cursor at the end. Esc / Ctrl-⌘+Enter shortcuts.
- **`<task-open-list>`** — note 📓 button now opens the new `<task-note-modal>` (mounted in shadow DOM) and persists via the service on save. Add (`＋`) button opens `<task-create-modal>` via the new callback API. The legacy `window.openNoteModal` on the SSR tasks page is left untouched for now.
- **`<task-create-modal>`** — refactored to a dumb callback API (`modal.open(cb)`); the trigger button is gone, the inner `<task-create>` still emits `task:created` so the global SPA cross-list refresh wiring keeps working.

### 2026-04-29 (results-page SPA)
- **`<results-page>`** — SPA replacement for `/results`. Lists results grouped by ISO week (descending), each card with edit / delete actions; header has a "Nytt resultat" button. Both edit and create use a shadow-local modal (Esc cancels, Ctrl/⌘+Enter saves). `@`-mentions render via `linkMentions` + `<entity-mention>` chips so they auto-resolve display names. Hash deep-link `/results#r-<id>` scrolls to and briefly flashes the matching card. `pages/results.html` now mounts the component; the legacy SSR `/results` body is unreachable (SPA stub wins) and will be removed in a follow-up.

### 2026-04-29 (callout + mention chip + modal callback)
- **`<entity-mention>` chip.** Reusable inline element representing a reference to a person, company or place. Given `kind` + `key` it auto-resolves the entity from `window['week-note-services']` (falling back to `window.MockServices`), shares one cached Promise per kind across the page, and re-renders with the friendly display name (`FirstName LastName` for people, `name` for companies/places). Optional `label` attribute skips the lookup. Emits `hover-{kind}` (with `{ key, entering, x, y }`) and `select-{kind}` (with `{ key }`). All `linkMentions` callsites now emit `<entity-mention>` instead of `.mention-link` anchors; the result-person renderer was switched too. Document-level `select-person`/`select-company`/`select-place` handlers in the SPA shell turn clicks into navigation.
- **`<entity-callout>` is fully dumb.** Refactored to a pure presentation tooltip: `setData({ kind, entity, key, x, y })`, `hide()`, public `position(x, y)`. No services, no document listeners, no cache. The SPA shell hosts a single `<entity-callout id="appEntityCallout">` and listens at `document` for `hover-*` events (composed events bubble across all shadow boundaries), resolves the entity from lazy-loaded services and drives the callout. A small `.mention-link` mouseover/mouseout/mousemove bridge converts any leftover legacy anchors to the same hover events.
- **`<person-tip>` removed.** Replaced entirely by the shell-level callout host + `.mention-link` bridge.
- **Card hover events carry coordinates.** `<person-card>`, `<company-card>` and `<place-card>` now include `x: e.clientX, y: e.clientY` on every `hover-*` detail. The header company-pill in `<person-card>` also emits `hover-company`/`select-company` via a `data-ref="company"` attribute.
- **`<task-complete-modal>`** (new) — replaces the legacy inline `commentModal` for completing a task with an optional comment. Centered modal, dumb component. **Callback API** (not events): `modal.open({ id, text }, (res) => …)` runs the callback once with `{ confirmed: true, id, comment }` or `{ confirmed: false, id }`. Esc / backdrop / ✕ cancel; Ctrl/⌘+Enter confirms. Closing the modal silently drops the callback.
- **`<open-tasks>` → `<task-open-list>`** (renamed: file, class, custom-element tag, events `task-open-list:toggle`/`:note`). Now mounts a `<task-complete-modal>` inside its shadow DOM and uses the callback API: clicking a checkbox opens the modal with the task; on confirm, calls `service.toggle(id, comment)` and refreshes (also re-emits `task-open-list:completed`); on cancel, reverts the checkbox. The legacy `window.showCommentModal` shim is gone.
- **Renamed for grouping consistency:** `complete-task-modal` → `task-complete-modal` (already noted above), `open-tasks` → `task-open-list`. References in mocks, docs and `COMPONENT_GROUPS` updated.

### 2026-04-29 (later)
- **Home page wired up to production services.** Each `domains/<name>/service.js` is now an ES module with a named export (`export const XService = ...`) plus a guarded `window.XService = XService` for backward-compat. Served from `/services/<name>.js` (and `/debug/services/<name>.js`). Home + editor pages load all 8 service modules in head before component modules so `<ctx-switcher service="ContextService">` and any other service-driven component resolve correctly. Without this, the production navbar's context dropdown was silently broken (component did `if (!this.service) return;` because no service was on `window`).
- **`/debug/services` page** lists every production service and its GET endpoints, imported as ES modules (no `window` indirection in the test page). Each method has inline params and a ▶ Run button that invokes the service against the live `/api/*` backend; **▶ Run all** fires every parameter-less GET. Sidebar and per-card method order is alphabetical.
- Debug page **components list** now alphabetised.

### 2026-04-29
- **SPA migration: domain folders, service pattern, debug page.** Components reorganized into `domains/{notes,tasks,meetings,people,results,search,settings,context,composit}/` with one `service.js` per domain wrapping the existing `/api/*` endpoints. Each visual component looks up its data source via a `service` attribute (`<thing service="MeetingsService">`) and renders `renderNoService()` when missing — making them mockable. `domains/_mock-services.js` provides browser-side mocks (Mock*Service) for the debug page so every component can render in isolation.
- **`<week-notes-calendar>`** wrapper around the dumb display `<week-calendar>`. Fetches `service.list({week})` + `listTypes()`, maps to calendar item shape `{startDate, endDate, heading, body, type, id}` with type-icon prefix and `@attendees · 📍 location` body, then calls `cal.setItems()`. `<week-calendar>` itself no longer requires a service — items are pushed in via `setItems()`.
- **`<nav-button>`** (renamed from `<app-brand>`) gained `size` (1–5) and `icon` (emoji) attributes.
- **Per-day note grouping** in `<week-section>`: pinned notes first (📌 Festet), then groups by ISO date with Norwegian day headings ("mandag 27.04"), counts per day, "Uten dato" catch-all.
- **Service pattern conversions**: `<person-tip>`, `<global-search>` now read from `service` attr (with fallback to direct fetch / cached loader). Cache invalidates on source change.
- **Debug page** at `/debug` lists every component with rendered demos using mock services; each `/debug/<tag>` route shows the component standalone with editable attributes.
- Pages directory `pages/` introduced for SPA shells (home, calendar, editor, people).
- Theme files gained 16 new `--*` CSS variables for component theming.

### 2026-04-26
- `<upcoming-meetings days="14">`, `<week-results week="...">`, `<task-completed week="...">` web components — finish moving the home sidebar widgets into self-loading custom elements. Each fetches its data via `/api/*` (cached per-page through a shared `components/_shared.js` helper), renders the same markup as before and bubbles `mention-clicked` for `@`-links so the page-level handler can navigate.
- `<task-open-list>` web component — replaces the inline task-open-list sidebar markup. Fetches `/api/tasks` + `/api/people` + `/api/companies`, renders heading + rows, calls `window.showCommentModal` / `window.openNoteModal` when present, otherwise dispatches `task-open-list:*` events. `@`-mentions emit a bubbling `mention-clicked` event handled at page level so navigation logic stays out of the component.
- All web components now use `var(--*)` theme variables exclusively; removed the few remaining hardcoded colors (`#2b6cb0`, `#a0aec0`, `#c53030`).
- `<note-card note="WEEK/file.md">` web component (`components/note-card.js`) — self-loading note summary card. Fetches `/api/notes/<week>/<file>/card` for type/pin/snippet and renders the markup; action buttons call existing globals (`openNoteViewModal`, `openPresentation`, `deleteNoteFromHome`) when present, otherwise dispatch `note-card:*` events. Home weekly view emits one `<note-card>` tag per note instead of inline markup.
- `<ctx-switcher>` web component (`components/ctx-switcher.js`) — owns the navbar context dropdown handlers (toggle, click-outside-close, switch-context, commit). Removed inline IIFEs from both the home shell and editor.
- `<help-modal>` web component (`components/help-modal.js`) — lazy-loads `/help.md` on first open, listens for `#helpBtn` clicks and the `help:open` custom event, handles Escape. Replaces the duplicated help-modal markup + IIFE in `pageHtml` and editor.
- `<person-tip>` web component (`components/person-tip.js`) — singleton hover tooltip for `.mention-link`. Loads people + companies once and renders the appropriate card (person or company) with edge-aware positioning.
- `<app-navbar>` web component (`components/app-navbar.js`) — wraps the navbar shell (height, background, border, optional `fixed` positioning) in shadow DOM with named slots (`brand`, `switcher`, `links`, `meta`). Slotted children stay in light DOM so existing CSS/JS (context switcher, alt-key shortcuts, mention tooltip on links) keep working unchanged.
- `<nav-meta>` web component (`components/nav-meta.js`) — encapsulates the navbar's date / ISO-week / clock display in shadow DOM. Served from `/components/<name>.js`. Replaces three inline ticker scripts.
- Date and ISO week now displayed next to the clock in the navbar on every page.
- run.sh: remember last-used port in `.server.port` (gitignored); restart without `-p` reuses it. Explicit `-p` or `$PORT` overrides. Falls back to 3001 when no record.
- Navbar extracted to a single `navbarHtml()` component shared by `pageHtml` and the editor page.
- People page expanded into tabbed directory: **Personer / Selskaper / Steder**. People + companies share the `@kortnavn` namespace and are both `@`-mentionable; places are picked from a dropdown.
- Companies (`🏢`): full CRUD with name, org.nr, web, address, notes. `@key` mentions render as company pills with their own tooltip. Company cards list members (people with this as primary or secondary relation) plus referenced meetings, results, tasks and notes.
- People gained two separate company relation fields: `primaryCompanyKey` (single, optional — "Hovedselskap") and `extraCompanyKeys[]` (additional). Edit modal has a dropdown for primary plus a checkbox list for extras (auto-deduped vs primary).
- Places (`📍`): name + address + optional geo coords + notes. Edit modal has a Leaflet + OpenStreetMap **map picker** — click to place marker, drag to refine. Each place card shows a read-only mini-map when expanded, plus all meetings tied to the place.
- Calendar: meeting modal gained a "Knytt til registrert sted" dropdown (places). When set, the meeting block in the grid shows the place name as a link to OpenStreetMap. Free-text "Sted" remains for ad-hoc locations.
- Tab state preserved in URL hash (`/people#tab=companies&key=acmeas`) for shareable deep links.
- Renamed nav label from "Personer" → "Personer og steder" (route stays `/people`). The directory is generic enough to also hold places, companies, and other named entities you mention with `@key`.
- People: `/people` overhauled. Reference detection now matches by `@key` (lowercase) instead of full display name, so all references that previously showed `0 ref.` are correctly counted. Person cards now also surface **Møter** and **Resultater** with deep links (in addition to Oppgaver and Notater).
- People: new **➕ Ny person** button on `/people` opens a modal that lets you create a person directly without going via an `@`-mention. Auto-generates a unique lowercase key from the first name. New `POST /api/people` endpoint.
- People: full restyle to use theme variables (was hardcoded `white`, `#a0aec0`, `#2b6cb0`, …); proper dark/forest/nord rendering. Person cards anchor on `#<key>` for deep linking; navigating to `/people#anna` expands and scrolls to that person.
- Results: `/results` page now has a **➕ Nytt resultat** button to create free-form results not tied to a task. New `POST /api/results` endpoint backs it.
- Results: fixed bug where markdown links in task notes (`[text](url)`) were treated as result entries — extractor now uses negative-lookahead for `(`.
- Results: `/results` page restyled to use theme variables instead of hardcoded colors (`white`, `#2b6cb0`, `#ebf8ff`, …); proper dark/forest/nord rendering. People rendered as `mention-link` with hover-tooltip and `/people#<key>` anchor. Within-week sort now `created` desc.
- Help and `agents/results.md` updated with the two creation paths.
- Fixed: home page now correctly highlights and expands the current week. The internal `getCurrentYearWeek()` helper was producing a non-canonical format (`2026-17`) that never matched the canonical week-folder format (`2026-W17`), so the "active" week was silently treated as a regular older week. Aliased to `dateToIsoWeek(new Date())`.
- Git tab: new "📥 Pull fra remote" button on contexts with a remote — runs `git pull --ff-only`, refuses to run if there are uncommitted changes
- New `scripts/seed-dummy.js` — creates two demo contexts (Demo Jobb / Demo Hjem) with people, tasks, meetings, results and notes for testing/showcase
- Settings: Generelt tab now shows the context's `.week-notes` marker version vs the running server version (color-coded match / mismatch / missing). Saving settings always refreshes the marker to the current server version.
- run.sh: when an existing server is detected, prompt `[y/N]` to restart it (gracefully SIGTERM, fall back to SIGKILL) instead of just exiting
- run.sh: on startup, check if origin has newer commits and offer (`[Y/n]`) to pull before launching the server
- Themes: new `/themes` builder — clone any theme, edit its CSS variables (colors, font-family, font-size) with color pickers + live preview, save as a custom theme in `data/_themes/` (gitignored). Built-ins are read-only.
- Themes: per-theme `--font-family` and `--font-size` vars; `body` reads them so the entire UI rescales when you change font-size on a theme. Form controls inherit. Nerd theme runs at 14px monospace by default.
- Settings: theme grid enumerates dynamically (built-ins + custom) with a "🎨 Tilpass tema →" link to the builder
- Welcome screen: after creating or cloning a context, switch to it and open `/settings` instead of the home page so the new context can be configured immediately
- Disconnected-repo memory now deduped by remote URL (read and write) so the same repo never appears twice in the known-repos picker
- Settings: known-repos picker shown on the "Klon fra remote" pane, mirroring the welcome page
- Welcome screen: known-repos picker on the clone form — click a remembered remote to prefill name + URL, ✕ to forget
- Disconnect context: new "🔌 Koble fra" button on the Git tab — commits + pushes any pending changes, removes the working tree, and remembers the remote URL in `data/.disconnected.json` (gitignored)
- Remote validation: a context-repo must contain a `.week-notes` marker file (with the week-notes git SHA as version); missing marker prompts the user to confirm before the marker is created and committed
- First-run: when there are no contexts yet, `/settings` shows a dedicated welcome screen with project intro + two side-by-side cards for creating a new context or cloning from a git-remote
- Settings: new "Klon fra remote" rail entry — `git clone`s an existing context-repo straight into `data/<name>/`
- Settings: when a git-remote is added (or changed) on a context the server now does a fetch + pull (allow-unrelated-histories) so existing remote content lands locally
- run.sh: if the chosen port is occupied, automatically falls back to a random free port instead of failing
- Settings: context detail split into Generelt / Møter / Git tabs; selected tab is remembered across reloads
- Settings: Arbeidstid editor laid out horizontally as seven day cards (Man–Søn) with a polished time-picker pill
- Settings: default meeting length is now per meeting type (with its own minutes input) rather than per context
- Settings: meeting types reorderable by drag handle
- Settings: clicking a theme swatch live-previews the look on the active context; persists on Save
- Contexts: list ordered by display name
- Theming: each context picks one of seven themes — paper, dark, nerd, solarized-light, nord, forest, ocean — selectable from `/settings`. Themes live as small CSS files in `themes/`.
- Calendar: drag a meeting to move it (across days too), drag the bottom edge to resize — snaps to 5-minute increments
- Calendar: red "now" line on today's column, auto-updating every minute
- Calendar: timestamped task/note/result activity markers on the day they were saved/completed, with toolbar chips to toggle each kind
- Calendar: restyled meeting modal — paper-theme header, consistent inputs, taller resizable notes, pinned action bar
- Search: global Ctrl+K / `/` modal on every page
- Search: now covers tasks, meetings, people and results in addition to notes
- Search: moved to a `worker_threads` inverted index that auto-rebuilds on file changes
- Context switch made async (git pull + reindex now run in the background)
- Calendar uses the full page width
- Click an upcoming-meeting card on the home page to jump to the calendar week and pulse-highlight the meeting
- Configurable default meeting length per context (used to prefill the end time)
- Per-context working hours (start/end + weekdays) rendered as a band on the calendar
- Meeting time picker uses hour/minute selects with 5-minute increments
- Calendar shows all 24 hours
- `+ Nytt møte` button and right-click type menu on the calendar

### 2026-04-25
- New: meetings calendar with week view + upcoming list on home
- Per-context meeting types with grouped 96-icon emoji picker
- Master/detail `/settings` layout (full-width)
- People: inactivate, delete with tombstones, mention autocomplete in meeting modal
- Calendar polish: 24h grid, aligned hour labels, meeting note shortcut
- In-app help: `❓ Hjelp` button renders `help.md`
- Configurable server port (`-p` / `PORT`), startup tool checks
- Initial README, MIT licence stated explicitly

---

## ✨ Features

### Weekly notes
- One folder per ISO week (`YYYY-WNN`) containing freeform markdown notes
- Live markdown editor with autosave
- `@person` mentions with hover tooltips backed by a people directory
- Pin notes to the top of a week, give them types/icons
- Render any note as a [reveal.js](https://revealjs.com/) presentation in **7 styles**: paper, noir, klassisk, levende, minimal, matrix (digital rain), and NAV (with Aksel design tokens + circular logo watermark)

### Tasks
- Open tasks list on the home page (left sidebar), completed tasks shown with the week they were closed in
- Inline edit, notes per task, due dates
- Add tasks per week with `+` button

### Calendar & meetings 📅
- Full-width week-grid calendar at `/calendar` covering all 24 hours
- Click an empty slot to create, right-click for the meeting-type list, or use the `+ Nytt møte` button
- Meetings have a **type** (1-on-1, standup, workshop, …) shown as an icon in the grid and the home sidebar
- Meeting types are **per-context** and editable from both the calendar (`✏️ Typer`) and the context's settings card
- Grouped emoji picker with sections (Personer, Kommunikasjon, Dokumenter, Planlegging, Arbeid, Sport, …)
- Time picker uses hour/minute selects with 5-minute steps (consistent across browsers)
- Per-context **working hours** (start/end + weekdays, default Mon–Fri 08:00–16:00) rendered as a band overlay
- Per-context **default meeting length** prefills the end time when creating new meetings
- Click an upcoming-meeting card on the home page to jump to that week and pulse-highlight the meeting

### People & results
- Lightweight CRM: name, title, email, phone, freeform notes
- **Inactivate** to hide from autocomplete; **delete** uses tombstones so `@mentions` don't auto-recreate them
- Result/outcome log per week

### Contexts (multiple workspaces)
Switch between completely isolated workspaces — e.g. **work**, **side-project**, **golf** — each with its own notes, tasks, people, meeting types, and settings.

- Top-left dropdown switcher, available on every page
- Curated emoji icon palette (including ⛳ 🏌️)
- Master/detail settings page at `/settings`: contexts on the left, full editor on the right
- Hot-switching: no restart needed

### In-app help ❓
- `❓ Hjelp` button in the navbar opens a modal with the rendered `help.md`
- Same markdown styling as notes (tables, blockquotes, code blocks)

### Git per context 🔀
Every context is a stand-alone git repository under `data/<context>/`.

- **Auto-init** on creation; existing contexts are initialised on server start
- **Auto-commit** of pending changes when you switch away from a context
- **Auto-pull** (`--ff-only`) of the target context on switch, if a remote is configured
- **Manual commit** button in the context dropdown
- **Manual push** button on each settings card (uses your host's git auth — SSH agent or credential helper)
- Dirty/clean status, last commit hash & timestamp shown on each card
- Set a `remote` URL per context to sync with GitHub/GitLab/etc.

Push remains manual — pull happens automatically on switch.

---

## 🚀 Quick start

### Requirements

| Tool       | Required? | Why                                                          |
|------------|-----------|--------------------------------------------------------------|
| **Node.js** ≥ 18 | ✅ yes | Runs the server                                              |
| **git**          | ✅ yes | Each context is a git repo (init / commit / push / pull)     |
| **gh** ([GitHub CLI](https://cli.github.com/)) | ⚪ optional | Used to fetch a GitHub token for week summaries; falls back to `GH_TOKEN` env var if missing |

The server checks for these on startup and refuses to start if `git` is missing.

### Install & run

```bash
git clone git@github.com:petterek/week-notes.git
cd week-notes
npm install
./run.sh                # default port 3001
./run.sh -p 8080        # custom port
PORT=8080 ./run.sh      # via env var
```

Open <http://localhost:3001/>.

To stop:

```bash
./stop.sh
```

`run.sh` is idempotent — running it when the server is already up is a no-op. PID is tracked in `.server.pid`.

---

## 📁 Project layout

```
weeks/
├── server.js           # the entire app (single-file Node.js, no framework)
├── package.json        # only dep: marked
├── run.sh / stop.sh    # PID-based start/stop scripts
├── .gitignore          # excludes data/ — context data is its own repo
└── data/
    ├── .active         # active context id
    └── <context>/      # one folder per context, each a git repo
        ├── .git/
        ├── settings.json
        ├── tasks.json
        ├── notes-meta.json
        ├── people.json
        ├── meetings.json
        ├── meeting-types.json   # optional, falls back to defaults
        ├── results.json
        └── <YYYY-WNN>/
            └── *.md
```

`data/` is `.gitignore`-d in the app repo because each context is independently versioned.

---

## ⌨️ Keyboard shortcuts

| Shortcut  | Action               |
|-----------|----------------------|
| `Alt+H`   | Home                 |
| `Alt+O`   | Tasks                |
| `Alt+K`   | Calendar             |
| `Alt+P`   | People               |
| `Alt+R`   | Results              |
| `Alt+N`   | New note             |
| `Alt+S`   | Settings (contexts)  |

---

## 🔌 API

Mostly JSON, mostly REST-shaped. Useful endpoints:

| Method | Path                                | Purpose                              |
|--------|-------------------------------------|--------------------------------------|
| GET    | `/api/contexts`                     | List all contexts + active           |
| POST   | `/api/contexts`                     | Create a new context                 |
| POST   | `/api/contexts/switch`              | Switch active context                |
| PUT    | `/api/contexts/:id/settings`        | Update name/icon/description/remote  |
| GET    | `/api/contexts/:id/git`             | `{isRepo, dirty, last, remote}`      |
| POST   | `/api/contexts/:id/commit`          | Commit pending changes               |
| POST   | `/api/contexts/:id/push`            | `git push origin HEAD`               |
| GET/PUT| `/api/contexts/:id/meeting-types`   | Per-context meeting type list        |
| GET    | `/api/people`                       | People directory (excludes tombstones) |
| GET    | `/api/meetings`                     | Meetings for the active context      |
| GET    | `/api/notes/:week/:file/render`     | Rendered markdown for hover/preview  |
| GET    | `/help.md`                          | In-app help content                  |

---

## 🛠️ Tech

- Node.js (no framework — built on `http`, `fs`, `child_process`)
- [`marked`](https://marked.js.org/) for markdown
- [reveal.js](https://revealjs.com/) for presentations (loaded from CDN)
- [Aksel design tokens](https://aksel.nav.no/) + Source Sans 3 for the NAV slide style

No build step. No bundler. ~4300 lines of `server.js`.

---

## 📜 License

MIT — see [`LICENSE`](LICENSE).
