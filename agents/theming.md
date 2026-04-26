# Feature: Theming

Each context picks one of seven visual themes. The chosen theme styles
all pages while that context is active.

## Available themes

| Slug | Label | Look |
| --- | --- | --- |
| `paper` | Papir | Warm cream paper, navy accents (default) |
| `dark` | Mørk | Slate background with soft blue accent |
| `sepia` | Sepia | Warm browns |
| `solarized-light` | Solarized Light | Cream + cyan |
| `nord` | Nord | Cool arctic blue/grey |
| `forest` | Skog | Greens and earth |
| `ocean` | Hav | Blues and teal |

## Storage

- The active theme is just a field on the context's
  `data/<ctx>/settings.json`:
  ```json
  { "name": "Arbeid", "icon": "💼", "theme": "dark" }
  ```
- Missing or unknown values fall back to `paper`.
- `getActiveTheme()` (in `server.js`) reads
  `getContextSettings(activeContext).theme` and validates against the
  `THEMES` allow-list.

## Files

- `themes/<slug>.css` — one file per theme, defines `:root { --bg, … }`
  overrides. They are tiny (≈15 variables each).
- `server.js` defines the same variables inline in `pageHtml()` as the
  paper-default fallback so a page renders correctly even if the
  themed file is unavailable.

## CSS variables

The variable contract (defined in every theme file):

| Variable | Used for |
| --- | --- |
| `--bg` | Page background |
| `--surface` | Cards, modals, dropdown panels |
| `--surface-alt` | Hover surface, subtle highlight |
| `--surface-head` | Heading bands (modal head, calendar col head) |
| `--border` | Default 1px borders |
| `--border-soft` | Light dividers |
| `--border-faint` | Very subtle dividers |
| `--text` | Body text on warm surfaces |
| `--text-strong` | Highest-contrast text |
| `--text-muted` | Secondary text |
| `--text-muted-warm` | Tertiary text (paper-warm tone) |
| `--text-subtle` | Quiet hints / placeholders |
| `--accent` | Brand color: links, h1/h2, primary buttons |
| `--accent-strong` | Hover/pressed accent |
| `--accent-soft` | Tinted accent background (e.g. focus ring) |

Component-specific colors (meeting blue, task green, result amber,
matrix green, error red) are intentionally **not** themed — they
keep their semantic meaning across all themes.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/themes/<slug>.css` | Static handler that streams the file from `themes/`. Slug must match `[a-z0-9-]+` and exist. |

## Settings UI

- The settings detail pane has a **Tema** fieldset rendered as a grid
  of seven preview swatches (mini cards showing each theme's
  bg/surface/accent palette).
- Selecting a swatch is a normal radio input (`name="theme"`); the
  form's existing PUT to `/api/contexts/:id/settings` carries the new
  value. Page reloads on save and the new theme is live.
- The grid uses fixed inline palettes per swatch (not CSS variables)
  so each preview shows its own theme regardless of which one is
  currently active.

## Adding a new theme

1. Add `themes/<slug>.css` defining the same 15 variables.
2. Add the slug to the `THEMES` array and a label to `THEME_LABELS`
   in `server.js`.
3. Add `.theme-<slug>` preview rules in the settings page CSS so the
   swatch in the picker shows real colors.

## Gotchas

- `setContextSettings` writes the entire `data` object as JSON, so any
  PUT must include all fields you want to keep. The settings form
  already gathers everything; ad-hoc curl calls will clobber other
  fields.
- The inline `:root` defaults inside `pageHtml()` are paper colors. If
  the linked theme file fails to load, the page falls back to paper —
  not the previously selected theme.
- The themes' CSS files are cached for 5 minutes (`Cache-Control:
  max-age=300`). If you tweak a theme file in development, hard-reload
  to bypass the cache.
