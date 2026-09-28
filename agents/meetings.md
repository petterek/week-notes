# Feature: Meetings (domain components)

Client-side web components for creating, editing, and listing meetings.
These complement the server-side calendar page (see `agents/calendar.md`
for the full-page calendar, grid rendering, time pickers, and server
routes).

---

## Components

| Component | File | Purpose |
| --- | --- | --- |
| `<meeting-create>` | `domains/meetings/meeting-create.js` | Form for creating a new meeting |
| `<meeting-edit>` | `domains/meetings/meeting-edit.js` | Form for editing an existing meeting |
| `<upcoming-meetings>` | `domains/meetings/upcoming-meetings.js` | Sidebar widget showing next N days of meetings |
| `<today-calendar>` | `domains/meetings/today-calendar.js` | Compact day strip (used on home) |
| `<all-contexts-calendar>` | `domains/meetings/all-contexts-calendar.js` | Cross-context merged calendar view |
| `<week-notes-calendar>` | `domains/meetings/week-notes-calendar.js` | Full week calendar component |
| `<meeting-create-modal>` | `domains/meetings/meeting-create-modal.js` | Modal wrapper around meeting-create |
| `<meeting-series-page>` | `domains/meetings/meeting-series-page.js` | `/meeting-series` dashboard: series list + agenda queue + occurrence history |
| `<meeting-occurrence-page>` | `domains/meetings/meeting-occurrence-page.js` | `/meeting-occurrence/:id` workspace for a single series occurrence |

---

## `<meeting-create>`

Attributes:
- `meetings_service` — required; calls `create(data)` to persist
- `settings_service` — required; used for `getMeetingTypes(contextId)`
- `date` — preset YYYY-MM-DD (defaults to today)
- `start` / `end` — preset HH:MM
- `type` — meeting-type key to pre-select

Events emitted:
- `meeting-create:created` — `detail: { meeting }` after POST success
- `meeting-create:cancel` — cancel button clicked
- `meeting-create:error` — `detail: { error }` on failure

Uses `<pick-date-time-span>` for date/time selection and
`<person-multi-picker>` for attendees.

---

## `<meeting-edit>`

Same form as create but pre-filled from an existing meeting object.
Uses `PUT /api/meetings/:id`.

Events:
- `meeting-edit:saved` — `detail: { meeting }`
- `meeting-edit:cancel`
- `meeting-edit:error`

---

## `<upcoming-meetings>`

Fetches `GET /api/meetings?upcoming=N` (default N=7) and renders a
compact list of upcoming meetings with:
- Time, type icon, title (with linked @mentions)
- Click → navigates to `/calendar/<week>#m-<id>`

Used on the home page sidebar.

---

## Storage

Meetings are stored in `data/<ctx>/meetings.json`. See
`agents/calendar.md` for full shape.

