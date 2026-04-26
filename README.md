# 📅 Ukenotater (Week Notes)

> 🌀 **Totally vibe-coded.** No specs, no tickets, no roadmap — just a long conversation with an AI pair-programmer and a steady stream of "ooh, what if it also did this?" Every feature here exists because it felt right in the moment. Reader discretion advised.

A self-hosted, single-binary Node.js web app for keeping structured weekly notes, tasks, people and results across multiple isolated **contexts** — each one its own git repo.

Built for the daily reality of knowledge work: notes are markdown, tasks live next to the week they came up in, and everything is plain files on disk you can grep, back up, and version with git.

---

## 📜 Changelog

### 2026-04-26
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
