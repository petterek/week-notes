# Feature: Search & summarize

Two related cross-cutting features: full-text search across the
active context, and an AI-style week summary that writes back to the
week as `summarize.md`.

## Search

- Endpoint: `GET /api/search?q=<query>`
- Backend helper: `searchMdFiles(query)` (~line 472).
- Scans the active context's week folders, returns matches grouped by
  week with file + snippet.
- Home page wires it to a debounced input. `weekList` hides while
  search is active; `searchResults` renders matches with `<mark>`
  highlights.

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

- Search: `searchMdFiles` + the `/api/search` route + the home script
  search wiring.
- Summarize: `summarizeWeek` + the `/api/summarize` route + the home
  modal `#summaryModal` and `saveSummary()`.

## Conventions

- The summary file is always named `summarize.md`. It's deliberately
  an "auto" filename so re-running overwrites cleanly.
- Search is case-insensitive substring with snippet extraction. Don't
  over-engineer it (no fuzzy matching, no ranking) — note volume is
  small.

## Gotchas

- `summarize.md` is excluded from the summarization input so we don't
  feed yesterday's summary back into today's prompt
  (`if (f === 'summarize.md') continue;` in `summarizeWeek`).
- The summary modal also pulls in the rendered preview, which uses
  the same `marked` instance as everywhere else.
- Long outputs aren't paginated; they live in the modal scrollable
  area.

## Related

- `notes.md` — the markdown files being searched/summarized.
- `home.md` — search input + summary modal live there.