Key fields:
```json
{
  "id": "...",
  "date": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",   // only if multi-day
  "start": "HH:MM",
  "end": "HH:MM",
  "title": "string",
  "type": "meeting-type-key",
  "attendees": ["person-key", ...],
  "location": "string",
  "placeKey": "place-key",
  "notes": "markdown string"
}
```

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/meetings?week=YYYY-WNN` | Meetings in a week |
| GET | `/api/meetings?upcoming=N` | Next N days |
| GET | `/api/meetings?allContexts=1` | Cross-context (if enabled) |
| POST | `/api/meetings` | Create |
| PUT | `/api/meetings/:id` | Update |
| DELETE | `/api/meetings/:id` | Hard delete |
| GET | `/api/meeting-types` | Active context types |
| PUT | `/api/meeting-types` | Replace types array |

Route module: `routes/api/meetings.js`

---

## Meeting types

Array stored in `data/<ctx>/meeting-types.json`:
```json
[{ "key": "standup", "icon": "💼", "label": "Standup", "mins": 15 }]
```

Falls back to `DEFAULT_MEETING_TYPES` in `lib/core.js` if file is
missing. Editable from the Settings page (meeting-types tab within
context detail).

---

## Meeting series (recurring occurrences with a persistent agenda)

A **meeting series** is a recurring meeting (e.g. a weekly 1:1 or team
sync) that owns a long-lived agenda queue. Each concrete calendar
meeting linked to a series (an **occurrence**) gets a lightweight
in-meeting workflow: start it, work through the agenda, record
decisions, close it (unresolved items auto-defer back to the queue for
next time), and export the minutes to PDF. Plain one-off meetings
(no `seriesId`) are unaffected — they keep using `<meeting-create>` /
`<meeting-edit>` exactly as before.

### Storage

Series live as one JSON file per series under
`data/<ctx>/meeting-series/<id>.json` (via `loadCollection`/
`syncCollection`, same convention as goals/results/etc). Helpers:
`loadMeetingSeries()` / `saveMeetingSeries(list)` in `lib/core.js`.

```json
{
  "id": "ms_...",
  "title": "string",
  "description": "string",
  "status": "active | archived",
  "defaultAttendees": ["person-key", ...],
  "defaultLocation": "string",
  "defaultPlaceKey": "place-key",
  "defaultType": "meeting-type-key",
  "defaultDurationMins": 60,
  "agendaItems": [
    { "id": "ai_...", "title": "string", "state": "queued | resolved | cancelled",
      "order": 0, "createdAt": "ISO", "updatedAt": "ISO" }
  ],
  "created": "ISO"
}
```

Only `resolved`/`cancelled` are true "exit" states for a series-level
agenda item. There is no `deferred` state at the series level —
deferring only happens per-occurrence and simply leaves (or returns)
the item to `queued` so it's picked up by the next occurrence.

Occurrences are regular entries in `data/<ctx>/meetings.json` with
extra fields when linked to a series:

```json
{
  "...": "all normal meeting fields (date/start/end/title/attendees/location/...)",
  "seriesId": "ms_...",
  "status": "planned | in-progress | closed",
  "agenda": [
    { "agendaItemId": "ai_...", "title": "string (snapshot at creation time)",
      "order": 0, "notes": "string", "outcome": "null | resolved | deferred | cancelled" }
  ],
  "decisions": [{ "id": "d_...", "text": "string", "createdAt": "ISO" }],
  "minutes": "freeform markdown string",
  "closedAt": "ISO (set on close, cleared on reopen)"
}
```

`agenda[].title` is a **snapshot** taken when the occurrence is
created (or when an ad-hoc item is added mid-meeting) — later edits to
the series agenda item's title, or its deletion, do not rewrite past
occurrences' minutes.

### Occurrence lifecycle

1. **Create** — `POST /api/meetings` with `seriesId` (and no `title`,
   which falls back to the series title). The occurrence's `agenda[]`
   is auto-populated from every series agenda item currently in
   `queued` state (this is how carry-forward from a previous
   occurrence surfaces). `status` starts at `planned`.
2. **Start** — `POST /api/meetings/:id/start` → `status: in-progress`.
3. **Work the agenda** — `PUT /api/meetings/:id/agenda/:agendaItemId`
   with `{ notes?, outcome? }`. `outcome` is one of
   `resolved | deferred | cancelled | null` (null clears it — no guard
   against re-deciding after reopen, intentionally permissive).
   Ad-hoc items can be added mid-meeting with
   `POST /api/meetings/:id/agenda {title}` — this **also** appends a
   new `queued` item to the parent series (so it becomes durable, not
   just a one-off note).
4. **Decisions** — flat list, `POST /api/meetings/:id/decisions {text}`
   / `DELETE /api/meetings/:id/decisions/:decisionId` (delete exists
   only to correct mis-entries, not as a "revert" workflow).
5. **Close** — `POST /api/meetings/:id/close` → `status: closed`,
   `closedAt` set. Any agenda entry with no `outcome` yet is
   auto-defaulted to `deferred` ("confirm auto-defer" — the UI shows a
   confirmation dialog naming the count before calling this). Closing
   syncs each entry's outcome back onto the matching series agenda
   item: `resolved`→`resolved`, `cancelled`→`cancelled`, anything else
   (`deferred`, or an explicitly cleared outcome) → back to `queued`,
   which is exactly what makes it reappear on the *next* occurrence
   created for the series.
6. **Reopen** — `POST /api/meetings/:id/reopen` → `status:
   in-progress`, clears `closedAt`. Does **not** revert the series
   sync from step 5 — editing agenda outcomes again after reopening
   and re-closing re-syncs correctly, but the series state in between
   reflects the previous close.

Only occurrences with a `seriesId` expose any of the above endpoints;
calling them on a plain meeting returns 400.

### API

Route module: `routes/api/meeting-series.js` (series CRUD + agenda
management) plus additions to `routes/api/meetings.js` (occurrence
lifecycle). **GET-single endpoints return the bare entity**, not
`{ok, ...}` — this is the one place in the codebase that differs from
the usual mutation-response convention (kept consistent between these
two new route files since there's no repo precedent either way).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/meeting-series` | List all series + rollup fields (`occurrenceCount`, `queuedAgendaCount`, `nextOccurrence`, `lastOccurrence`) |
| POST | `/api/meeting-series` | Create `{title, description?, defaultAttendees?, defaultLocation?, defaultPlaceKey?, defaultType?, defaultDurationMins?}` |
| GET | `/api/meeting-series/:id` | Single series + rollup (bare object) |
| PUT | `/api/meeting-series/:id` | Update series fields (incl. `status` for archive/unarchive) |
| DELETE | `/api/meeting-series/:id` | Delete series (occurrences + tasks keep their data but lose the `seriesId` link is NOT auto-cleared — they just point at a dead id; UI treats a missing series lookup as "unlinked") |
| POST | `/api/meeting-series/:id/agenda` | Add a queued agenda item `{title}` |
| PUT | `/api/meeting-series/:id/agenda/:itemId` | Update (e.g. rename, or force a `state`) |
| DELETE | `/api/meeting-series/:id/agenda/:itemId` | Remove from the queue |
| GET | `/api/meetings/:id` | Single occurrence (bare object) — used by the workspace page |
| POST | `/api/meetings/:id/start` \| `/close` \| `/reopen` | Lifecycle transitions (series occurrences only) |
| POST | `/api/meetings/:id/agenda` | Add an ad-hoc agenda item `{title}` (also queues it on the series) |
| PUT | `/api/meetings/:id/agenda/:agendaItemId` | Update notes/outcome for one entry |
| POST | `/api/meetings/:id/decisions` | Add a decision `{text}` |
| DELETE | `/api/meetings/:id/decisions/:decisionId` | Remove a decision |
| PUT | `/api/meetings/:id` | Also accepts `{minutes}` for the freeform recap field |
| GET | `/meetings/:id/minutes` | Print/PDF export page (see below) — server-rendered, not JSON |

