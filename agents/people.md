# Feature: People (CRM-lite)

Lightweight directory of people referenced by `@mentions` across the
app.

## Storage

- File: `data/<ctx>/people.json`
- Shape (array): `{ key, name, firstName?, lastName?, title?, email?,
  phone?, notes?, inactive?, deleted? }`
- `key` = lowercase mention key. `name` = display name.
- `deleted: true` is a **tombstone** — kept in the file so
  `syncMentions` doesn't auto-recreate the person.
- `inactive: true` hides from autocomplete but keeps history.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/people` | Directory page (filter, sort, expand-all, "Ny person", deep-link `#<key>`) |
| GET | `/api/people` | List (excludes tombstones) |
| POST | `/api/people` | Create person (`firstName` required; auto-generates unique `key`) |
| PUT | `/api/people/:id` | Update fields (firstName, lastName, title, email, phone, notes, inactive) |
| DELETE | `/api/people/:id` | Tombstone (sets `deleted: true`, not removed) |

## Mention pipeline

1. Server renders `@name` → `<a class="mention-link"
   data-person-key="name">@name</a>` via `linkMentions(escapeHtml(...))`.
2. `syncMentions(...texts)` extracts keys and ensures each one exists
   in `people.json` (skips tombstoned).
3. The global `personTip` script in `<body>` shows a hover card that
   fetches `/api/people` once and matches on `key` or `name`.
4. **Mention autocomplete**: `public/mention-autocomplete.js` —
   `initMentionAutocomplete(el)` wires `@`-trigger dropdown to any
   editable input/textarea.

## Where it shows up

- Home page: hover any `@name` for a tooltip card.
- Editor / task / comment / meeting modals: autocomplete on `@`.
- People page: card per person with foldable details. Each card lists
  matching **Oppgaver**, **Møter**, **Resultater**, **Notater** with
  deep links. Top toolbar has search filter, sort, expand/collapse,
  "Vis inaktive" toggle, and a `➕ Ny person` button (opens modal that
  POSTs to `/api/people`). Person cards have stable anchors `#<key>`
  for deep linking from `mention-link` elsewhere.

## Reference detection

For each person on `/people`, the server scans:
- `tasks.json` — `text` and `note`
- All `*.md` notes under every `YYYY-WNN/` folder
- `meetings.json` — `attendees[]`, plus `extractMentions` of
  `title`/`notes`/`location`
- `results.json` — `people[]`, plus `extractMentions` of `text`

Mentions are matched by **key** (lowercase, the actual `@key` syntax),
NOT by display name. Pre-extraction is done once and reused for every
person to keep page render fast.

## Code map

- Backend: `loadPeople`, `loadAllPeople` (includes tombstones),
  `savePeople`, `syncMentions`, `extractMentions`, `linkMentions` in
  `server.js`.
- `/people` page route + `POST /api/people` + `PUT /api/people/:id` +
  `DELETE /api/people/:id` in `server.js`.
- Edit & New-person modals on `/people`: `openEditPerson()`,
  `saveEditPerson()`, `deleteEditPerson()`, `openNewPerson()`,
  `saveNewPerson()`.

## Conventions

- Use `loadPeople()` for UI (excludes tombstones).
- Use `loadAllPeople()` only inside `syncMentions`, the create POST,
  and PUT/DELETE handlers so tombstones are honored.
- When deleting from the UI, set `deleted: true` — don't splice the
  array. The mention pipeline checks for tombstones.
- Person `key` is lowercase, single-word. POST `/api/people`
  auto-derives it from `firstName` and dedupes against existing live
  keys (appends last initial, then a counter).
- Use **theme CSS variables** (`var(--surface)`, `var(--accent)`,
  `var(--text-muted)`, etc) — never hardcoded hex colors.
- Reference matching is **always by key**, never by full display name.

## Gotchas

- `name.toLowerCase() === key` is a fallback match for older entries
  without an explicit `key`.
- The `personTip` cache is per page-load — mutations require reload
  to refresh tooltips.
- Mention autocomplete may need re-init when modals show new inputs
  (e.g. comment modal, meeting modal).
- `PUT /api/people/:id` re-derives `key` from `firstName` on every
  edit. If you rename a person whose old key is referenced from
  notes/tasks, those references go stale. Prefer renaming in
  `firstName` only when the key wouldn't change.
- The route uses **person `id`** (not `key`) — both POST/PUT/DELETE
  identifiers come from the canonical `id` field.
