# Feature: Tags (note tagging)

Notes can be tagged with one or more freeform tags (historically called
"themes" in the data model — `availableThemes`, `themes` array on note
meta). Tags enable filtering, grouping, and quick discovery of notes
across weeks.

---

## Storage

### Per-note tags

Stored in the note's sidecar metadata (see `agents/notes.md`):

```json
// data/<ctx>/.notes-meta/<week>/<file>.json
{ "tags": ["project-x", "standup"], ... }
```

Legacy field name `themes` is still accepted (read path normalizes).

### Available tags list

`settings.json` → `availableThemes: string[]` — normalized lowercase
tag names used for autocomplete suggestions. Grows automatically when
a new tag is first applied to any note.

### Inverted index (in-memory)

`_ensureTagIndex(bucket)` in `lib/core.js` builds a reverse index
`Map<lowerKey, { display, notes: Set<"week/file"> }>` from all note
sidecars. Rebuilt lazily on first access; invalidated on meta changes.

---

## Components

| Component | File | Purpose |
| --- | --- | --- |
| `<tag-editor>` | `components/tag-editor.js` | Chip input for adding/removing tags |
| `#tag` autocomplete | `domains/notes/note-editor.js` | Inline `#tag` in markdown text |

### `<tag-editor>`

- Renders existing tags as removable chips
- Input accepts typed tag names; `normalize()` strips leading `#` and
  lowercases
- Attribute: `value` — comma-separated initial tags
- Property: `.tags` — array getter/setter
- Events: `change` (bubbles) when tags are modified

### `#tag` autocomplete (in note-editor)

Trigger: typing `#word` in the markdown textarea.

Behavior:
1. Dropdown shows matching existing tags + "create new" option (hint: `ny`)
2. **Space** inside a `#tag` → inserts underscore (`_`) instead
3. **Double-space** (i.e. `#multi_word` + space when word ends with `_`)
   → commits the tag:
   - Strips trailing underscore
   - Adds tag to `<tag-editor>` (underscores preserved in tag name)
   - In textarea: removes `#`, replaces `_` with spaces
4. Selecting from dropdown via Enter/click also commits

Code locations in `note-editor.js`:
- `_loadThemeSuggestions()` (~line 992): populates `_availableThemes`
- `_installTagSpaceCommit()` (~line 1003): keydown handler for
  space→underscore and double-space→commit
- `tagTrigger` in `_installAutocompletes()` (~line 1314): detect,
  fetchItems, onSelect

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/notes/:ctx/tags` | All known tags for context (from index) |
| — | (via note save) | Tags are saved as part of note meta PUT |

Tags are also surfaced in search results and can be used as filter
criteria in the notes list.

---

## Conventions / gotchas

- **Naming confusion**: the data model uses "themes" (e.g.
  `availableThemes`, `m.themes`). The UI and user-facing language uses
  "tags" or "tema". Code should prefer "tags" in new work; maintain
  backward compat for reads (`m.tags || m.themes`).
- **`normalize()`** in `tag-editor.js` strips `#` prefix — so typing
  `#tagname` in the chip input stores `tagname`.
- **Autocomplete always shows dropdown** — even for a brand-new tag
  that doesn't match any existing ones (shows "ny" hint).
- **Space/underscore dance**: inside `#tag`, space inserts `_`;
  double-space commits. This does NOT interfere with `@mention`
  autocomplete — the keydown handler returns early if no `#` is found
  in the walk-back.
- **Tag index invalidation**: `setNoteMeta`, `deleteNoteMeta`, and
  `_cacheInvalidateNotesMeta` all drop the cached `_tagIndex`.
