# AGENTS.md — notes for coding agents

This file is for **you** (and other coding agents) working on this repo.
Keep it accurate. **Update it before every commit/push** that changes the
project meaningfully (architecture, conventions, gotchas, layout).

The user (a human) drives the work and decides when to push. **Do not
push to git unless explicitly told to** ("push", "send it", etc).

---

## What this is

`week-notes` — a self-hosted Node.js web app for
structured weekly notes, tasks, people, meetings and results across
multiple isolated **contexts** (each context = its own git repo under
`data/<ctx>/`).

Vibe-coded. No specs, no tickets. Features grow organically.

Stack:
- Node.js (no framework, raw `http` module)
- Small dispatcher in `server.js`, domain handlers in `routes/`, shared
  storage/HTTP/context helpers in `lib/`; `lib/core.js` still contains
  legacy domain, rendering and worker orchestration
- Browser ES modules and Web Components in `components/` and `domains/`
- Markdown rendered with `marked` (Node dependency and browser CDN)
- Slides via `reveal.js` (CDN)
- No build step, no bundler, no TypeScript
- Storage = plain JSON + markdown files on disk

---

## Repo layout

```
/home/p/migration/weeks/
├── server.js          # bootstrap + awaited handler chain + request context
├── lib/               # server-side helpers (extracted from server.js)
│   ├── core.js        # contexts, git, cached domain loaders, render, workers
│   ├── data-paths.js  # ROOT_DIR + DATA_DIR-aware CONTEXTS_DIR
│   ├── collections-manifest.js # supported collections and identity fields
│   ├── collection-store.js     # strict reads + atomic per-file replacement
│   ├── request-context.js      # AsyncLocalStorage context boundary
│   ├── http.js        # awaited body parsing, HttpError, JSON responses
│   ├── page-routes.js # shared SPA route, fragment and title manifest
│   ├── page-shell.js  # full HTML shell + safely serialized browser bootstrap
│   ├── dates.js       # ISO-week / date math (pure, no deps)
│   └── meeting-lifecycle.js # pure meeting-series/occurrence lifecycle helpers
├── routes/            # per-domain route modules. Each exports `(deps) => async (req, res, ctx) => void`
│   ├── static-early.js  # /welcome, themes/help/fragments, /app-shell.js, /service-registry.js
│   ├── spa.js           # empty page shells resolved through lib/page-routes.js
│   ├── debug-static.js  # /debug/_mock-services.js, /services/*.js, /services/_shared/*
│   ├── debug.js         # /debug + helper functions (renderServicesDebug, renderDataShapesDebug, …)
│   ├── pages.js         # /themes /meeting-note/:id /editor /present (remaining server-rendered pages)
│   ├── note-render.js   # catch-all GET /:week/:file.md (renders markdown)
│   ├── assets-late.js   # /components/*.js, /style.css, /mention-autocomplete.js
│   └── api/
│       ├── misc.js      # /api/summarize, /api/search, /api/me, /api/app-settings, /api/embed*, /api/save*
│       ├── tasks.js     # /api/tasks*, including /merge /reorder /:id/toggle /:id/close-from-note
│       ├── results.js   # /api/results*
│       ├── goals.js     # /api/goals*
│       ├── people.js    # /api/people*
│       ├── companies.js # /api/companies*
│       ├── places.js    # /api/places*
│       ├── meetings.js  # /api/meetings*, /api/meeting-types, occurrence lifecycle (start/close/reopen), agenda, decisions
│       ├── meeting-series.js # /api/meeting-series* — recurring series CRUD + agenda queue management
│       ├── themes.js    # /api/themes*
│       ├── contexts.js  # /api/contexts*, including settings/git/migrations subpaths
│       └── notes.js     # /api/notes/* (render, meta, history, raw, pin, card, delete) + /api/weeks /api/week/:id
├── README.md          # user-facing docs + changelog
├── AGENTS.md          # this file — start here
├── agents/            # per-feature deep-dives (read the relevant ones)
│   ├── notes.md
│   ├── tasks.md
│   ├── people.md
│   ├── calendar.md
│   ├── home.md
│   ├── results.md
│   ├── goals.md
│   ├── contexts.md
│   ├── git.md
│   ├── presentations.md
│   ├── help.md
│   ├── tests.md
│   ├── themes.md
│   ├── tags.md
│   ├── teams.md
│   ├── meetings.md
│   ├── settings.md
│   └── search-and-summarize.md
├── help.md            # in-app help, served at /help.md and rendered in a modal
├── run.sh             # start helper (checks if already running)
├── package.json       # markdown/emoji + optional local AI dependencies; Playwright for tests
├── domains/           # domain components + injectable browser services
├── components/        # shared Web Components
├── pages/             # SPA HTML fragments
├── schemas/           # data schemas and relationship diagram
├── tests/             # component scenarios, Playwright specs + isolated server fixtures
├── data/              # per-context data, each subdir is a git repo
│   └── <ctx>/
│       ├── settings.json
│       ├── meetings/            # one JSON file per meeting
│       ├── meeting-types.json   # optional, falls back to defaults
│       ├── meeting-series/      # one JSON file per recurring meeting series (loadCollection/syncCollection)
│       ├── people/              # other collections follow collections-manifest.js
│       ├── tasks/
│       ├── notes-meta/<week>/   # <note>.md.json sidecars
│       └── YYYY-WNN/            # one folder per ISO week
│           └── *.md             # freeform markdown notes
└── public/            # app-shell.js, service-registry.js, style.css and other browser assets
```

