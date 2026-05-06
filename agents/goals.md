# Feature: Goals (Mål)

Long-term per-context objectives. Tasks and results can be linked to a goal
so the goal page can show rolled-up progress.

## Storage

- File: `data/<ctx>/goals.json`
- Shape (array):
  ```
  {
    id,            // 'g' + base36 timestamp + random
    title,
    description,   // markdown
    status,        // 'active' | 'achieved' | 'abandoned'
    targetDate?,   // 'YYYY-MM-DD'
    created,       // ISO timestamp
    updated,       // ISO timestamp or null
    achievedAt?    // ISO timestamp, set when status flips to 'achieved'
  }
  ```

Helpers in `lib/core.js`:
- `loadGoals(ctxId)` / `saveGoals(ctxId, list)`

## Routes

`routes/api/goals.js` (registered in `server.js` after results):

| Method | Path                | Behaviour                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/goals`        | List all goals for active context                                         |
| POST   | `/api/goals`        | Create. Body: `{title, description?, targetDate?, status?}`               |
| PUT    | `/api/goals/:id`    | Patch. Sets `achievedAt` automatically when status becomes `achieved`.    |
| DELETE | `/api/goals/:id`    | Remove + cascade-unlink dangling `goalId` from tasks & results.           |

Validation: status whitelist (`active|achieved|abandoned`), targetDate must
match `YYYY-MM-DD` or be omitted/null.

## Linking from tasks/results

Both `routes/api/tasks.js` and `routes/api/results.js` accept `goalId` on
POST and PUT. Empty string clears the link; missing field leaves it.

When a goal is deleted, its DELETE handler walks `tasks.json` and
`results.json` and removes any matching `goalId` so we never leave dangling
references.

## Frontend

- `domains/goals/service.js` — `GoalsService` client. Registered as
  `goals_service` in the `<script type="module">` block in `lib/core.js`.
- `domains/goals/goals-page.js` — `<goals-page>` full-page component.
  Mounted at `/goals` (SPA stub in `routes/spa.js`).
  - Groups goals by status: Aktive / Oppnådd / Avbrutt
  - Each card shows title, target date (if any), description (markdown
    via `<markdown-preview>`), progress bar from linked tasks, count of
    linked results, and a "cycle status" button (active → achieved →
    abandoned → active).
  - Modal for create/edit with title, description (textarea), target
    date (`<date-time-picker>` in date mode via `<wn-date-trigger>`),
    status select.
- `domains/goals/active-goals.js` — `<active-goals>` sidebar widget for
  home, listing only `status === 'active'` goals with progress bars.
  Click → `/goals#g-<id>`.
- `domains/tasks/task-edit-modal.js` — adds a `Mål` `<select>` so a task
  can pick a goal; sends `goalId` on save.
- `domains/results/results-page.js` — modal renders a goal `<select>`
  similarly for results.
- Nav entry: 🏆 Mål in `lib/core.js` `navbarHtml` + `navLinksHtml` +
  shortcut bar (`Alt+M`).

## Conventions / gotchas

- The `html` tagged template in `components/_shared.js` **auto-escapes**
  interpolated values. **Don't** call `escapeHtml(...)` inside `${...}` —
  that double-encodes. Use `unsafeHTML(rawHtmlString)` to opt out.
- **Attribute interpolations need explicit quotes**: `title="${value}"`,
  `data-id="${id}"`. Without quotes, multi-word values break HTML
  parsing.
- Progress bar denominator is **only tasks** (counts of `done` vs total
  tasks where `task.goalId === goal.id`). Results count is shown
  separately as informational, not as part of the progress percentage.
- Status cycle order is fixed: active → achieved → abandoned → active.
  When transitioning *to* `achieved`, server stamps `achievedAt`. We
  don't clear it when leaving `achieved` (kept as a historical note).

## Adding a field

1. Validate it in POST/PUT handlers in `routes/api/goals.js`.
2. Render it in the modal in `domains/goals/goals-page.js`
   (`_renderModal`).
3. Include it in the patch body in `_save`.
4. Display it in `_renderCard` if user-facing.
5. If it should also appear in the active-goals widget, render it in
   `domains/goals/active-goals.js` `_render()`.
