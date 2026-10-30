# Feature: Results

Per-week outcome / result log. Two creation paths:

1. **Bracketed text in a task note** — `[anything]` inside a task's note
   becomes a result attached to that task. Brackets are stripped from the
   stored note. Markdown links (`[text](url)`) are skipped — the
   extractor uses a negative-lookahead for `(`.
2. **Free-form** — `POST /api/results` with `{text, week}`, or click
   "➕ Nytt resultat" on `/results`. Not tied to a task (`taskId`
   omitted). `@mentions` in the text are extracted into `people`.

## Storage

- File: `data/<ctx>/results.json`
- Shape (array):
  ```
  {
    id,           // server-generated
    week,         // ISO week, e.g. "2026-W17"
    text,
    people,       // string[] of person keys/handles from @mentions
    sentiment?,   // "good" | "bad" — absent means neutral (default)
    goalId?,      // links result to a goal
    taskId?,      // present only for results created from a task note
    taskText?,    // snapshot of the task title at creation time
    created       // ISO timestamp
  }
  ```

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/results` | Full results page (grouped by week, current week marked "aktiv") |
| GET | `/api/results[?week=YYYY-WNN]` | List, optional week filter |
| POST | `/api/results` | Create free-form `{text, week?, goalId?, sentiment?}` (defaults to current week) |
| PUT | `/api/results/:id` | Edit `{text?, goalId?, sentiment?}` — sentiment `"neutral"` or `""` removes field |
| DELETE | `/api/results/:id` | Delete |

## Where it shows up

- `/results` — full list grouped by ISO week, sorted desc. Current week
  gets a "aktiv" pill. Result text uses a rows=3
  `<feature-rich-text-area features="emoji,mentions">` and displays inline
  Markdown through `renderRichText` (raw HTML is escaped).
- `/` (home) — per-week sidebar (`weekResults` block) shows results for
  that week, rendered as inline Markdown through `renderRichText`.
- AI summary prompt — results are an explicit section in the LLM input.

## Code map

- `[[X]]` markers are converted in the browser by
  `<feature-rich-text-area>.convert()` (`results` feature) via
  `results_service.create({ text, week, sentiment, people, taskId, taskText })`.
  Notes get `[[?<id>]]`; task notes (`replaceWith: 'text'`) keep the plain
  text and link the result with `taskId`; completion comments keep
  `[[?<id>]]`. **Sentiment suffix**: `[[text+]]` → good, `[[text-]]` → bad,
  stripped from the stored text.
- `POST /api/results` accepts `taskId`, `taskText` and a `people` array
  (merged with mentions in the text).
- `syncTaskNote(task, rawNote)` only stores the note and syncs mentions; it
  no longer regenerates task-linked results.
- `loadResults` / `saveResults` — file IO at top of `server.js`.
- `/results` page handler (~line 3309).
- `POST /api/results` handler (~line 6107).

## Conventions

- Result text is rich Markdown rendered with `renderRichText` in the
  results page and weekly sidebar. Mention lists come from injected
  people/companies/teams services; raw HTML remains escaped.
- People pills on `/results` retain linked-mention rendering with
  `class="mention-link"` and `data-person-key` for global tooltips; href
  anchors point to `/people#<key>`.
- IDs are generated server-side (timestamp + random) — clients should
  not invent them.
- All styling is in CSS classes (`.results-page`, `.result-card`,
  `.result-text`, …) using theme variables — no hardcoded colors.
- **Sentiment convention**: only `"good"` or `"bad"` stored; neutral is
  absence of the field. On PUT, sending `"neutral"` or `""` deletes it.
- Cards show sentiment via left border (green=good, red=bad) and emoji
  prefix (🟢/🔴). The create/edit modal includes a 3-button picker
  (Bra / Nøytral / Dårlig).

## Gotchas

- Bracket extraction is greedy per `[...]` but won't chew across `]` —
  nested brackets aren't supported. Keep result text on one bracket.
- `r.taskText` is a snapshot; editing the task title later won't update
  existing results.
- When a task is deleted, its results are deleted too (see
  `saveResults(loadResults().filter(r => r.taskId !== body.srcId))`).
- Free-form results don't get re-synced when the user edits them — the
  `people` array is only computed on creation.
