# Feature: Tasks

Per-week task list with comments, drag-reorder, merge, completion log.

## Storage

- File: `data/<ctx>/tasks.json`
- Shape (array): `{ id, text, week, done, completedWeek?, comment?,
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
| POST | `/api/tasks/merge` | Body `{ids:[...], targetText}` |
| POST | `/api/tasks/reorder` | Body `{order:[id,id,...]}` |
| DELETE | `/api/tasks/:id` | Delete |

## Where it shows up

- **Home page left sidebar**: open tasks (sortable). Completed tasks
  shown with the week they were closed in.
- **Per-week sections** on home: tasks for that week, with `+` add
  button.
- **`/tasks` page**: full management UI, drag-reorder.

## Code map

- Backend helpers: `loadTasks` / `saveTasks` near the top of
  `server.js`.
- `/tasks` route (~line 3918) renders the page; `renderTasks()` in
  the inline script builds the list.
- API handlers: `/api/tasks*` blocks (~lines 4238-4790).

## Conventions

- Tasks render with `data-taskid` and `data-tasktext` attributes —
  the inline JS reads these to drive toggle/comment/edit modals.
- `comment` is shown as a small italic line under the completed task.
- `pendingToggleEl` is a global in the home script used by the
  comment modal flow.
- When adding a new field, update both the home renderer (left
  sidebar + week sections) and the `/tasks` page renderer.

## Gotchas

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
