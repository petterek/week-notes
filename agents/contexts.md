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
- The active-context dropdown lives in EVERY page's navbar via the
  global body script — adding a context doesn't refresh open tabs.
- If no contexts exist, all paths except `/settings` and assets
  redirect to `/settings` (force-create one).

## Related

- `git.md` — per-context git operations.
- `calendar.md` — uses `getWorkHours` and `getDefaultMeetingMinutes`.
