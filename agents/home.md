# Feature: Home page

The landing page (`/`) is a SPA fragment with a weekly notes list and a
sidebar containing tasks, upcoming meetings, goals and today's calendar.

## Layout

```
navbar + global-search
home-layout
  taskSidebar: open tasks, upcoming meetings, goals, today-calendar
  homeMain: week-list with notes, completed tasks and results
```

`.home-layout` is a flex container; sidebars are fixed-width, main
column scrolls. Below 900px width it stacks vertically.

`body:has(.home-layout) { max-width: none; overflow: hidden; }`
overrides the global 1100px constraint.

## Code map

- Route metadata: `lib/page-routes.js` (`/`, alias `/index.html`).
- Empty document shell: `routes/spa.js` via `lib/page-shell.js`;
  `public/app-shell.js` hydrates `pages/home.html` into `#content`.
- Sidebar components and week-list declare injected services in the
  fragment; `public/service-registry.js` installs the shared registry.
- Shared modals, summary actions, search-result navigation and entity
  callouts are wired in `public/app-shell.js`, not a home-only script.
- Home spacing and responsive styles live in `public/style.css`.

## Sidebar deep-links

- Upcoming-meeting cards provide calendar links to
  `/calendar/<week>#m-<id>` and separate meeting-note actions.
- Calendar handles the `#m-<id>` hash to scroll + pulse-highlight.

## Search

- The navbar's `<global-search>` uses the injected search service and
  `GET /api/search?q=...` to search the captured request context.
- `element-selected` is handled by the shared app shell: note results
  open `<note-view>`, while other entities navigate to their detail links.

## Conventions

- Don't add heavy logic to home — extract helpers if it grows.
- All escaping must use `escapeHtml` before insertion into HTML.
- Put component-specific behavior in domain components; reserve the
  shared app shell for cross-page events and navigation.

## Gotchas

- Register a new SPA route in `lib/page-routes.js`, not a second local
  route table in a browser component.
- Fragments are replaced during navigation. Wire cross-page handlers
  once in the shell and keep component cleanup in `disconnectedCallback`.
