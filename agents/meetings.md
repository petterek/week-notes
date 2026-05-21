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

## Conventions / gotchas

- **Validation**: end datetime must be strictly after start datetime.
  For multi-day meetings, comparison uses `date + ' ' + start` vs
  `endDate + ' ' + end`.
- **Attendees**: stored as person keys (not display names). Components
  use `<person-multi-picker>` for selection.
- **syncMentions**: after create/update, the server calls
  `syncMentions(title, notes, attendeeMentions)` to auto-create people
  entries for any new @mentions.
- **Deep links**: meeting blocks in the calendar have
  `id="m-<meetingId>"` so `#m-<id>` in the URL scrolls and pulses.
- **Cross-context**: `?allContexts=1` returns meetings from all
  contexts (if `appSettings.crossContextCalendar.enabled`), each tagged
  with `_ctx`, `_ctxName`, `_ctxIcon`, `_ctxColor`.
