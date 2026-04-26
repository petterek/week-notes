# Feature: Home page

The landing page (`/`) with weekly notes list + task sidebar +
upcoming-meetings sidebar.

## Layout

```
┌─────────────────────────────────────────────────┐
│ navbar (full width)                             │
├──────────┬─────────────────────────┬────────────┤
│ tasks    │ search bar              │ upcoming   │
│ sidebar  ├─────────────────────────┤ meetings   │
│ (open +  │ week list (most recent  │ sidebar    │
│ done)    │ first), each with:      │            │
│          │  - notes (links/types)  │            │
│          │  - tasks (open/done)    │            │
│          │  - results              │            │
└──────────┴─────────────────────────┴────────────┘
```

`.home-layout` is a flex container; sidebars are fixed-width, main
column scrolls. Below 900px width it stacks vertically.

`body:has(.home-layout) { max-width: none; overflow: hidden; }`
overrides the global 1100px constraint.

## Code map

- Route: `if (pathname === '/' || pathname === '/index.html')`
  (~line 1869) — the biggest single render block.
- Sidebar augmentation: `sidebar.replace('</aside>', ...)` (~line 1898)
  — appends "Kommende møter" cards.
- Modals: `#summaryModal` (week summary), `#noteViewModal` (read-only
  note view), `#commentModal` (task completion comment).
- Search wiring: `searchInput`, `searchResults`, `weekList` IDs.
  Debounced fetch to `/api/search`.

## Sidebar deep-links

- Each `.sidebar-meeting` card has `data-cal-href="/calendar/<week>#m-<id>"`.
- A document-level click handler navigates to that href when the
  card is clicked, except when the click is on a child `<a>` or
  `<button>` (e.g. the 📝 note shortcut).
- Calendar handles the `#m-<id>` hash to scroll + pulse-highlight.

## Search

- `GET /api/search?q=...` returns matches grouped by week.
- `highlightSnippet()` wraps matches in `<mark>` (regex-escapes the
  query).
- When search is non-empty, `weekList` hides and `searchResults`
  shows.

## Conventions

- Don't add heavy logic to home — extract helpers if it grows.
- All escaping must use `escapeHtml` before insertion into HTML.
- The home script is large and loads other scripts (mention
  autocomplete) — make sure new code is added inside an existing
  `<script>` block or a new IIFE so we don't pollute globals.

## Gotchas

- `pendingToggleEl` is a module-scoped global used for task comment
  flow.
- The clock in the navbar is its own `(function tick(){...})()` —
  not on home specifically, lives in the global body script.
