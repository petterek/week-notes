# Feature: Settings page (`/settings`)

Master/detail SPA page for managing contexts, app-level settings, and
per-context configuration. Renders as a full-width layout via
`body:has(.ctx-page) { max-width: none; }`.

---

## Component

| Component | File |
| --- | --- |
| `<settings-page>` | `domains/settings/settings-page.js` (~2100 lines) |
| `SettingsService` | `domains/settings/service.js` |

The component is a `WNElement` subclass with shadow DOM. It uses
imperative rendering (`_renderRail` / `_renderDetail`) rather than
the declarative `render()` pattern.

---

## Layout

```
┌──────────────────────────────────────────────────┐
│ App-level tabs: Velkommen│Bruker│Søk│Oppsummer│📅 │
├──────────┬───────────────────────────────────────┤
│ Context  │ Detail panel for selected context     │
│ rail     │   - Generelt (icon, name, desc, theme)│
│ (list)   │   - Arbeidstid (per-day hours)        │
│          │   - Møtetyper (types + icon picker)    │
│          │   - Git (remote, branch, sync)         │
│          │   - Indekser (search/embed stats)      │
│          │   + Create / Clone / Delete actions    │
└──────────┴───────────────────────────────────────┘
```

---

## App-level tabs (top row)

| Tab key | Label | Purpose |
| --- | --- | --- |
| `welcome` | 👋 Velkommen | Version info, changelog link |
| `user` | 👤 Bruker | "Me" person key (maps `@me` to a real person) |
| `embeddings` | 🔍 Søk | Search index settings + reindex button |
| `summarize` | 📝 Oppsummer | AI summarize model config |
| `crosscal` | 📅 Kalender | Cross-context calendar toggle |

These are stored in the global `app-settings.json` (not per-context).
API: `GET/PUT /api/app-settings`.

---

## Per-context detail sections

Rendered when a context is selected in the left rail. Sections are
expandable `<details>` or tabbed regions.

### Generelt

- **Icon** — emoji picker (`CONTEXT_ICON_GROUPS`)
- **Name** — display name for the context
- **Description** — short text
- **Theme** — dropdown of available themes (builtin + custom)

### Arbeidstid (Working hours)

- 7 rows (Mon–Sun), each with enabled checkbox + start/end time
- Stored as `workHours: Array(7)` in `settings.json`
  - Each entry: `{ start: "HH:MM", end: "HH:MM" }` or `null` (day off)
  - Day 0 = Monday, 6 = Sunday

### Møtetyper (Meeting types)

- Sortable list of `{ key, icon, label, mins }`
- Grouped icon picker (`MEETING_ICON_GROUPS`)
- Per-type default duration in minutes
- API: `GET/PUT /api/contexts/:id/meeting-types`

### Git

- Shows remote URL, branch, last commit
- Buttons: Pull, Push, Commit, Set remote
- API calls: `/api/contexts/:id/git/...`

### Indekser (Indexes)

- Search index stats + reindex button
- Embedding index stats + rebuild button

---

## API routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/contexts` | List all contexts |
| POST | `/api/contexts` | Create new context |
| POST | `/api/contexts/switch` | Switch active context |
| GET | `/api/contexts/:id/settings` | Read context settings |
| PUT | `/api/contexts/:id/settings` | Write context settings |
| GET/PUT | `/api/contexts/:id/meeting-types` | Meeting types |
| Various | `/api/contexts/:id/git/*` | Git operations |
| POST | `/api/contexts/:id/clone` | Clone context |
| DELETE | `/api/contexts/:id` | Delete context |
| GET/PUT | `/api/app-settings` | Global app settings |
| GET/PUT | `/api/me` | "Me" person key |

Route modules: `routes/api/contexts.js`, `routes/api/misc.js`

---

## Storage

### Per-context: `data/<ctx>/settings.json`

```json
{
  "name": "Work",
  "icon": "💼",
  "description": "...",
  "theme": "paper",
  "workHours": [
    { "start": "08:00", "end": "16:00" },
    { "start": "08:00", "end": "16:00" },
    ...
    null
  ],
  "defaultMeetingMinutes": 60
}
```

### Global: `data/app-settings.json`

```json
{
  "searchIndex": { "enabled": true },
  "embeddings": { "model": "...", "enabled": false },
  "summarize": { "model": "...", "enabled": false },
  "crossContextCalendar": { "enabled": false }
}
```

### User: `data/user.json`

```json
{ "mePersonKey": "alice" }
```

---

## Conventions / gotchas

- **Full width**: the page uses `.ctx-page` class → CSS rule removes
  max-width. Don't remove without updating layout.
- **Icon pickers**: two separate grouped icon sets —
  `CONTEXT_ICON_GROUPS` (for context icons) and
  `MEETING_ICON_GROUPS` (for meeting type icons). They live in the
  component file, not shared.
- **workHours backward compat**: `getWorkHours(ctxId)` in `lib/core.js`
  handles the old `workStart/workEnd/workDays` format and converts to
  the modern array.
- **Save is pass-through**: `PUT /api/contexts/:id/settings` merges
  the body into `settings.json` without server-side validation. The
  component is responsible for building a well-formed payload.
- **"Me" person key**: set via `/api/me` PUT. Maps `@me` mentions to
  a real person key. Displayed in the Bruker tab.
- **Theme application**: when a theme is saved, the server responds
  and the page updates `<link id="themeStylesheet">` href immediately.
