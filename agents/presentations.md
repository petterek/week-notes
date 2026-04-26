# Feature: Presentations (slides)

Render any note as a reveal.js slide deck in one of 7 themes.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/present/:week/:file.md?style=<theme>` | Standalone presentation page |

The note's markdown is split on `---` (or per the reveal markdown
plugin's defaults). The view is full-screen with a small auto-fading
toolbar (top right) for theme switching and going back.

## Themes

`presentationStyleCss(style)` (~line 904) returns CSS for one of:

- **paper** — Georgia serif, warm cream paper background, navy ink.
- **noir** — high-contrast dark theme.
- **klassisk** — classic reveal-style with subtle adjustments.
- **levende** — colorful / vivid.
- **minimal** — sans-serif, lots of whitespace.
- **matrix** — green-on-black, animated digital-rain canvas
  background.
- **nav** — Aksel design tokens (NAV's design system) with a circular
  logo watermark and Source Sans 3 font.

Adding a new theme: add a key to the `styles` map in
`presentationStyleCss` and update the toolbar selector in
`presentationPageHtml`.

## Code map

- `presentationPageHtml(week, file, content, style)` (~line 1050) —
  builds the standalone HTML page.
- `presentationStyleCss(style)` (~line 904) — theme registry.
- Reveal.js + plugins loaded from CDN
  (`@5.1.0/dist/...`, `plugin/markdown`, `plugin/highlight`,
  `plugin/notes`).

## Conventions

- Replace `</script>` in the markdown body with `<\/script>` before
  embedding in the page (the helper does this).
- Themes use CSS custom props (`--r-main-color`, `--r-heading-color`,
  etc.) so reveal's defaults are easy to override.
- Print-to-PDF works for all themes (reveal's built-in
  `?print-pdf=true` query supported).

## Gotchas

- `nav` theme requires extra `<link>` tags (Source Sans + Aksel
  tokens). The page conditionally injects them.
- `matrix` theme has a `<canvas>` for the digital-rain effect — be
  aware that `position: fixed` elements stack relative to the canvas.
- Reveal.js's markdown plugin handles fragments (`<!-- .element: -->`
  comments) — don't pre-strip HTML comments on the server.

## Related

- `notes.md` — the underlying markdown file.
