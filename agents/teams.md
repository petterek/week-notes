# Feature: Teams

Teams group people together. A team is `@mention`-able in notes (just
like people and companies) and appears in the People page as a
dedicated tab.

---

## Storage (per context)

| File | Shape (array of) |
| --- | --- |
| `teams.json` | `{ id, key, name, members: string[], notes?, deleted?, created }` |

- `key` — auto-generated from name (lowercase, alphanumeric + æøå,
  max 24 chars). **Shared namespace** with people and companies; POST
  checks all three collections for collisions.
- `members` — array of person `key` strings. Kept unique and lowercase.
- `deleted: true` — soft-delete tombstone. Members cleared on delete.
- Bi-directional sync: each person in `people.json` gets a `teams[]`
  array listing team keys they belong to (denormalized via
  `_syncPeopleTeams`).

---

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/teams` | List all live (non-deleted) teams |
| GET | `/api/teams/:key/status` | Aggregated team relations (members, notes, meetings, tasks) |
| POST | `/api/teams` | Create a team |
| PUT | `/api/teams/:id` | Update name, members, notes |
| DELETE | `/api/teams/:id` | Soft-delete (tombstone + clear members) |
| GET | `/team/:key` | SPA page — team status view |

Route module: `routes/api/teams.js`

### POST body

```json
{ "name": "Team Name", "members": ["alice", "bob"], "notes": "optional" }
```

### PUT body

Same fields; only provided fields are updated.

---

## UI

### People page tab

Teams appear as a tab on `/people` (alongside Personer, Selskaper,
Steder). The tab renders a card list of live teams showing:
- Team name + member count
- Member avatars/names
- Edit / delete / **📊 Status** link actions

### Team status page (`/team/:key`)

A dedicated page showing all relations for a team:
- **Members** — cards linking to each member on the people page
- **Notes** — notes mentioning `@teamkey` (searched via `searchMdFiles`)
- **Meetings** — meetings where any team member is in `attendees`
- **Tasks** — open tasks where `responsible` or `participants` includes
  a team member; completed tasks shown in a collapsible section

The page reads the team key from the URL path, fetches
`/api/teams/:key/status`, and renders entirely client-side.

Relevant code: `domains/people/team-status-page.js`

### Create / Edit modal

- Name input (required)
- `<person-multi-picker>` for member selection (convention: always use
  `<person-multi-picker>` when selecting multiple people)
- Optional notes textarea
- On save: POST or PUT to `/api/teams/:id`

Relevant code: `domains/people/people-page.js`
- `_renderTeamsTab()` — renders the team cards
- `_renderTeamForm()` — modal with person-multi-picker
- `_saveTeam()` — reads picker `.value`, POST/PUT

---

## Mentions

Teams participate in the `@mention` system across the app:

### Autocomplete (client-side)

In `domains/notes/note-editor.js`, the `mentionTrigger.fetchItems`
fetches `/api/teams` and includes them in the dropdown with:
- Icon: 👥
- Hint: "team"
- Filterable by both `key` and `name` (wn-autocomplete `starts` filter
  checks both `item.label` and `item.value`)

### Server-side rendering

`linkMentions()` in `lib/core.js` resolves `@teamkey` tokens into
`<entity-mention kind="team" key="..." label="...">` elements. Teams
are checked after companies but before people in the resolution order.

### Preview rendering

`note-editor.js` `_loadLinkData()` fetches teams and passes them as
the 4th argument to the client-side `linkMentions()` for live preview.

---

## Code map

| File | What |
| --- | --- |
| `routes/api/teams.js` | CRUD API + status endpoint + `_syncPeopleTeams` helper |
| `domains/people/people-page.js` | UI: teams tab, create/edit modal |
| `domains/people/team-status-page.js` | Team status page (members, notes, meetings, tasks) |
| `domains/people/person-multi-picker.js` | Member selection component |
| `domains/notes/note-editor.js` | Autocomplete integration |
| `domains/_shared/wn-autocomplete.js` | Filter logic (starts/substring match on value too) |
| `lib/core.js` | `loadTeams()`, `loadAllTeams()`, `saveTeams()`, `linkMentions()`, `computeNoteReferences()` |
| `components/_shared.js` | Client-side `linkMentions()` (accepts teams as 4th arg) |
| `pages/team.html` | SPA fragment for /team/:key route |

---

## Conventions / gotchas

- **Person-multi-picker for member selection** — never use checkboxes.
  Read `.value` (array of keys) from the picker.
- **Modal overflow** — `.pp-modal-card` uses `overflow: visible` so the
  picker dropdown isn't clipped by the modal boundary.
- **Key collision check** — POST checks people + companies + live teams.
  If the generated key collides, a numeric suffix is appended.
- **Sync is one-way on save** — `_syncPeopleTeams` rewrites
  `person.teams` based on current team membership whenever a team is
  created, updated, or deleted. It does NOT run on people save — if a
  person is deleted, their key remains in `team.members` until the team
  is next saved.
- **`loadTeams()` vs `loadAllTeams()`** — `loadTeams()` returns only
  non-deleted teams (used by API GET, mentions); `loadAllTeams()`
  returns everything including tombstones (used by mutations that need
  to write back the full array).
- **Note references** — `computeNoteReferences()` resolves `@teamkey`
  to `refs.teams[]` (not people). Resolution order matches
  `linkMentions`: companies → teams → people → places.
  `syncMentions()` also skips team keys so no spurious person stubs
  are created.
