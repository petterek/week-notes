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
| GET | `/people` | Directory page |
| GET | `/api/people` | List (excludes tombstones) |
| PUT | `/api/people/:key` | Update / create / inactivate / delete |

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
- People page: full edit modal with save/inactivate/delete buttons.

## Code map

- Backend: `loadPeople`, `loadAllPeople` (includes tombstones),
  `savePeople`, `syncMentions`, `linkMentions` in `server.js`.
- `/people` page route (~line 3497).
- Edit modal: `saveEditPerson()` (~line 3661).

## Conventions

- Use `loadPeople()` for UI (excludes tombstones).
- Use `loadAllPeople()` only inside `syncMentions` so tombstones are
  honored.
- When deleting from the UI, set `deleted: true`, don't splice the
  array. The mention pipeline checks for tombstones.
- Person key is lowercase, single-word. Multiple-word names get
  `firstName`/`lastName` separately.

## Gotchas

- `name.toLowerCase() === key` is a fallback match for older entries
  without an explicit `key`.
- The `personTip` cache is per page-load — mutations require reload
  to refresh tooltips.
- Mention autocomplete may need re-init when modals show new inputs
  (e.g. comment modal, meeting modal).
