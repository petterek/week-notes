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
- One big file: `server.js` (~5k lines)
- Markdown rendered with `marked` (CDN)
- Slides via `reveal.js` (CDN)
- No build step, no bundler, no TypeScript
- Storage = plain JSON + markdown files on disk

---

## Repo layout

```
/home/p/migration/weeks/
├── server.js          # the entire backend + all HTML/CSS/JS (server-rendered)
├── README.md          # user-facing docs + changelog
├── AGENTS.md          # this file
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
  `main`.
- Every commit must include the trailer:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```
- **Never push without an explicit user instruction.** Stage and commit
  freely; wait for "push", "send it", "ship it" or similar before
  `git push`.
- README has a `## 📜 Changelog` section above Features. Update it for
  notable changes when the user asks for a README refresh.

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

…update the relevant section here **before** committing. If you delete
a feature, remove its mention. If you add a gotcha, write it down.
Future-you will thank present-you.