Client wrapper: `domains/meetings/service.js` (`MeetingsService`) —
same object used for plain meetings, extended with `listSeries`,
`createSeries`, `getSeries`, `updateSeries`, `removeSeries`,
`addAgendaItem`/`updateAgendaItem`/`removeAgendaItem` (series-level),
`start`/`close`/`reopen`, `addOccurrenceAgendaItem`/
`updateOccurrenceAgendaItem`, `addDecision`/`removeDecision`
(occurrence-level).

### PDF / minutes export

`GET /meetings/:id/minutes` (wired in `routes/pages.js`) calls
`meetingMinutesHtml(meeting, series, followUpTasks, people)` in
`lib/core.js` and returns a **standalone, print-optimized** HTML page
(no navbar/theme — deliberately hardcodes its own colors, the one
exception to the CSS-variable theming rule, since a printed/exported
page has no runtime theme). The user hits the browser's native
print dialog (`window.print()` on load, or manually) to get a PDF —
there is no server-side PDF rendering.

- If the occurrence's `status !== 'closed'`, the page shows a
  **"UTKAST" (draft) watermark** — closed occurrences (the normal
  case for something you'd actually export/share) render clean.
- Works for **any** meeting id, not just series occurrences — a plain
  meeting with no `agenda`/`decisions`/`status` fields renders a
  minimal page (title/date/attendees/notes) instead of crashing.
- Follow-up tasks are listed with their live `done` status at export
  time (not a frozen snapshot) — re-exporting later reflects
  completions made since.
- Linked from the occurrence workspace as "📄 Eksporter til PDF"
  (`target="_blank"`, so the workspace tab stays open).

### `<meeting-series-page>` (dashboard, `/meeting-series`)

Master/detail layout mirroring `<goals-page>`: series list (grouped
active/archived) on the left, detail pane on the right with agenda
queue management, occurrence history, follow-up tasks (`<task-create>`
quick-add), and a flattened decisions log across all of that series'
occurrences. Modals: "new series" and "new occurrence" (the latter
uses `<pick-date-time-span>` left blank by default plus a collapsible
"advanced" section for overriding attendees/location/type/duration —
leaving fields untouched means the server fills them from the series
defaults, so the modal must send `undefined`/omitted rather than
empty-string overrides).

Attributes: `meetings_service`, `tasks_service`, `people_service`
(all dot-path service references, e.g.
`week-note-services.meetings_service`).

### `<meeting-occurrence-page>` (workspace, `/meeting-occurrence/:id`)

Single-occurrence workspace, id read from
`location.pathname.match(/^\/meeting-occurrence\/([^/]+)$/)`. Fetches
the meeting, then — inside the *same* `loadData()` promise chain,
since `WNElement.awaitAll()` runs each key's factory independently
with no built-in cross-key dependency support — conditionally fetches
its parent series once the meeting resolves. Renders:
- Editable header (title/date-time-span/location/attendees) via a
  small modal, reusing `<pick-date-time-span>` / `<person-multi-picker>`
  / `<pick-place>` directly (no dependency on `<meeting-create>`).
- Agenda list: per-item notes (autosaved on blur) + outcome buttons
  (✅ Løst / ⏭️ Utsatt / 🚫 Avlyst — click the active one again to
  clear it back to undecided), plus an ad-hoc add row.
- Decisions add/list.
- Freeform minutes textarea (plain, no live markdown preview).
- Follow-up tasks scoped to **this occurrence** (`t.meetingId ===
  this._id`; the series dashboard instead shows every task tagged with
  the series regardless of which occurrence). Quick-add via
  `<task-create meeting-id="…" meeting-series-id="…">`.
- Lifecycle buttons: Start / Close (confirms first, naming how many
  agenda items will auto-defer) / Reopen.
- "📄 Eksporter til PDF" link to `/meetings/:id/minutes`.

Attributes: `meetings_service`, `tasks_service`, `people_service`.

### Routing

- Client SPA: `/meeting-series` in `ROUTES`, `/meeting-occurrence/:id`
  as a `ROUTE_PATTERNS` regex entry, both in `lib/core.js`. Fragments:
  `pages/meeting-series.html`, `pages/meeting-occurrence.html`
  (title + custom element with service attributes, same shape as
  `pages/goals.html`).
  Server stubs (empty-body shell + title, hydrated client-side) in
  `routes/spa.js`'s `SPA_STUBS` map (`/meeting-series`) and a regex
  block (`/meeting-occurrence/:id`).
- Nav: "🔁 Møteserier" in both `navbarHtml()` and `navLinksHtml()` in
  `lib/core.js` — no keyboard shortcut assigned.
- **Calendar click routing**: clicking a meeting block in
  `<week-notes-calendar>` normally opens the `<meeting-edit>` overlay
  (`_openEdit(id)`). If the clicked meeting has a `seriesId`,
  `_openEdit` instead does a client-side navigation to
  `/meeting-occurrence/:id` (the overlay/`<meeting-edit>` path is
  skipped entirely for series occurrences — they're edited from the
  workspace page instead, which is where the lifecycle/agenda/decisions
  actually live).

### Follow-up tasks

Tasks can carry `meetingSeriesId` / `meetingId` / `agendaItemId` —
see `agents/tasks.md`. Created via `<task-create>`'s
`meeting-id`/`meeting-series-id`/`agenda-item-id` attributes, mirroring
the pre-existing `goal-id` attribute exactly.

---

## Conventions / gotchas

- **Validation**: end datetime must be strictly after start datetime.
  For multi-day meetings, comparison uses `date + ' ' + start` vs
  `endDate + ' ' + end`.
- **Attendees**: stored as person keys (not display names). Components
  use `<person-multi-picker>` for selection.
- **syncMentions**: after create/update, the server calls
  `syncMentions(title, notes)` to auto-create people entries for any
  free-text @mentions in the title or notes. Attendees are NOT passed
  to `syncMentions` — they are already structured person keys (enforced
  by the picker) and passing them would cause `extractMentions` to
  truncate keys containing spaces (e.g. `'per jørgen'` → extracts `'per'`
  only), creating spurious stub persons.
- **Deep links**: meeting blocks in the calendar have
  `id="m-<meetingId>"` so `#m-<id>` in the URL scrolls and pulses.
- **Cross-context**: `?allContexts=1` returns meetings from all
  contexts (if `appSettings.crossContextCalendar.enabled`), each tagged
  with `_ctx`, `_ctxName`, `_ctxIcon`, `_ctxColor`.
