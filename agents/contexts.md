# Feature: Contexts (multi-workspace)

Multiple isolated workspaces, each its own folder with its own data
and its own git repo. A request captures its active context before
reading its body or calling any domain handlers.

## Storage

- Root: `CONTEXTS_DIR/<ctx>/` from `lib/data-paths.js`; `DATA_DIR`
  overrides the default `<repo>/data`. Context ids pass `safeName`.
- Each context contains `settings.json`, optional `meeting-types.json`,
  week folders `YYYY-WNN/`, and per-item directories registered in
  `lib/collections-manifest.js` (including `meeting-series`, `goals`,
  and `teams`). Legacy `<collection>.json` arrays remain readable when
  their directory does not exist.
- Metadata is stored in `notes-meta/<week>/<note>.md.json`; sidecars
  override matching entries in a remaining legacy `notes-meta.json`.
- Active context state: `data/.active` — single-line file with the
  context id. Created automatically.

## Request isolation

`server.js` resolves `wn_ctx` cookie → `.active` fallback once, exposes
`ctx.contextId`, and wraps the awaited route chain in
`runWithDataContext(contextId, ...)` (`lib/request-context.js`).
Use `getDataContext()` in handlers and helper defaults: it survives
awaits and is used by `dataDir()` and the per-context caches.
`getActiveContext()` intentionally means the global default only.

`dataDir(id)` and `loadCollection(name, id)` support explicit reads.
Background post-switch pull/index work runs inside
`runWithDataContext(next, ...)`, rather than inheriting the old request.
Context switching no longer deletes either context's in-progress
autosaves. The legacy startup cleanup policy is separate.

This is request isolation, not a separate identity for every tab:
browser-profile cookies are shared between tabs. Collections, note
metadata and settings return independent nested snapshots; modifications
must be persisted explicitly.

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

- Backend helpers in `lib/core.js`: `safeName`, `listContexts`,
  `getActiveContextFromReq`, `getDataContext`, `getActiveContext`,
  `getContextSettings`, `setContextSettings`, `getWorkHours`,
  `getDefaultMeetingMinutes`.
- APIs: `routes/api/contexts.js`; SPA stub: `routes/spa.js`.
- Settings UI: `domains/settings/settings-page.js`; its form submit
  builds the request body (including `workHours`) before PUTing.
- No-context guard: `server.js` redirects disallowed paths to `/welcome`.
- Context switcher: shared navbar and browser app-shell wiring.

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

- Lives on the `/welcome` route in `routes/static-early.js` and pulls
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
- **Week-notes marker** — every context has a `.week-notes` file at
  the repo root: `{ "type": "week-notes", "version": "<git-sha>" }`
  where the SHA is the week-notes server's HEAD commit at the time
  the marker was written. Written by `writeMarker(dir)` in
  `createContext` and `cloneContext`, and backfilled for legacy
  contexts by `ensureAllContextsInitialised` on startup.
- **Remote validation** — when a remote is supplied/changed:
  - `gitPullInitial` fetches first, then verifies
    `origin/<branch>:.week-notes` exists. Empty remote (no branches)
    is allowed (fresh push target). If the marker is missing it
    returns `{ ok:false, invalid:true, error: ... }`.
  - `cloneContext` checks `.week-notes` exists in the cloned
    working tree and rolls back the clone (`rm -rf dir`) if not.
  - `createContext` rolls back the whole context (rm dir) on
    `invalid` validation failure.
  - `setContextSettings` reverts the `origin` URL change and throws
    so the bad remote never gets persisted to `settings.json`.
  All three surface the error via 400 from the API endpoints. When
  the server returns `{ ok:false, needsConfirm:true, error }` the
  client (welcome + settings forms) shows a confirm dialog and, on
  yes, retries the same request with `force: true` (or `__force`
  on the settings PUT). On force-success the marker is written and
  committed locally (no auto-push).
- **Disconnect** — `disconnectContext(id)` (and `POST /api/contexts/:id/disconnect`):
  1. Requires the context to have a remote and be a git repo.
  2. Stages all pending changes and commits if dirty.
  3. Pushes `HEAD` to `origin` (throws on failure — nothing is destroyed).
  4. Records `{ id, name, icon, remote, disconnectedAt }` in
     `data/.disconnected.json` (URL memory, gitignored via `data/`).
  5. Clears `.active` if it pointed at this context.
  6. `rm -rf` the working tree.
  Surfaced as a "🔌 Koble fra" button on each context's settings
  detail (only shown when a remote is configured). Endpoints
  `GET /api/contexts/disconnected` and `DELETE /api/contexts/disconnected/:id`
  read/forget the URL memory.
- The active-context dropdown lives in EVERY page's navbar via the
  global body script — adding a context doesn't refresh open tabs.
- With no contexts, only welcome resources, themes and context APIs
  bypass the `/welcome` redirect; do not send users to a settings stub
  that requires an existing context.

## Related

- `git.md` — per-context git operations.
- `calendar.md` — uses `getWorkHours` and `getDefaultMeetingMinutes`.
