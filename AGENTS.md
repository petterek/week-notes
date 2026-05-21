# AGENTS.md — notes for coding agents

This file is for **you** (and other coding agents) working on this repo.
Keep it accurate. **Update it before every commit/push** that changes the
project meaningfully (architecture, conventions, gotchas, layout).

The user (a human) drives the work and decides when to push. **Do not
push to git unless explicitly told to** ("push", "send it", etc).

---

## What this is

`week-notes` — a self-hosted, single-binary Node.js web app for
structured weekly notes, tasks, people, meetings and results across
multiple isolated **contexts** (each context = its own git repo under
`data/<ctx>/`).

Vibe-coded. No specs, no tickets. Features grow organically.

Stack:
- Node.js (no framework, raw `http` module)
- Slim dispatcher in `server.js` (~9.4k lines, mostly the `http.createServer`
  request handler) + helper layer in `lib/` (`lib/core.js` for the bulk,
  `lib/dates.js` for date helpers; more per-domain splits TBD)
- Markdown rendered with `marked` (CDN)
- Slides via `reveal.js` (CDN)
- No build step, no bundler, no TypeScript
- Storage = plain JSON + markdown files on disk

---

## Repo layout

```
/home/p/migration/weeks/
├── server.js          # slim dispatcher (~95 lines): bootstrap + handler chain
├── lib/               # server-side helpers (extracted from server.js)
│   ├── core.js        # bulk: contexts, git, storage, domain loaders, render, workers
│   └── dates.js       # ISO-week / date math (pure, no deps)
├── routes/            # per-domain route modules. Each exports `(deps) => async (req, res, ctx) => void`
│   ├── static-early.js  # /welcome, /welcome.css, /themes/*.css, /_layouts, /help.md, /pages/*.html
│   ├── spa.js           # /, /tasks /people /results /notes /settings SPA stubs, /calendar stub
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
│       ├── meetings.js  # /api/meetings*, /api/meeting-types
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
│   ├── teams.md
│   ├── meetings.md
│   ├── settings.md
│   └── search-and-summarize.md
├── help.md            # in-app help, served at /help.md and rendered in a modal
├── run.sh             # start helper (checks if already running)
├── package.json       # minimal — no deps in production
├── data/              # per-context data, each subdir is a git repo
│   └── <ctx>/
│       ├── settings.json
│       ├── meetings.json
│       ├── meeting-types.json   # optional, falls back to defaults
│       ├── people.json
│       ├── tasks.json
│       └── YYYY-WNN/            # one folder per ISO week
│           └── *.md             # freeform markdown notes
└── public/            # static assets if any (mention-autocomplete.js etc)
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
node server.js -p 4000  # custom port
PORT=4000 node server.js
```

When restarting from an agent shell:

```bash
PID=$(lsof -ti:3001 || echo NONE)
[ "$PID" != "NONE" ] && [ -n "$PID" ] && kill $PID && sleep 1
nohup node server.js > /tmp/weeks.log 2>&1 &
disown
```

Notes:
- `bash mode: async, detach: true` is fine but be aware it may still
  emit a completion notification when the runtime closes the pty.
- The `kill` tool in this environment refuses empty PIDs and refuses
  `pkill`/`killall` — always grab the PID first via `lsof -ti:3001`
  and pass it explicitly.
- Don't rely on `pgrep` either; `lsof` is the standard.

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
| `/note/...`, `/meeting-note/:id` | Note editors |
| `/help.md` | Raw markdown for the help modal |
| `/api/...` | JSON APIs (people, tasks, meetings, contexts/:id/settings, contexts/:id/meeting-types, contexts/switch, …) |

### Adding/moving a route

Routes live in `routes/` modules grouped by URL prefix or domain. Each
module exports `(deps) => async (req, res, ctx) => void`, where `ctx`
contains `{ pathname, url, method }`. Inside the function the original
imperative pattern is preserved verbatim — match a path, write the
response, `return;`. Modules destructure everything they need from
`deps.core` (and `deps.rootDir` shadows `__dirname` so existing
`path.join(__dirname, …)` calls keep working).

Dispatch lives in `server.js`. After each handler runs the dispatcher
checks three signals to decide whether the route owned the request:

1. `res.writableEnded` (sync write+end)
2. `res.headersSent` (e.g. SSE: writeHead but no end yet)
3. New listeners added to `req` ('data'/'end') — i.e. the handler
   started reading a POST body