When working on a specific feature, **open the matching `agents/*.md`
file** for storage shape, route table, code map, conventions and
gotchas before changing code.

---

## How to run / restart the server

```bash
# preferred: ./run.sh (checks if 3001 is in use)
./run.sh

# or manually
node server.js          # default port 3001
PORT=4000 node server.js
```

Do not restart the user's server for automated tests. Playwright owns a
separate server and disposable data root; see `agents/tests.md`.
For a requested restart, use the project's `stop.sh` / `run.sh` helpers
or identify the exact PID with `lsof -ti:3001`. Never kill by process name.

Quick smoke test:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/calendar
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/settings
```

---

## Routes worth knowing

| Path | Purpose |
| --- | --- |
| `/` | Home: weekly notes, task sidebar, upcoming meetings sidebar |
| `/tasks` | Full tasks page |
| `/calendar` (or `/calendar/YYYY-WNN`) | Week-view calendar, full width |
| `/people` | People directory (CRM-lite) |
| `/results` | Result/outcome log |
| `/settings` | Master/detail context settings (full width) |
| `/meeting-series` | Recurring meeting series dashboard (agenda queue, occurrence history) |
| `/meeting-occurrence/:id` | Workspace for one series occurrence (agenda, decisions, minutes, lifecycle) |
| `/note/...`, `/meeting-note/:id` | Note editors |
| `/help.md` | Raw markdown for the help modal |
| `/meetings/:id/minutes` | Printable/PDF meeting minutes export |
| `/api/...` | JSON APIs (people, tasks, meetings, meeting-series, contexts/:id/settings, contexts/:id/meeting-types, contexts/switch, …) |

### Adding/moving a route

Routes live in `routes/` modules grouped by URL prefix or domain. Each
module exports `(deps) => async (req, res, ctx) => void | true`, where `ctx`
contains `{ pathname, url, method, contextId }`. Inside the function the
imperative pattern is preserved verbatim — match a path, write the
response, `return;`. Modules destructure only the helpers they use from
`deps.core` (and `deps.rootDir` can shadow `__dirname` so existing
`path.join(__dirname, …)` calls keep working).

Dispatch lives in `server.js`. After each handler runs the dispatcher
checks three signals to decide whether the route owned the request:

1. The awaited handler returned `true` (explicit ownership).
2. `res.writableEnded` (write+end).
3. `res.headersSent` (e.g. SSE: headers sent but stream still open).

If none of those triggered, the next handler runs. The order in
`server.js`'s `handlers = [...]` array is significant — most-specific
static routes first, domain/page handlers in their existing order, then
late assets. Don't reorder without thinking about the catch-all
`/<week>/<file>.md` (note render) and `/api/notes/:ctx/(.+)` (delete
note) interactions. `setImmediate(...)` after `res.end()` is fine for
background work — see `routes/api/contexts.js` for explicit
`runWithDataContext(next, ...)` around post-switch work.

If you add a new route module, register it in `server.js`'s `handlers`
array and place it in the right slot relative to siblings. If a
handler does **async work via fs callbacks** (rather than awaitable
APIs), promisify it (`await fs.promises.readFile(...)`) — otherwise
the dispatcher will see no claim signal and forward the request to
the next handler. Body-reader listeners no longer claim a request:
use `await readJsonBody(req)` from `lib/http.js` (also exported by core).
It rejects malformed JSON as `HttpError(400, ...)`; an empty body defaults
to `{}` (or an explicitly supplied default). Validate the parsed shape
in the endpoint. Await the body **before** loading collections to mutate;
do not retain a read-modify-write snapshot across another `await`.

---

## Conventions / things that bite

### Browser shell and page routing
- `lib/page-shell.js` renders the full document. `lib/core.js` retains a
  `pageHtml` facade so existing callers need not know about the extraction.
- Define SPA paths, patterns, fragment URLs and titles in
  `lib/page-routes.js`. `routes/spa.js` uses that manifest, and
  `routes/static-early.js` applies its titles to known page fragments.
  Existing-note editor paths have `serverShell: false`: their filename
  title and path guard remain in `routes/pages.js`.
- The shell safely serializes `WN_PAGE_ROUTES` and `WN_ME_PERSON_KEY`
  before loading the classic `/app-shell.js`. Do not add a separate
  hardcoded browser route table as a fallback.
- `/app-shell.js` owns SPA navigation and document-level event handlers,
  including entity callouts, search selection, summaries and shortcuts.
  Keep query strings, anchors, and the `spa:navigated` event intact.
- `/service-registry.js` is an ES module loaded before component modules.
  Preserve `window['week-note-services']`, `window.WeekNoteServices`,
  `window.mePersonKey`, and the `week-note-services:ready` event.
- The entity-callout bridge must move with the shell, not just the SPA
  router. Detached documents still need their own component registrations;
  `domains/_shared/wn-markdown-preview.js` handles those.

### Server-side template strings
- Pages are built by concatenating big `` ` ` `` template strings.
- `${...}` interpolates at render time. Use `\\n` for **literal** `\n`
  inside JS strings rendered into the page.
- Inline `<script>` blocks are wrapped in IIFEs; **scope is per
  `<script>` block**. A `const` in one IIFE is invisible to another.
  When you need data from the outer render scope inside an IIFE, inject
  it as `const X = ${JSON.stringify(...)};` at the top of the IIFE.

### HTML escaping
- Use `escapeHtml(...)` for any user-controlled string in HTML.
- Use `encodeURIComponent(...)` for path segments.
- For JSON-in-script blocks, `.replace(/</g, '\\u003c')` to avoid
  closing the parent `<script>` tag.

### Theming / CSS variables
- **All components and styles must use CSS variables** so they adhere
  to the active theme. Themes live in `themes/*.css` and define
  `--bg`, `--surface`, `--surface-alt`, `--surface-head`, `--border`,
  `--border-soft`, `--border-faint`, `--text`, `--text-strong`,
  `--text-muted`, `--text-muted-warm`, `--text-subtle`, `--accent`,
  `--accent-strong`, `--accent-soft`, `--text-on-accent`.
- Never hardcode colors (`#c53030`, `#a0aec0`, `white`, etc.) in CSS,
  inline styles, or shadow-DOM `<style>` blocks. Always use a theme
  variable, optionally with a fallback for SSR-safety:
  `color: var(--accent, #2a4365);`
- If you need a color that no theme variable covers, **add a new
  variable to every theme in `themes/*.css`** before using it.
- CSS custom properties pierce shadow DOM, so web components can use
  the same variables without redefining them.

### Web components
- Components live in `components/` and `domains/<domain>/`, served as
  `/components/<name>.js` by `routes/assets-late.js`. Load them as ES
  modules; relative browser imports resolve against the served URL,
  not the on-disk directory.
- Custom elements default to `display: inline`. If a component is
  meant to be a block (e.g. card or list), add a global rule like
  `note-card { display: block; }` next to its other CSS in
  the shared stylesheet, or set it in `:host { display: block; }` for shadow-DOM
  components.
- Markup uses backtick template literals, not string concatenation.
- Components stay decoupled from page logic by **emitting CustomEvents**
  (e.g. `mention-clicked`, `note-card:view`, `task-open-list:toggle`) and
  letting the host page decide what to do. Default link navigation is
  `preventDefault`'d inside the component; the host page has a single
  `mention-clicked` listener in `pageHtml` body that does
  `window.location.href = detail.href`.
- Slotted children stay in light DOM so existing global CSS / JS
  selectors keep working (used by `<app-navbar>` and `<ctx-switcher>`).
- **Declarative async data via `loadData()`.** When a component
  depends on async data (e.g. fetching meeting types, people, goals),
  override `loadData()` on the WNElement subclass and return a map of
  `{ key: () => Promise }`. The base class awaits them in parallel
  (memoized per element instance via `awaitAll`) and passes the
  resolved values into `render(data)`:

  ```js
  loadData() {
      return {
          types: () => this._fetchTypes(),
          people: () => this._fetchPeople(),
      };
  }
  render({ types = [], people = [] } = {}) { return html`…`; }
  ```

  Each factory runs once per instance. Invalidate with
  `this.invalidateAwait('types')` (or no arg to clear all) before
  calling `requestRender()` when underlying inputs change — e.g. an
  observed attribute like `context` or `settings_service`. Components
  with no async deps just omit `loadData()` and `render()` is called
  synchronously with `{}`. `requestRender()` is async-aware and uses
  a render token to discard stale results from concurrent calls.
  `render()` itself may still be async if it needs ad-hoc awaits;
  prefer declaring deps in `loadData()` so render stays purely
  declarative.

  **Post-render hook: `afterRender(data)`.** Override this on the
  subclass to wire event listeners or push data into freshly rendered
  child components via imperative APIs (`card.setData(...)`,
  `view.meta = …`). The base calls it synchronously after writing
  `shadowRoot.innerHTML`, with the same `data` object that was passed
  to `render()` — so query selectors find the new nodes and there's no
  timing race with `awaitAll`. **Do not** queue post-render DOM work
  via `setTimeout(0)` from `requestRender()` — `super.requestRender()`
  is async (waits for `awaitAll`), so the timeout can fire before the
  DOM write and run against stale/placeholder markup.

### Person selection
- **Always use `<person-multi-picker>`** when selecting one or more
  people (attendees, participants, team members, etc). Never use
  checkbox lists or plain text inputs for person selection.
- Lives in `domains/people/person-multi-picker.js`, served as
  `/components/person-multi-picker.js`.
- Import it: `import '/components/person-multi-picker.js';`
- Usage: `<person-multi-picker value="alice,bob" placeholder="…">`
- Read selection: `picker.value` → `string[]` of keys.
- Emits `change` event with `{ value: string[] }`.

### Markdown / mentions
- `@person` mentions are rendered server-side via `linkMentions(...)`.
- Person tooltips are wired up by the global script in `<body>`.
- Mention autocomplete is in `public/mention-autocomplete.js`; init it
  on each editor element after the DOM is ready (and re-init when
  modals show new inputs).

### Dates / weeks
- ISO 8601 weeks (`YYYY-WNN`).
- `dateToIsoWeek(d)` and `isoWeekMonday(yw)` are the canonical helpers.
- Use `'T00:00:00Z'` when constructing a `Date` from a `YYYY-MM-DD` to
  avoid timezone drift.

### Per-context settings
- `getContextSettings(id)` reads `data/<id>/settings.json`.
- `setContextSettings(id, data)` writes it (and syncs git remote).
- Two specialised getters:
  - `getWorkHours(ctxId)` → `{ hours: [day0..day6, …] }` where each
    entry is `{start, end}` or `null`. Day 0 = Mon, 6 = Sun. Has a
    backward-compat path for old `workStart/workEnd/workDays` shape.
  - `getDefaultMeetingMinutes(ctxId)` → integer (default 60).
- When adding new per-context settings, **always**:
  1. Add a getter with a sensible default and validation.
  2. Add the form field on `/settings` (Generelt section).
  3. Extend the form-submit handler to send the new field.
  4. The PUT `/api/contexts/:id/settings` is pass-through — no server
     change needed unless you want validation.

### Active context resolution
- Two sources, in priority order: `wn_ctx` cookie (per-request) →
  `data/.active` file (global default).
- `getActiveContext()` is deliberately file-only: use it only when the
  global default itself is needed, not for request storage.
- `server.js` resolves `getActiveContextFromReq(req)` once, then runs
  the entire awaited handler chain with `runWithDataContext(contextId, ...)`.
  `getDataContext()` returns that captured id across awaits; unscoped
  startup/CLI calls fall back to the global default.
- `dataDir()`, caches and context-sensitive helper defaults use
  `getDataContext()`. An explicit id is also supported by `dataDir(id)`
  and `loadCollection(name, id)`. Background work targeting a different
  context must wrap itself in `runWithDataContext(id, ...)`.
- The cookie is set by:
  - `POST /api/contexts/switch` (always)
  - `GET  /api/contexts` (refreshes on every fetch)
  - SPA page renders (`routes/spa.js`)
- Use `activeContextCookie(id)` from `lib/core.js` to construct the
  `Set-Cookie` value (`wn_ctx=…; Path=/; Max-Age=1y; SameSite=Lax; HttpOnly`).
- Pass an empty id (`activeContextCookie('')`) to clear it.
- Context switches preserve both contexts' autosave files: other
  requests/editors may still be using them. Explicit save/discard owns
  normal cleanup. Startup still has the legacy autosave cleanup policy.
- Cookies are shared by tabs in the same browser profile. Capturing a
  context prevents an in-flight request changing targets; it does **not**
  create independent per-tab identities.
- Full-text queries carry an explicit context directory to the worker,
  which indexes and queries that context in one synchronous message.
  Vector search is available only for the embedding worker's own context;
  another context gets 503, not results from the wrong index.

### Storage and cache safety
- Use `lib/data-paths.js` in the server and maintenance scripts so
  `DATA_DIR` always has the same meaning. Never hard-code `<repo>/data`
  in new tools or tests.
- `lib/collections-manifest.js` is the shared collection inventory and
  default identity-field map. Register new collections there before use.
  Migration inventory must preserve their directories, legacy files,
  `notes-meta/`, `.cache/`, drafts and autosaves.
- `loadCollection` returns independent nested snapshots. Mutating one
  does not persist anything; call the relevant save helper explicitly.
- Missing storage can be empty; invalid/unreadable JSON must throw with
  its file path. Never omit a broken record and then bulk-save the subset.
- `collection-store.js` serializes replacements before writing, uses
  temporary sibling files + rename, then prunes omitted files only after
  every replacement succeeds. This is **per-file atomicity, not a
  multi-file transaction**. Cache invalidation also runs on failed saves.
- A collection's first directory write is staged in a temporary sibling
  directory and published only when complete. A failed conversion must
  not expose a partial directory that masks the legacy JSON array.
- Note metadata uses the same strict/atomic primitives. Sidecars override
  matching legacy entries without hiding other legacy metadata. Use
  `getNoteMeta(week, file, { fresh: true })` before a write/preflight.
- `/api/save` acknowledges success and discards recovery files only after
  metadata and related persistence complete. Best-effort git commit
  failures are logged separately.

### Calendar specifics
- Grid: `HOUR_START=0, HOUR_END=23, HOUR_PX=36`. All 24 hours rendered.
- Time pickers: hour `<select>` (00-23) + minute `<select>`
  (00,05,…,55). `setTime(prefix, "HH:MM")` rounds to nearest 5-min;
  `getTime(prefix)` reads back. **Do not** use `<input type="time">`
  — Chrome ignores `step` for the spinner UI.
- Meeting blocks render with `id="m-<meetingId>"` so deep links from
  the home sidebar (`/calendar/<week>#m-<id>`) can scroll + pulse.
- Right-click a column body → meeting-type menu. The menu reads
  `MEETING_TYPES`, which **must be injected** into the calendar IIFE
  separately (it lives in another scope by default).
- `.cal-page` wrapper enables full-width via
  `body:has(.cal-page) { max-width: none; }`.
- Per-day work-bands: rendered as first child of `.cal-col-body` so
  meetings draw on top. `pointer-events: none; z-index: 0;`.

### Settings page
- Master/detail layout: contexts list on left, form on right.
- Full width via `body:has(.ctx-page) { max-width: none; }`.
- Working-hours block is a `<fieldset>` with one `.wh-row` per weekday.
- The form-submit handler builds a `workHours` array of length 7
  before PUTing to `/api/contexts/:id/settings`.

---

## Git workflow

- **Per-context git repos** live under `data/<ctx>/`. Don't commit them
  from this repo — they have their own lifecycle, controlled via the
  navbar "✓ Commit" button.
- **The project repo itself** (this directory) is a normal git repo
  with origin `git@github.com:petterek/week-notes.git`, default branch
  `main`. **Day-to-day work happens on `develop`.** `main` only moves
  forward at release time, and each release commit on `main` is tagged
  `vN` (see "Release tags as migration anchors" below).
  - Branches: `main` = released, `develop` = next release in progress.
  - When the user says "release" / "ship v3" / similar:
    1. ensure `develop` is green and the README changelog is up to date
    2. `git checkout main && git merge --no-ff develop -m "Release vN"`
    3. `git tag -a vN -m "vN — <summary>"`
    4. `git push origin main develop vN`
    5. update the tag list in this file
  - Otherwise, commit/push to `develop` only.
- Every commit must include the trailer:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```
- **Never push without an explicit user instruction.** Stage and commit
  freely; wait for "push", "send it", "ship it" or similar before
  `git push`.
- **Always update the README changelog before pushing.** README has a
  `## 📜 Changelog` section; add a bullet under the
  current date for every notable change being shipped, then include
  the README update in the push.
- **Release tags as migration anchors.** When shipping a breaking data
  shape change, first tag the previous stable point on GitHub
  (`git tag -a vN <sha> && git push origin vN`). New entries in
  `scripts/migrate-context.js` should use the `appliesBeforeTag('vN')`
  helper so contexts whose `.week-notes` marker pre-dates the tag get
  migrated; never hard-code arbitrary commit SHAs in `appliesTo`.
  Current tags: `v1` → `fc809ad`, `v2` → `1d083d8`, `v3` → `c93b3cf`, `v4` → `83bbea3`, `v4.1` → `686d485`, `v4.2` → `080a9a5`, `v4.3` → `4a6c697`, `v4.4` → `3969f59`, `v4.5` → `f17a9e5`, `v4.6` → `b065c1d`, `v4.7` → `afc8c47`, `v4.8` → `fa309a7`, `v4.9` → `7936505`, `v4.10` → `5ed4687`, `v4.11` → `7ace181`, `v4.12` → `e180949`, `v4.13` → `294a756`, `v4.14` → `05ad649`, `v4.15` → `851ce50`, `v4.16` → `f0d0bdb`, `v4.17` → `985e1f3`, `v4.18` → `f8b723e`, `v4.19` → `649aedf`, `v4.20` → `67cd30e`, `v4.21` → `0e3cc76`, `v4.22` → `462ebb3`, `v4.23` → `f5270ba`, `v4.24` → `ecb2d39`, `v4.25` → `652c247`.

---

## Common patterns / recipes

- **Add a setting**: getter in `lib/core.js` (near
  `getWorkHours`), form field in `/settings` Generelt section, extend
  form submit, optional default in helper.
- **Add a calendar feature that needs server data in JS**: inject as
  `const X = ${JSON.stringify(x)};` at the top of the right IIFE.
- **Add a new emoji to a picker**: `ICON_GROUPS` array (settings copy
  AND calendar copy — there are two!). Keep the group structure.
- **Add an API endpoint**: use the matching module in `routes/api/`.
  Mind method (`req.method`) and await parsing before reading mutable data:
  ```js
  const data = await readJsonBody(req);
  const items = loadCollection('tasks');
  // Validate, mutate, save synchronously, then respond.
  ```

---

## Bug fixing workflow

**Every bug fix MUST include a regression test.** No exceptions without
explicit justification. The test proves the bug existed and prevents it
from returning.

1. Add a failing scenario to `tests/scenarios.js` (or a Playwright spec
   under `tests/playwright/` if it's page-level) that demonstrates the
   bug. Run it and confirm it fails with a clear message.
2. *Then* fix the code.
3. Re-run the test and confirm it passes. Run the full suite
   (`npm test`) before considering it done.
4. Leave the test in place — it's now a regression guard.
5. The commit message should reference the test (e.g.
   "fix: X was broken — added regression test").

If a bug genuinely cannot be expressed as a UI/component test (e.g.
build-time concern, infra), say so explicitly and document why; don't
silently skip the step. See `agents/tests.md` for the test harness.

---

## When in doubt

- Do a syntax check before restarting: `node -c server.js && echo OK`.
- After restart, hit `/`, `/calendar`, `/settings` and confirm 200s.
- If a feature spans IIFEs, audit scope before refactoring.
- Keep commits surgical. Don't fix unrelated stuff in the same commit.

---

## Sub-agent model selection

Prefer lower-cost models for bounded rewrites and mechanical work.
Keep architecture decisions, integration and final review in the parent.
Use direct tools instead of an agent for a few file reads or a small edit.

| Task type | Agent type | Recommended model |
| --- | --- | --- |
| Independent, substantial exploration | `explore` | `gpt-5.4-mini` |
| Existing test/build commands, pass/fail summary | `task` | `gpt-5.4-mini` |
| Bounded rewrite with explicit file ownership and regression cases | `general-purpose` | `gpt-5.4-mini` |
| Complex integration or review after the bounded approach fails | matching specialist | Escalate deliberately to an available higher-capability model |

**Rules of thumb:**
- Assign disjoint files and concrete completion criteria. Keep shared
  integration files (notably `lib/core.js` and `server.js`) with one owner.
- Parallelize only independent work; don't duplicate an agent's scope.
- Coordinate test-server ports and output directories between runners.
- Model availability changes; use a currently available lower-cost model
  rather than copying an obsolete model id.

## Cleanup findings and remaining work

The cleanup keeps vanilla JS, Web Components, existing URLs and JSON/
markdown storage. It is not a framework migration.

Confirmed failure modes were shared nested cache objects, destructive
partial collection reads, request/global context mixing, callback handlers
escaping the dispatcher, unknown-directory quarantine of valid collections,
note-save success before metadata persistence, editable closed occurrences,
and preview modules/mention sources diverging. Preserve the regression
coverage and storage/context boundaries above when refactoring further.

`lib/core.js`, `routes/debug.js` and large domain page controllers still
need smaller domain-specific boundaries. Legacy catches, multi-collection
operations without transactions, direct per-domain file writes, and startup
autosave cleanup remain separate follow-up work; do not treat the shared
storage layer as having solved every persistence path.

During extraction, preserve all global event bridges and route aliases:
syntax-only coverage cannot catch a missing new-note route or callout host.
Keep component demos on explicitly injected mocks, not whatever people
happen to exist in the active context.

---

## Maintenance contract for this file

When you change anything that affects:
- where data lives
- how routes work
- how the templating / IIFE scopes are structured
- conventions agents must follow
- per-context settings shape

…update the relevant section here **and the matching `agents/*.md`
file** before committing. If you delete a feature, remove its mention
(and the per-feature file). If you add a new feature, add a new
`agents/<feature>.md` and link it from the layout list above. If you
add a gotcha, write it down. Future-you will thank present-you.
