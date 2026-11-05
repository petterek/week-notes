# Feature: Tasks

Per-week task list with comments, drag-reorder, merge, completion log.

## Storage

- Files: `CONTEXTS_DIR/<ctx>/tasks/<id>.json` (legacy `tasks.json`
  arrays remain readable until the directory exists).
- Record shape: `{ id, text, week, done, completedWeek?, comment?,
  due?, dueDate?, order?, notes?, responsible?, participants?, goalId?,
  meetingSeriesId?, meetingId?, agendaItemId?, author? }`
- `completedWeek` is set on the toggle that marks `done=true`. It
  preserves which week the task was closed in (different from the
  week it was created in).
- `participants` is an array of person keys. Auto-populated from all
  `@mentions` in the text on create; can also be set/modified manually
  via the API (`PUT /api/tasks/:id` with `participants: [...]`).
  Set to `null` to clear.
- `meetingSeriesId` / `meetingId` / `agendaItemId` link a follow-up
  task back to a meeting series occurrence — set via POST/PUT exactly
  like `goalId` (accepted in both handlers, no extra validation).
  Set by `<task-create>`'s `meeting-series-id` / `meeting-id` /
  `agenda-item-id` attributes. See `agents/meetings.md`.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tasks` | Full tasks page |
| GET | `/api/tasks` | List |
| POST | `/api/tasks` | Create `{text, week}` |
| PUT | `/api/tasks/:id` | Edit fields |
| PUT | `/api/tasks/:id/toggle` | Toggle done; body may include `comment` |
| POST | `/api/tasks/:id/close-from-note` | Set completion and update the source note marker |
| POST | `/api/tasks/merge` | Body `{srcId, tgtId}` |
| POST | `/api/tasks/reorder` | Body `{ids:[id,id,...]}` |
| DELETE | `/api/tasks/:id` | Delete |

## Where it shows up

- **Home page left sidebar**: open tasks (sortable). Completed tasks
  shown with the week they were closed in.
- **Per-week sections** on home: tasks for that week, with `+` add
  button.
- **`/tasks` page**: full management UI, drag-reorder.

## Code map

- Backend helpers: `loadTasks`, `loadAllTasks`, `saveTasks` in `lib/core.js`;
  strict per-item storage in `lib/collection-store.js`.
- `/tasks` SPA stub: `routes/spa.js`; browser UI: `domains/tasks/`.
- API handlers: `routes/api/tasks.js`.
- Body handling: `await readJsonBody(req)` before loading mutable task
  snapshots. Malformed JSON must return 400 without toggling/completing
  a task; empty bodies remain valid for toggling.

## Conventions

- Tasks render with `data-taskid` and `data-tasktext` attributes —
  the inline JS reads these to drive toggle/comment/edit modals.
- Task notes (`task-note`, `task-note-modal`, `task-create-full`) use
  `<feature-rich-text-area features="lists,emoji,mentions,tasks,dates">`
  with explicit rows (6, 6, 3). Completion comments use rows 4 and
  `features="lists,emoji,mentions,dates"`. No form editor enables Tab
  indentation; Ctrl/Cmd+Enter still saves/confirms and Escape cancels.
- Editors forward injected people/companies/teams/tasks services, falling
  back to `week-note-services.*_service`; mention/date autocomplete belongs
  to the editor, not its host. The task-title input remains single-line
  with its original autocomplete. Modal focus belongs in `afterRender`,
  not deferred timers that can overwrite text typed immediately after open.
- Notes and comments in task detail views, completion-note files in
  `task-view`, and expanded open-list notes render via `renderRichText`
  with `RICH_TEXT_CSS`: Markdown, emoji, mentions and task markers share
  the note renderer; user-written HTML is shown literally.
- Completion API comments are persisted as `commentFile` Markdown notes
  (legacy inline `comment` remains displayable). Keep passing the raw
  comment to `service.toggle(id, comment)`.
- `{{X}}`/`[[X]]` in task notes and `[[X]]` in completion comments are
  converted by the rich editor's `convert()` before the host saves (see
  `agents/notes.md`); the server no longer parses them. `POST /api/tasks`
  accepts `noteRef` and returns the full list with the new task last.
- The create endpoint does not persist `note`; `task-create-full` follows
  successful creation with `service.update(id, { note })` when needed,
  before reporting `task:created`. Server API shapes stay unchanged.
- `pendingToggleEl` is a global in the home script used by the
  comment modal flow.
- When adding a new field, update both the home renderer (left
  sidebar + week sections) and the `/tasks` page renderer.
- `<tasks-page embedded meeting-series-id="…">` is also the series
  follow-up task UI. `setData({ tasks, people, companies, taskOrder })`
  supplies host data without fetching it again. Create is automatically
  linked to the series; all other task actions are shared with `/tasks`.
  Successful mutations emit `tasks:changed` with the full visible task
  collection for the host cache. The series filter is applied only when
  rendering, so unrelated tasks are preserved.
- Series task drag handles and ArrowUp/ArrowDown save the complete open
  series-task permutation through `meetings_service.reorderSeriesTasks`.
  `tasks:reordered` carries the updated series; its optional `taskOrder`
  does not alter global task order. Completed tasks are not reorderable.

## Gotchas

- `loadTasks()` omits tombstones; `loadAllTasks()` preserves them.
  `saveTasks()` replaces a collection, not just visible records. Use a
  complete snapshot for mutations that must preserve deleted references;
  do not treat a filtered UI list as authoritative storage.
- `data-tasktext` is escaped at render — when the user re-edits,
  unescape via `el.dataset.tasktext` (browser already decodes).
- `order` is lazy: only set after first reorder. Sort fallback is
  creation order.
- Merge collapses N tasks into one and deletes the others — be
  careful with comment/note loss.
- **Modal z-index stacking:** Task modals (complete, edit, note) use
  the `modalZ` system from `components/_shared.js`. Each modal calls
  `modalZ.next()` **after** `setAttribute('open', '')` (which triggers
  re-render via `attributeChangedCallback → requestRender()`). Setting
  `bd.style.zIndex` before setAttribute is a bug — the re-render wipes
  the inline style. Always: setAttribute first, then query the fresh
  `.backdrop` element and set z-index.

## Rich-text regression coverage

`tests/playwright/rich-text-tasks.spec.js` covers all four task editors,
real create/update/toggle persistence (including completion-note files),
Ctrl+Enter and list continuation, rich note/comment displays and HTML
escaping. Existing task modal scenarios query the nested editor's shadow
root for autocomplete and dispatch `input` after programmatic changes to
its inner textarea.
