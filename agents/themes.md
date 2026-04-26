# Themes

Per-context theming. Each context's `settings.json` has a `theme: <id>`
field; the active context's theme is loaded as `<link id="themeStylesheet"
href="/themes/<id>.css">` in every page.

A theme is a CSS file that defines a fixed set of CSS custom properties
on `:root`. The rest of the app's CSS reads those vars (`var(--bg)`,
`var(--accent)` etc.) so the entire UI rescales/recolors automatically.

## Variables

Defined in `THEME_VAR_NAMES` in `server.js`:

- `bg`, `surface`, `surface-alt`, `surface-head`
- `border`, `border-soft`, `border-faint`
- `text`, `text-strong`, `text-muted`, `text-muted-warm`, `text-subtle`
- `accent`, `accent-strong`, `accent-soft`
- `font-family`, `font-size`

Body uses `var(--font-family, …)` and `var(--font-size, 16px)` with
fallbacks; form controls inherit via `input, textarea, select, button {
font-family: inherit; font-size: inherit }`. All other sizes in the app
use `em` so they scale relative to `--font-size`.

## Storage

| Kind | Location | Editable |
| --- | --- | --- |
| Built-in | `themes/*.css` (committed in repo) | No (read-only via UI) |
| Custom | `data/_themes/*.css` (gitignored) | Yes |

`data/` is in `.gitignore`. The `_themes/` subdir is filtered out by
`listContexts()` (underscore prefix), so it never shows up as a context.

The CSS file format is:

```css
/* name: My Custom Theme */
:root {
    --bg: #fbf9f4;
    ...
}
```

The name comment is parsed by `parseThemeCss()`. If absent, the id is
used as the display name.

## Code map (`server.js`)

- `THEMES` — list of built-in ids
- `THEME_LABELS` — Norwegian display names for built-ins
- `THEME_VAR_NAMES` — canonical variable order
- `parseThemeCss(content)` → `{ name, vars }`
- `readBuiltinTheme(id)` / `readCustomTheme(id)` / `findTheme(id)`
- `listBuiltinThemes()` / `listCustomThemes()` / `listAllThemes()`
- `themeCssFor(name, vars)` — serializes back to CSS
- `writeCustomTheme(id, name, vars)` — refuses to overwrite built-ins
- `deleteCustomTheme(id)` — refuses to delete built-ins
- `uniqueThemeId(base)` — for clone operations
- `isValidThemeId(t)` — used by `getActiveTheme()`
- `getActiveTheme()` — falls back to `paper` if invalid

## Routes

| Path | Purpose |
| --- | --- |
| `GET /themes` | Master/detail builder page |
| `GET /themes/<id>.css` | Stylesheet (built-in first, falls back to `data/_themes/`) |
| `GET /api/themes` | List all themes with parsed vars |
| `POST /api/themes` | `{from, name}` — clone an existing theme into a new custom one |
| `PUT /api/themes/:id` | `{name, vars}` — update a custom theme (built-ins return 400) |
| `DELETE /api/themes/:id` | Delete a custom theme |

## UI

- `/settings` Generelt-tab Tema picker enumerates `listAllThemes()` and
  applies inline `--p-*` custom props on each `.theme-swatch` so the
  preview palette works for built-in and custom themes alike. The grid
  has a "🎨 Tilpass tema →" link to `/themes`.
- `/themes` page is master/detail: rail on the left lists every theme
  (built-in + custom), detail pane on the right shows form inputs for
  every CSS variable + a live preview card.
- Built-in themes are read-only; only **Klone** is offered. Cloning a
  theme creates a new custom theme with the same vars.
- Custom themes have **Lagre** / **Klone** / **Slett** plus a **Sett som
  tema** button which PUTs `theme: <id>` on the active context.

## Gotchas

- Custom theme ids share the safe-name slug rules
  (`safeThemeId(s)` = lowercase a-z, 0-9, _, -). Avoid collisions with
  built-in ids.
- The `/themes/<id>.css` route uses `Cache-Control: no-cache` so edits
  are reflected immediately; UI reloads via cache-busting query string
  after Save / Apply.
- `font-size` is stored with the `px` suffix (e.g. `16px`). The form
  parses/writes it as a bare integer; `gatherVars()` re-appends `px`.