If none of those triggered, the next handler runs. The order in
`server.js`'s `handlers = [...]` array is significant — most-specific
static routes first, then per-domain APIs, then page catch-alls, then
late assets. Don't reorder without thinking about the catch-all
`/<week>/<file>.md` (note render) and `/api/notes/:ctx/(.+)` (delete
note) interactions. `setImmediate(...)` after `res.end()` is fine for
fire-and-forget background work — see `routes/api/contexts.js` switch
for the canonical pattern.

If you add a new route module, register it in `server.js`'s `handlers`
array and place it in the right slot relative to siblings. If a
handler does **async work via fs callbacks** (rather than awaitable
APIs), promisify it (`await fs.promises.readFile(...)`) — otherwise
the dispatcher will see no claim signal and forward the request to
the next handler.

---

## Conventions / things that bite

### Server.js is template-literal heavy
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
- Components live in `components/<name>.js` and are loaded via
  `<script defer src="/components/<name>.js">` from the relevant
  `<head>` in `server.js`. The `/components/*.js` static route serves
  them with a slug-safety check.
- Custom elements default to `display: inline`. If a component is
  meant to be a block (e.g. card or list), add a global rule like
  `note-card { display: block; }` next to its other CSS in
  `server.js`, or set it in `:host { display: block; }` for shadow-DOM
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
- `getActiveContext()` is file-only; safe everywhere but ignores
  per-request override.
- **In request handlers prefer `getActiveContextFromReq(req)`** when
  you need the user's currently-selected context. Falls back to file
  if cookie is missing or invalid.
- The cookie is set by:
  - `POST /api/contexts/switch` (always)
  - `GET  /api/contexts` (refreshes on every fetch)
  - SPA page renders (`routes/spa.js`)
- Use `activeContextCookie(id)` from `lib/core.js` to construct the
  `Set-Cookie` value (`wn_ctx=…; Path=/; Max-Age=1y; SameSite=Lax; HttpOnly`).
- Pass an empty id (`activeContextCookie('')`) to clear it.
- **Latent bug:** `dataDir()` (lib/core.js) still resolves via the
  file-only `getActiveContext()`, so handlers that touch the filesystem
  via `dataDir()` ignore the per-request cookie. New endpoints that need
  per-tab context isolation must compute the path with
  `path.join(CONTEXTS_DIR, getActiveContextFromReq(req))` instead.
  Notably this affects `/api/save` (incl. new-note draft autosave),
  `/api/save/draft`, and `/api/save/autosave` — autosaves still land in
  the file-active context if the user switched contexts in another tab.


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
  `## 📜 Changelog` section above Features; add a bullet under the
  current date for every notable change being shipped, then include
  the README update in the push.
- **Release tags as migration anchors.** When shipping a breaking data
  shape change, first tag the previous stable point on GitHub
  (`git tag -a vN <sha> && git push origin vN`). New entries in
  `scripts/migrate-context.js` should use the `appliesBeforeTag('vN')`
  helper so contexts whose `.week-notes` marker pre-dates the tag get
  migrated; never hard-code arbitrary commit SHAs in `appliesTo`.
  Current tags: `v1` → `fc809ad`, `v2` → `1d083d8`, `v3` → `c93b3cf`, `v4` → `83bbea3`, `v4.1` → `686d485`, `v4.2` → `080a9a5`, `v4.3` → `4a6c697`, `v4.4` → `3969f59`, `v4.5` → `f17a9e5`, `v4.6` → `b065c1d`, `v4.7` → `afc8c47`, `v4.8` → `fa309a7`, `v4.9` → `7936505`, `v4.10` → `5ed4687`, `v4.11` → `7ace181`, `v4.12` → `e180949`, `v4.13` → `294a756`, `v4.14` → `05ad649`, `v4.15` → `851ce50`, `v4.16` → `f0d0bdb`, `v4.17` → `985e1f3`, `v4.18` → `f8b723e`, `v4.19` → `649aedf`.

---

## Common patterns / recipes

- **Add a setting**: getter in top of `server.js` (near
  `getWorkHours`), form field in `/settings` Generelt section, extend
  form submit, optional default in helper.
- **Add a calendar feature that needs server data in JS**: inject as
  `const X = ${JSON.stringify(x)};` at the top of the right IIFE.
- **Add a new emoji to a picker**: `ICON_GROUPS` array (settings copy
  AND calendar copy — there are two!). Keep the group structure.
- **Add an API endpoint**: append a `pathname.match(...)` block in the
  big request handler. Mind method (`req.method`). Body parse pattern:
  ```js
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => { try { const data = JSON.parse(body || '{}'); ... } catch (e) { ... } });
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
