# Feature: Weekly notes

Freeform markdown notes, one folder per ISO week.

## Storage

- Path: `data/<ctx>/YYYY-WNN/<filename>.md`
- Filename convention: kebab-case, no spaces. The route uses `[^/]+\.md`.
- Per-note metadata (pin, type, icon, tags) lives in
  `data/<ctx>/notes-meta.json` (key = `YYYY-WNN/filename.md`).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/note/:week/:file.md` | Rendered view |
| GET | `/editor/:week/:file.md` | Full-page editor (split pane, autosave) |
| GET | `/present/:week/:file.md?style=...` | Reveal.js presentation (see `presentations.md`) |
| POST | `/api/save` | Save body `{week, file, content}` |
| GET | `/api/notes/:ctx/:file/render` | Server-side rendered HTML |
| PUT | `/api/notes/:ctx/:file/meta` | Save metadata (pin/type/icon/tags) |
| PUT | `/api/notes/:ctx/:file/pin` | Toggle pin shortcut |
| DELETE | `/api/notes/:ctx/:file` | Delete note |

## Code map

- Backend: search for `loadNotesMeta`, `saveNotesMeta`, `getMdFiles` in
  `server.js`.
- Editor page: route `/editor` (~line 3750) — big inline `<script>`
  with `render()`, `save(autosave)`, `saveAndClose()`.
- Mention autocomplete: `public/mention-autocomplete.js`. Init via
  `initMentionAutocomplete(el)` on every editable input/textarea.

## Conventions

- Always `escapeHtml` user-controlled content.
- Mentions: server renders `@name` → `<a class="mention-link"
  data-person-key="...">@name</a>`. The global `personTip` script in
  the body renders hover cards.
- After saving a note, call `syncMentions(content)` to auto-create
  people entries (skipped for tombstoned names).
- Filenames: pass through `safeName` before touching disk.
- Newline trap inside template-literal-rendered JS: use `\\n`.

## Gotchas

- `noteViewModal` and `editor` are different code paths. The render
  endpoint is shared via `/api/notes/:ctx/:file/render`.
- Pinned notes appear at top of the week list on home — make sure new
  metadata fields don't break the sort.
- `notes-meta.json` is keyed by `week/file`, not just `file`. Renaming
  a note requires updating that key.

## Related

- `tasks.md` — tasks live alongside notes per week.
- `people.md` — `@mentions` syncing.
- `presentations.md` — slide rendering.
- `home.md` — week list rendering.
