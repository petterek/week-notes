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
- The note editor uses `feature-rich-text-area.js` for raw Markdown input
  (smart list continuation/indentation, `::` searchable emoji picker — curated
  groups + "Nylig brukt" (localStorage), ranked search over `/emoji-catalog.json`
  (emojilib, same map as the renderer) plus Norwegian keywords — with
  fzf-style scoring in `emoji-search.js` (names/keywords split into words on
  `_`, `-` and spaces; each query word must match within one word; boundary
  and consecutive bonuses, gap penalties, one-typo tolerance) and
  shortcode insertion such as `:grinning:`, task autocomplete, Ctrl+D
  date/date-time and Ctrl+M meeting shortcuts) and
  `feature-rich-markdown.js` for the live preview. The rich editor owns
  these input behaviors, shows a shortcut help line, and emits the
  bubbling/composed `feature-rich-text-area:input` event with `{ value }`
  for host-to-preview synchronization. Shared note-marker and
  mention transformations are in `markdown-features.js`; the companion
  components also have standalone `/debug/` demos.
- The note editor's `{{?` / `{{!` autocomplete loads open tasks through
  its `tasks_service` and inserts task IDs using the same marker syntax
  consumed by the live renderer.
- `@mention` autocomplete in the note editor is owned by
  `feature-rich-text-area` (shares its popover with task autocomplete).
  The rich editor, `feature-rich-markdown` and `note-editor` load
  people/companies/teams only from injected `people_service`,
  `companies_service` and `teams_service` (`createMentionSource({
  servicesOnly: true })`) — never direct `/api/*` fetches. Hosts must pass
  those attributes; `pages/editor.html` uses `week-note-services.*` and
  debug demos use `Mock*Service` (incl. `MockTeamsService`).
- `<feature-rich-text-area>` is also the app-wide replacement for plain
  `<textarea>`s (except settings). Field API: `name` (form-associated:
  `FormData`, `form.reset()`), `value`, `placeholder`, `rows` (content-sized,
  vertically resizable; without `rows` it fills its container, as in the note
  editor), `readonly`, `disabled`, `aria-label`, and `features` — comma list of
  `lists, indent, emoji, mentions, tasks, results, dates, meetings, help`
  (absent = all; `results` = `[[?` autocomplete via `results_service`).
  Forms/modals must omit `indent` so Tab still moves focus. `focus()`,
  `selectionStart/End`, `setSelectionRange()` delegate to the inner textarea;
  `change` is re-dispatched on the host. Host-specific autocomplete triggers go
  in `el.triggers = [...]` (re-attached after internal re-renders) — never
  attach to `el.textarea` directly. A trigger's optional `help` string is
  appended to the help line; `note-editor` passes `#` tag and `{{m:?` meeting
  triggers this way (meetings via `meetings_service`).
- Inline create markers are converted by the editor, not the server:
  `await el.convert({ week, noteRef, taskId, taskText, replaceWith })`
  creates entities through the injected services, gated by `features` —
  `tasks` `{{X}}`, `results` `[[X]]`/`[[X+]]`/`[[X-]]` (people = note ∪ text
  mentions), `meetings` `{{m:Title @ YYYY-MM-DD HH:MM[ Nm]}}`. Markers are
  replaced one at a time (`replaceWith: 'ref'` → `{{?id}}`/`[[?id]]`/
  `{{m:?id}}`, `'text'` → plain text), so a failure keeps earlier ones
  converted. `note-editor` awaits it before an explicit save (not autosave)
  and aborts the save on error. `/api/save` only applies `{{!id}}` and
  `~~text~~` close markers.
- Displays of those fields use `domains/_shared/wn-rich-text.js`
  (`renderRichText(text, { people, companies, teams, taskTextById, inline })`
  + `RICH_TEXT_CSS`): Markdown, `:emoji:`, @mentions and `{{?task}}` markers,
  with raw HTML in the source escaped. Link/image URLs outside
  http(s)/mailto/tel/relative are replaced with `#` by
  `domains/_shared/wn-safe-urls.js` (`sanitizeHtmlUrls`); the server's
  minutes export (`renderUserMarkdown` in `lib/core.js`) requires the same
  module. `domains/_shared/package.json` marks that folder as ESM so Node can
  `require()` it — keep `wn-safe-urls.js` free of imports.
- Mention autocomplete (legacy pages): `public/mention-autocomplete.js`. Init via
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
