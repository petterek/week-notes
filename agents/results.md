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
| POST | `/api/results` | Create free-form `{text, week?}` (defaults to current week) |
| PUT | `/api/results/:id` | Edit text |
| DELETE | `/api/results/:id` | Delete |

## Where it shows up

- `/results` — full list grouped by ISO week, sorted desc. Current week
  gets a "aktiv" pill.
- `/` (home) — per-week sidebar (`weekResults` block) shows results for
  that week.
- AI summary prompt — results are an explicit section in the LLM input.

## Code map

- `extractResults(noteText)` — strips brackets, returns
  `{results, cleanNote}`. Skips markdown links via `(?!\()` lookahead.
- `syncTaskNote(task, rawNote)` — on every task-note save, replaces all
  results that belong to `task.id` with the bracketed pieces.
- `loadResults` / `saveResults` — file IO at top of `server.js`.
- `/results` page handler (~line 3309).
- `POST /api/results` handler (~line 6107).

## Conventions

- Mentions are processed with `linkMentions(escapeHtml(text))` for both
  result text and the people pills.
- People pills on `/results` use `class="mention-link"` with
  `data-person-key` so the global tooltip script picks them up; href
  anchors to `/people#<key>`.
- IDs are generated server-side (timestamp + random) — clients should
  not invent them.
- All styling is in CSS classes (`.results-page`, `.result-card`,
  `.result-text`, …) using theme variables — no hardcoded colors.

## Gotchas

- Bracket extraction is greedy per `[...]` but won't chew across `]` —
  nested brackets aren't supported. Keep result text on one bracket.
- `r.taskText` is a snapshot; editing the task title later won't update
  existing results.
- When a task is deleted, its results are deleted too (see
  `saveResults(loadResults().filter(r => r.taskId !== body.srcId))`).
- Free-form results don't get re-synced when the user edits them — the
  `people` array is only computed on creation.
