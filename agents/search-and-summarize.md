# Feature: Search & summarize

Two related cross-cutting features: full-text search across the
active context, and an AI-style week summary that writes back to the
week as `summarize.md`.

## Search

- Endpoint: `GET /api/search?q=<query>` → `[ {type, title, subtitle?,
  href, snippet}, ... ]`
- A dedicated **`worker_threads`** worker (`search-worker.js`) holds
  the index in memory. The main process talks to it via `postMessage`
  and a `requestId`-keyed pending-promise map.
- Worker protocol:
  - `{type:'reindex', contextDir}` → worker walks the dir and
    rebuilds the index, replies `{type:'indexed', docCount,
    tokenCount, ms, trigger}`.
  - `{type:'query', q, requestId}` → worker returns
    `{type:'result', requestId, results, ms}`.
- Index data structures (in the worker):
  - `docs[]` — array of `{type, title, subtitle, href, body,
    searchText}`.
  - `invertedIndex: Map<token, Set<docIdx>>` — tokens are lowercase
    words (Unicode `\p{L}\p{N}_`+) of length ≥ 2.
- Query strategy:
  - Tokenize the query the same way; if every token exists in the
    index, intersect the postings (smallest-first) and verify
    substring on the candidates.
  - If any token is missing, fall back to a full scan so partial-word
    substring queries still match.
- Backend helpers in `server.js` (kept as an in-process fallback if
  the worker dies):
  - `searchSnippet`, `searchMdFiles`, `searchAll`.
- Re-indexing:
  - Once on server startup (after `server.listen`).
  - After every successful context switch. The
    `/api/contexts/switch` handler responds immediately and runs
    `pullContextRemote` + `reindexSearch()` from a `setImmediate`
    callback so the user sees a fast switch even on contexts with
    a slow git remote.
  - Automatically when the worker's `fs.watch(contextDir,
    {recursive:true})` sees a relevant file change. Debounced 200 ms.
    Watched: `**/*.md` (week notes) and the four context-level
    `tasks.json` / `meetings.json` / `people.json` /
    `results.json` files. `.git/`, dotfiles, swap/tmp files are
    ignored.
- Sources covered (mirrors `searchAll`):
  - **Notes** — filename + body
  - **Tasks** — `text`, `comment`, `notes`
  - **Meetings** — `title`, `location`, `notes`, `attendees`
  - **People** — `name`, `firstName`, `lastName`, `title`, `email`,
    `phone`, `notes` (tombstones skipped)
  - **Results** — `text`
- Scope: the **active** context only.
- Limits: query timeout in `searchViaWorker` is 5 s; if the worker is
  unavailable we fall back to `searchAll` synchronously.

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

- Search worker: `search-worker.js` (top-level file, separate from
  `server.js`).
- Worker glue in `server.js`: `startSearchWorker`, `reindexSearch`,
  `searchViaWorker`, `pendingSearches` map. Startup hook is in the
  `server.listen` callback. `setActiveContext` reindex call is in
  the `/api/contexts/switch` handler.
- In-process fallback search: `searchSnippet`, `searchMdFiles`,
  `searchAll` near the top of `server.js`. The `/api/search` route
  uses the worker first and falls back to `searchAll` only if both
  the worker call and its retry fail.
- Home script search wiring (`searchInput`, `doSearch`).
- CSS: `.search-result`, `.sr-title`, `.sr-path`, `.sr-snippet`,
  `.sr-group`, `.sr-count`.
- Summarize: `summarizeWeek` + `/api/summarize` route +
  `#summaryModal` and `saveSummary()`.

## Conventions

- Keep `searchAll` (the in-process implementation) functionally in
  sync with the worker's `buildIndex`. They produce the same
  result shape and cover the same sources, so adding a new
  searchable field means updating both.
- Result objects are unified (same keys regardless of source) so the
  frontend renderer can stay simple.
- Keep `searchAll` and `buildIndex` defensive — wrap each source in
  `try/catch` so a missing/bad JSON file in one area doesn't kill
  all results.
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
  meetings), decide whether it should be searchable and update both
  the in-process `searchAll` block **and** the worker's
  `buildIndex` block.
- The worker's `fs.watch(..., {recursive:true})` requires Node ≥ 20
  on Linux. Earlier versions silently ignore `recursive`. The
  worker also doesn't watch directories that didn't exist at index
  time — adding a brand-new week dir during the same session may
  not auto-trigger if the watcher is bound only to the parent.
  Re-indexing on context switch covers most real cases; otherwise a
  page reload that triggers any indexed file write will pick up new
  files.
- The worker holds the entire searchable corpus in memory. That's
  fine for one user with thousands of items but not for unbounded
  growth.

## Related

- `notes.md` — the markdown files being searched/summarized.
- `home.md` — search input + summary modal live there.
- `calendar.md` — `#m-<id>` deep-link handler.
- `people.md`, `tasks.md`, `results.md` — destination pages for the
  non-note result types.

