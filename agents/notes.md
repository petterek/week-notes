# Feature: Weekly notes

Freeform markdown notes, one folder per ISO week.

## Storage

- Path: `data/<ctx>/YYYY-WNN/<filename>.md`
- Filename convention: kebab-case, no spaces. The route uses `[^/]+\.md`.
- Per-note metadata (pin, type, icon, tags) lives in
  `data/<ctx>/notes-meta/<week>/<filename>.md.json`. The legacy
  `notes-meta.json` map is keyed by `YYYY-WNN/filename.md`.
- Metadata reads are strict now: corrupt JSON throws instead of hiding
  behind cache, deep clones isolate nested state, and per-note sidecars
  override matching legacy `notes-meta.json` entries without masking
  unrelated legacy keys.

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

- Storage helpers: `loadNotesMeta`, `saveNotesMeta`, `getMdFiles` in
  `lib/core.js`, using strict/atomic primitives in `lib/collection-store.js`.
- APIs: `routes/api/notes.js` and note-save handlers in `routes/api/misc.js`.
- Editor component: `domains/notes/note-editor.js`, mounted by
  `pages/editor.html`. `/editor` is a shared-manifest SPA shell;
  existing-note path guards and filename titles remain in `routes/pages.js`.
- Mention autocomplete: `public/mention-autocomplete.js`. Init via
  `initMentionAutocomplete(el)` on every editable input/textarea.
- Shared preview internals: `domains/_shared/wn-markdown-preview.js`
  owns the canonical markdown preview CSS + detached document setup;
  `domains/_shared/wn-mention-source.js` owns the reusable
  person/company/team mention source and trigger used by the editor
  plus task note/completion modals.
- Shared mention sources prefer injected services, cache successful loads
  only, and reject failed loads so they can be retried. `@me` is resolved
  when suggestions are built; task modals reset the source with new task data.
- Detached previews receive the service registry directly before loading
  their component modules; failed scripts surface an error and reattach
  instead of leaving an apparently successful but inert preview.

## Conventions

- Always `escapeHtml` user-controlled content.
- Mentions render as `<entity-mention>` elements; legacy `.mention-link`
  anchors are also supported. `public/app-shell.js` bridges hover and
  selection events to the shared `<entity-callout>`.
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
- `note-editor` now shares its detached preview setup with
  `wn-markdown-preview.js`; if you touch PiP markup, keep the shared
  module and the shadow preview in sync. Its Ctrl+M popover also keeps
  a timeout + document `mousedown` listener; disconnect must clear both
  so removing the editor mid-open does not leave a floating popup.
- Saves now wait for metadata/backrefs/mentions persistence before
  reporting success, and recovery-file cleanup happens after that path
  completes. `getNoteMeta(week, file, { fresh: true })` is the write
  preflight when you need the latest on-disk state.
- Context switches no longer drop autosaves; only the legacy startup
  cleanup path still removes stale autosave files.

## Related

- `tasks.md` — tasks live alongside notes per week.
- `people.md` — `@mentions` syncing.
- `presentations.md` — slide rendering.
- `home.md` — week list rendering.
