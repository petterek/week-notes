# Feature: Personer og steder (`/people`)

A tabbed directory at `/people` covering three entity types that all share
the same card shell:

1. **Personer** — people with `@mention` keys
2. **Selskaper** — companies, also `@mention`-able (share key namespace
   with people)
3. **Steder** — places with optional geo coordinates, used as meeting
   locations (NOT mentionable)

## Storage (per context)

| File | Shape (array of) |
| --- | --- |
| `people.json` | `{ id, key, name, firstName?, lastName?, title?, email?, phone?, notes?, inactive?, deleted?, primaryCompanyKey?, extraCompanyKeys?[], created }` |
| `companies.json` | `{ id, key, name, orgnr?, url?, address?, notes?, inactive?, deleted?, created }` |
| `places.json` | `{ id, key, name, address?, lat?: number\|null, lng?: number\|null, notes?, deleted?, created }` |

- `key` is lowercase, alphanumeric + `æøå`, max 24 chars; **shared
  namespace** between people and companies (POST endpoints check both
  files for collisions). Places have their own namespace.
- `deleted: true` = tombstone (kept so `syncMentions` doesn't recreate
  the person). DELETE is soft.
- `primaryCompanyKey` is stored separately from `extraCompanyKeys` and
  is auto-removed from the extras list on PUT.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/people` | Tabbed directory page (3 panes) |
| GET / POST | `/api/people` | List / create person |
| PUT / DELETE | `/api/people/:id` | Update / tombstone person |
| GET / POST | `/api/companies` | List / create company |
| PUT / DELETE | `/api/companies/:id` | Update / tombstone company |
| GET / POST | `/api/places` | List / create place |
| PUT / DELETE | `/api/places/:id` | Update / tombstone place |

People POST accepts `primaryCompanyKey` and `primaryCompanyKey`+`extraCompanyKeys` on PUT (deduped against primary). Places parse `lat`/`lng` as floats; null on empty/invalid.

## Tabs and deep links

- Tab state in URL hash: `#tab=people|companies|places`.
- Deep-link to entity within tab: `#tab=companies&key=acmeas` →
  switches to that tab AND expands+scrolls the matching card.
- Legacy short hashes (`#p-anna`, `#c-acmeas`, `#pl-hk`) also work — the
  page detects the prefix and activates the right tab.
- Card IDs: `p-<key>`, `c-<key>`, `pl-<key>`.

## Mention pipeline

1. `linkMentions(html, people, companies)` renders `@key` as either
   `mention-link mention-person` (👤 implicit, link to `/people`) or
   `mention-link mention-company` (🏢 prefix, link to
   `/people#tab=companies&key=...`). Companies take precedence when key
   collides (shouldn't happen because POST blocks it, but defensive).
2. `syncMentions(...texts)` extracts `@key` references and creates a
   stub person *only if* no live company already claims that key.
3. Tooltip script (single line at server.js:1446 inside the body
   wrapper) fetches `/api/people` and `/api/companies` once, caches
   both, branches on `data-company-key` first, then falls back to
   key-lookup. Person tooltip surfaces primary company name when set.
   Company tooltip shows orgnr / url / address / notes.

## /people page render structure (server.js around line 5443)

1. Load `people`, `companies`, `places`, `meetings`, `tasks`, `results`,
   plus all weekly notes for ref counts.
2. Pre-compute extracted refs **once**: `taskRefs`, `noteRefs`,
   `meetingRefs`, `resultRefs` — each `{ ..., mentions: Set<key> }`.
3. Build helper maps: `companyMembers` (companyKey → [{person,
   primary}]), `placeMeetings` (placeKey → meetings[]), `companiesByKey`.
4. Emit `.dir-tabs` nav + three `.dir-pane` sections.
5. Each pane has its own toolbar (filter input, expand/collapse,
   counter, "+ Ny ..." button).

## Map picker (Leaflet)

- Loaded from `unpkg.com/leaflet@1.9.4` CDN (CSS + JS), injected near
  the top of the page body.
- `#placeMapPicker` (in place-modal): editable map. Click to place
  marker; marker is draggable; lat/lng inputs auto-update.
- `.place-mini-map` (in expanded place card): read-only map with marker
  only. Init lazily — only when the card details become visible (via
  `togglePerson` or `expandAllPlaces` or initial deep-link scroll). The
  `data-inited` attr prevents double-init.
- All Leaflet code lives in the bottom `<script>` of the `/people`
  page; no external public/ asset.

## Meeting integration

- `meetings.json` items can have an optional `placeKey` (lowercase). The
  free-text `location` field is preserved for ad-hoc / fallback values.
- Meeting modal in `/calendar` route has TWO location fields:
  - "Sted (fritekst)" → `mtgLocation` (input)
  - "Knytt til registrert sted" → `mtgPlaceKey` (select, populated from
    `MEETING_PLACES` injected at the top of the calendar IIFE).
- POST/PUT `/api/meetings` accepts `placeKey`.
- Meeting block render in calendar grid prefers a `placeKey` lookup via
  `placesByKey` map (built inline near the top of the calendar
  rendering). When found and coords exist, renders a clickable OSM
  link; otherwise falls back to free-text `location`.

## Conventions / gotchas

- Modals are template-literal HTML at the bottom of the `/people` page.
  The injected `<script>` block contains a global `const ALL_COMPANIES`
  used by both the new-person modal and the edit-person modal to
  populate the company select / extras checkbox list.
- `togglePerson(headerEl)` is shared by all three card types — same
  `.person-card` / `.person-details` / `.person-chev` structure.
- For places, `togglePerson` also lazy-initializes the mini-map on
  first open (calls `initMiniMap(el)` if not yet inited).
- Filter functions are per-tab: `applyPeopleFilter`, `applyCompanyFilter`,
  `applyPlaceFilter`. Each filters its own list and updates a count
  badge.
- POST `/api/companies` / `/api/people` both check the OTHER file for
  key collisions to keep the namespace clean.
- The tooltip patch is the **only** place that uses `/api/companies`
  outside the people page, so changes to its shape need to be mirrored
  in both.

## Out of scope / nice-to-have

- Address autocomplete in the place picker (Nominatim search)
- Automatic migration of free-text `location` strings into places
- Roles / titles per person×company relation (currently just keys)
