# Feature: Contexts (multi-workspace)

Multiple isolated workspaces, each its own folder with its own data
and its own git repo. The "active context" is what every other
feature reads from.

## Storage

- Root: `data/<ctx>/` — must pass `safeName` (`[A-Za-z0-9_-]+`).
- Each context contains: `settings.json`, `tasks.json`, `people.json`,
  `meetings.json`, `meeting-types.json` (optional), `results.json`,
  `notes-meta.json`, plus week folders `YYYY-WNN/`.
- Active context state: `data/.active` — single-line file with the
  context id. Created automatically.

## Settings shape

```jsonc
{
  "name": "Work",
  "icon": "💼",
  "description": "...",
  "remote": "git@github.com:user/repo.git",
  "workHours": [
    { "start": "08:00", "end": "16:00" }, // Mon
    { "start": "08:00", "end": "16:00" }, // Tue
    { "start": "08:00", "end": "16:00" }, // Wed
    { "start": "08:00", "end": "16:00" }, // Thu
    { "start": "08:00", "end": "16:00" }, // Fri
    null,                                 // Sat off
    null                                  // Sun off
  ]
}
```

Backward-compat: old `workStart` / `workEnd` / `workDays` are still
read by `getWorkHours()` if `workHours` is missing.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/settings` | Master/detail editor (full width) |
| GET | `/api/contexts` | List contexts |
| POST | `/api/contexts` | Create |
| POST | `/api/contexts/switch` | Set active by id |
| GET/PUT | `/api/contexts/:id/settings` | Settings JSON |
| GET/PUT | `/api/contexts/:id/meeting-types` | Per-context types |
| POST | `/api/contexts/:id/commit` | Git commit |
| POST | `/api/contexts/:id/push` | Git push |
| GET | `/api/contexts/:id/git` | Git status |

## Code map

- Backend helpers: `safeName`, `listContexts`, `getActiveContext`,
  `getContextSettings`, `setContextSettings`, `getWorkHours`,
  `getDefaultMeetingMinutes` near the top.
- `/settings` page route (~line 2487) — master/detail layout.
- Form submit handler — see `~line 2790`. Builds the request body
  (incl. per-day `workHours`) before PUTing.
- No-context guard: redirects unknown paths to `/settings` if no
  contexts exist (~line 1832).
- Context switcher: navbar dropdown (`ctxTrigger` etc.) wired in the
  global body script.

## Settings page UI

- Left: list of contexts with icon, name, active badge.
- Right: detail pane per context, organised into three tabs:
  - **Generelt** — name, icon, description, theme picker.
  - **Møter** — work hours per day, meeting types (each with its
    own default duration in minutes).
  - **Git** — git status display, git remote (origin) URL.
- Tabs are pure HTML/CSS/JS — single `<form>` wraps all three panels
  so the bottom Save button submits everything regardless of which
  tab is visible. Tab state is per detail pane (not persisted).
- Width override: `body:has(.ctx-page) { max-width: none; }`.
- Working-hours rows use `.wh-row` with on/off checkbox + 4 selects
  (`wh-sH-i`, `wh-sM-i`, `wh-eH-i`, `wh-eM-i`). `.wh-row.on` toggles
  visibility/opacity.

## First-run welcome screen

When `listContexts().length === 0`, the no-context guard at the top
of the request handler redirects every non-allowed path to
`/welcome` (a standalone HTML page, NOT pageHtml-wrapped). That page:

- Lives entirely on the `/welcome` route in `server.js` and pulls
  styles from a real file at the repo root: `welcome.css`, served by
  the `/welcome.css` route.
- Has no navbar, no context switcher, no global search. Just hero +
  feature grid + two onboarding cards (Ny tom kontekst / Klon fra
  remote). Forms POST to `/api/contexts` and `/api/contexts/clone`.
- Loads the `paper` theme stylesheet so the design tokens
  (`--surface`, `--accent`, etc.) used in `welcome.css` resolve. The
  CSS also has hard-coded fallbacks so it still renders without a
  theme.
- On success the form redirects to `/` (the no-context guard has
  cleared because a context now exists).

The regular `/settings` page no longer has any "empty state" branch —
it always renders the rail+detail layout. If you ever land there
with zero contexts the guard sends you to `/welcome` first.

## Adding a new per-context setting (recipe)

1. **Getter** with default + validation near `getWorkHours` /
   `getDefaultMeetingMinutes`.
2. **Form field** in the appropriate tab panel of the settings page
   render (Generelt, Møter, or Git).
3. **Form-submit handler**: include the new field in the `data`
   object PUTed to `/api/contexts/:id/settings`.
4. **Read it where needed** via the getter (e.g. inject into the
   relevant page IIFE if it must be visible to client JS).

The PUT endpoint is pass-through (`setContextSettings(id, data)`) —
no server-side change needed unless validation is required.

## Gotchas

- `getContextSettings` returns a sensible default `{name:safe,
  icon:'📁'}` on read failure, so a missing file won't crash.
- `setContextSettings` rejects unknown ids (`!listContexts().includes(safe)`).
- When the user changes `remote`, `setContextSettings` syncs the
  `origin` URL on the per-context git repo, then triggers
  `gitPullInitial(dir)` to pull existing content from the new remote
  (uses `--allow-unrelated-histories` so the local "Init kontekst"
  commit can be merged with whatever's on origin). Same flow runs in
  `createContext` when a remote is supplied at creation time.
- `cloneContext(remoteUrl, name?)` runs `git clone` straight into
  `data/<safe>/`. Powers `POST /api/contexts/clone` and the "Klon
  fra remote" rail entry on `/settings`. Safe id is derived from the
  optional name or the last path segment of the remote URL. If the
  cloned repo already has a `settings.json` it's preserved (with
  `remote` overwritten to the URL used for cloning); otherwise a
  minimal one is written.
- The active-context dropdown lives in EVERY page's navbar via the
  global body script — adding a context doesn't refresh open tabs.
- If no contexts exist, all paths except `/settings` and assets
  redirect to `/settings` (force-create one).

## Related

- `git.md` — per-context git operations.
- `calendar.md` — uses `getWorkHours` and `getDefaultMeetingMinutes`.
