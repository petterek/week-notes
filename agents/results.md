# Feature: Results

Per-week outcome / result log. Lightweight — primarily an annotation
mechanism for "what came of this week".

## Storage

- File: `data/<ctx>/results.json`
- Shape (array): `{ id, week, text, createdAt }`

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/results` | Full results page |
| GET | `/api/results` | List (sorted by week desc) |
| POST | `/api/results` | Create `{week, text}` |
| PUT | `/api/results/:id` | Edit |
| DELETE | `/api/results/:id` | Delete |

## Where it shows up

- `/results` page lists all entries grouped by week.
- Home page: per-week section may include result entries inline.

## Code map

- Backend: `loadResults` / `saveResults` near the top of `server.js`.
- Page route (~line 2390).
- Edit handler: `saveEditResult()` (~line 2464).

## Conventions

- Mentions are processed via `linkMentions(escapeHtml(text))` before
  rendering.
- IDs are generated server-side (timestamp + random) — clients should
  not invent them.

## Gotchas

- Small feature; tends to be forgotten when other features change
  rendering paths. When changing how week sections render on home,
  double-check the results block still appears.
