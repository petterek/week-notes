# Feature: Calendar & meetings

Full-width 7-day, 24-hour calendar with per-context meeting types,
working-hour overlays, and per-meeting notes.

## Storage

- Meetings: `data/<ctx>/meetings.json` — array of
  `{ id, date (YYYY-MM-DD), start (HH:MM), end?, title, type, attendees?, location?, notes? }`.
- Meeting types: `data/<ctx>/meeting-types.json` — array of
  `{ key, label, icon }`. Falls back to defaults if missing.
- Per-context calendar settings (in `settings.json`):
  - `workHours`: `Array(7)` of `{start, end}` or `null` (0=Mon..6=Sun)
  - `defaultMeetingMinutes` (default 60)
  - Backward-compat: `workStart`/`workEnd`/`workDays`

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/calendar` (or `/calendar/YYYY-WNN`) | Week view |
| GET | `/meeting-note/:id` | Meeting note editor |
| GET | `/api/meetings?week=YYYY-WNN` | Meetings in a week |
| GET | `/api/meetings?upcoming=N` | Next N days (used by home sidebar) |
| POST | `/api/meetings` | Create |
| PUT | `/api/meetings/:id` | Update |
| DELETE | `/api/meetings/:id` | Delete |
| GET/PUT | `/api/contexts/:id/meeting-types` | Per-context types |
| GET/PUT | `/api/meeting-types` | Active-context fallback |

## Page anatomy

- `.cal-page` wrapper enables full-width via
  `body:has(.cal-page) { max-width: none; }`.
- `.cal-toolbar`: title, date range, `+ Nytt møte`, `✏️ Typer`,
  prev/today/next nav.
- `.cal-grid`: 8-column grid (hours column + 7 day columns), 1px gap
  background.
- `.cal-col-body`: column body, 24h × 36px = 864px tall.
- Work-band: first child of `.cal-col-body`, `pointer-events:none;
  z-index:0` so meetings render on top.
- Meeting blocks: `.mtg` with `id="m-<meetingId>"` for deep-link
  scroll-into-view from the home sidebar.
- Right-click menu: `#calCtxMenu` listing meeting types.
- Meeting modal: `#mtgModal` with title, type, date, time selects,
  attendees (mention autocomplete), location, notes.
- Types modal: `#typesModal` with grouped icon picker.

## Scoped scripts

The calendar route renders **multiple `<script>` IIFEs**. Cross-IIFE
data must be injected explicitly:

```js
const MEETING_TYPES = ${JSON.stringify(meetingTypes)};
const HOUR_START = ${HOUR_START}, HOUR_END = ${HOUR_END};
const DEFAULT_MTG_MIN = ${getDefaultMeetingMinutes()};
```

## Time picker

- **Do not** use `<input type="time">` — Chrome ignores `step` for
  the spinner UI.
- Hour `<select>` 00-23 + minute `<select>` 00,05,…,55 wrapped in
  `.time-pick`.
- Helpers in the calendar IIFE:
  - `fillTimeSelects()` — populate options.
  - `setTime(prefix, "HH:MM")` — set values, rounds to nearest 5min.
  - `getTime(prefix)` — read back as `"HH:MM"`.
  - `addMinutesToTime(t, mins)` — used to prefill end from start +
    default duration.

## Working-hours band

- `getWorkHours(ctxId)` returns `{ hours: [day0..day6, ...] }` where
  each entry is `{start, end}` or `null`.
- For each day column, render a `.work-band` div if its entry is
  non-null. `top` and `height` are computed from `HOUR_START`,
  `HOUR_PX` and the day's `start/end`.
- Edited per-day on the settings page (see `contexts.md`).

## Gotchas

- `MEETING_TYPES` is in a different scope than `currentTypes` (which
  belongs to the types-modal IIFE). Don't reference one from the
  other.
- Newly created meetings reload the page — a more elegant approach
  would be optimistic update + DOM insert, but reload is fine here.
- The hash `#m-<id>` highlight code listens to `hashchange` and runs
  once on load (with a small `setTimeout`).
- Default meeting length is read at render time and embedded as
  `DEFAULT_MTG_MIN`. After settings save, the calendar must be
  reloaded to pick up the new value.

## Related

- `home.md` — upcoming-meeting cards link to `/calendar/<week>#m-<id>`.
- `contexts.md` — meeting types and working-hours editing live in
  context settings.
