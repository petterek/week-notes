# Feature: In-app help

Norwegian end-user guide rendered as a modal from the navbar.

## Files & routes

- Source: `/home/p/migration/weeks/help.md` (Norwegian markdown).
- Served raw at: `GET /help.md` with `Content-Type: text/markdown`.
- Rendered client-side in `#helpModal` using the global `marked`
  library (already loaded for note rendering).

## UI

- Trigger: `❓ Hjelp` link in the navbar (`#helpBtn`).
- Modal: `#helpModal` injected into every page's `<body>`.
- Opens on click; loads `/help.md` once and caches in-memory.
- Closes on `Esc` or outside-click.

## Code map

- The modal HTML and the script that wires it are inline in the body
  template (~line 836-849, search for `helpModal`).
- The `/help.md` route handler is near `~line 1857`.

## Conventions

- `help.md` is the **end-user** guide. Keep it in Norwegian to match
  the rest of the UI.
- For **agent docs**, edit `AGENTS.md` and `agents/*.md` — never put
  agent-only info into `help.md`.
- When adding a new feature, add a section to `help.md` if it's
  user-facing (sections currently: Oversikt, Kontekster,
  Hurtigtaster, Hjem, Oppgaver, Møter, Personer, Notater, Kalender,
  Innstillinger, Git og backup, Snarveier i notater).

## Gotchas

- `marked` is loaded from CDN — if offline, the help modal falls back
  to a `<pre>` block with the raw markdown.
- Don't use feature names that diverge from the UI labels (the help
  is the canonical name source).
