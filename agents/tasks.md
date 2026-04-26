# Feature: Tasks

Per-week task list with comments, drag-reorder, merge, completion log.

## Storage

- File: `data/<ctx>/tasks.json`
- Shape (array): `{ id, text, week, done, completedWeek?, comment?,
  due?, order?, notes? }`
- `completedWeek` is set on the toggle that marks `done=true`. It
  preserves which week the task was closed in (different from the
  week it was created in).

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
