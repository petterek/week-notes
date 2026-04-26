# Feature: Search & summarize

Two related cross-cutting features: full-text search across the
active context, and an AI-style week summary that writes back to the
week as `summarize.md`.

## Search

- Endpoint: `GET /api/search?q=<query>` → `[ {type, title, subtitle?,
  href, snippet}, ... ]`
- Backend helpers:
  - `searchSnippet(content, q, pad=60)` — extract a ±pad snippet
    around the first match.
  - `searchMdFiles(query)` — scans week notes, returns
    `{week, file, snippet}` (used internally by `searchAll`).
  - `searchAll(query)` — runs all sources and emits the unified
    shape used by the API.
- Sources covered:
  - **Notes** — filename + body, snippet ±60 chars
  - **Tasks** — `text`, `comment`, `notes` fields
  - **Meetings** — `title`, `location`, `notes`, `attendees`
  - **People** — `name`, `firstName`, `lastName`, `title`, `email`,
    `phone`, `notes`
  - **Results** — `text`
- The home page wires it to a debounced input. `weekList` hides while
  search is active; `searchResults` renders matches grouped by type
  with `<mark>` highlights.
- Scope: only the **active** context. Cross-context search is not
  implemented.
- No multi-term, quoted phrases, negation, or fuzzy matching — single
  case-insensitive substring across all sources.

### Result shape

```json
{
  "type": "note|task|meeting|person|result",
  "title": "headline",
  "subtitle": "secondary line (path/date/etc, optional)",
  "href": "where to navigate",
  "snippet": "…hit snippet…"
}
```

### Deep-links

| Type | href |
| --- | --- |
| note | `/<week>/<file>` |
| task | `/tasks` (no per-row anchor yet) |
| meeting | `/calendar/<week>#m-<id>` (calendar handles the hash) |
| person | `/people#<key>` (page does NOT scroll/highlight yet) |
| result | `/results` (no per-row anchor yet) |

When adding deep-link support to the destination pages, also update
the `href` builder in `searchAll` accordingly.

## Summarize

- Endpoint: `POST /api/summarize` body `{week}`.
- Backend helper: `summarizeWeek(week)` (~line 503). Concatenates
  every note in the week into a context, then prompts an LLM (or
  whichever backend is configured) and returns the result.
- The home week section has an `✨ Oppsummering` button that opens
  `#summaryModal`. The modal lets the user accept and save — saving
  writes the result to `summarize.md` in that week's folder.
- `saveSummary()` (~line 2345) handles the save.

## Code map

- Search: `searchSnippet`, `searchMdFiles`, `searchAll` near the top
  of `server.js`. The `/api/search` route (~line 3823). Home script
  search wiring (`searchInput`, `doSearch`).
- CSS: `.search-result`, `.sr-title`, `.sr-path`, `.sr-snippet`,
  `.sr-group`, `.sr-count`.
- Summarize: `summarizeWeek` + `/api/summarize` route +
  `#summaryModal` and `saveSummary()`.

## Conventions

- Result objects are unified (same keys regardless of source) so the
  frontend renderer can stay simple.
- Keep `searchAll` defensive — wrap each source in `try/catch` so a
  missing/bad JSON file in one area doesn't kill all results.
- The summary file is always named `summarize.md`. It's deliberately
  an "auto" filename so re-running overwrites cleanly.
- Search is case-insensitive substring with snippet extraction. Don't
  over-engineer it (no fuzzy matching, no ranking) — note volume is
  small.

## Gotchas

- `summarize.md` is excluded from the summarization input so we don't
  feed yesterday's summary back into today's prompt
  (`if (f === 'summarize.md') continue;` in `summarizeWeek`).
- Long outputs aren't paginated; they live in the modal scrollable
  area.
- When changing data shapes (e.g. adding a new field to tasks or
  meetings), decide whether it should be searchable and update the
  `haystacks` array in the relevant block of `searchAll`.

## Related

- `notes.md` — the markdown files being searched/summarized.
- `home.md` — search input + summary modal live there.
- `calendar.md` — `#m-<id>` deep-link handler.
- `people.md`, `tasks.md`, `results.md` — destination pages for the
  non-note result types.

