# 📅 Ukenotater (Week Notes)

> 🌀 **Totally vibe-coded.** No specs, no tickets, no roadmap — just a long conversation with an AI pair-programmer and a steady stream of "ooh, what if it also did this?" Every feature here exists because it felt right in the moment. Reader discretion advised.

A self-hosted, single-binary Node.js web app for keeping structured weekly notes, tasks, people and results across multiple isolated **contexts** — each one its own git repo.

Built for the daily reality of knowledge work: notes are markdown, tasks live next to the week they came up in, and everything is plain files on disk you can grep, back up, and version with git.

---

## 📜 Changelog

### 2026-04-26
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
