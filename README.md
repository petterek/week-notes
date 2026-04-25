# 📅 Ukenotater (Week Notes)

> 🌀 **Totally vibe-coded.** No specs, no tickets, no roadmap — just a long conversation with an AI pair-programmer and a steady stream of "ooh, what if it also did this?" Every feature here exists because it felt right in the moment. Reader discretion advised.

A self-hosted, single-binary Node.js web app for keeping structured weekly notes, tasks, people and results across multiple isolated **contexts** — each one its own git repo.

Built for the daily reality of knowledge work: notes are markdown, tasks live next to the week they came up in, and everything is plain files on disk you can grep, back up, and version with git.

---

## ✨ Features

### Weekly notes
- One folder per ISO week (`YYYY-WNN`) containing freeform markdown notes
- Live markdown editor with autosave
- `@person` mentions with hover tooltips backed by a people directory
- Pin notes to the top of a week, give them types/icons
- Render any note as a [reveal.js](https://revealjs.com/) presentation in **7 styles**: paper, noir, klassisk, levende, minimal, matrix (digital rain), and NAV (with Aksel design tokens + circular logo watermark)

### Tasks
- Open tasks list on the home page, completed tasks shown with the week they were closed in
- Inline edit, notes per task, due dates
- Keyboard shortcuts (`Alt+H`, `Alt+O`, `Alt+S`)

### People & results
- Lightweight CRM: name, title, email, phone, freeform notes
- Result/outcome log per week

### Contexts (multiple workspaces)
Switch between completely isolated workspaces — e.g. **work**, **side-project**, **golf** — each with its own notes, tasks, people, and settings.

- Top-left dropdown switcher, available on every page
- 25 emoji icons to choose from (including ⛳)
- Per-context settings page at `/settings` with inline editing
- Hot-switching: no restart needed

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
./run.sh        # starts the server on port 3001 in the background
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
| `Alt+O`   | Open tasks           |
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
| GET    | `/api/people`                       | People directory                     |
| GET    | `/api/notes/:week/:file/render`     | Rendered markdown for hover/preview  |

---

## 🛠️ Tech

- Node.js (no framework — built on `http`, `fs`, `child_process`)
- [`marked`](https://marked.js.org/) for markdown
- [reveal.js](https://revealjs.com/) for presentations (loaded from CDN)
- [Aksel design tokens](https://aksel.nav.no/) + Source Sans 3 for the NAV slide style

No build step. No bundler. ~2700 lines of `server.js`.

---

## 📜 License

See `LICENSE`.
