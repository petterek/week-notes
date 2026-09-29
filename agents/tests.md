# Feature: UI tests + scenarios

Component-level UI tests that run **both** in CI (Playwright/Node) and
in the browser (`/debug/tests` page). The same scenario file is the
single source of truth for both runners.

---

## Layout

```
tests/
├── helpers/
│   └── playwright-fixtures.js   # isolated server seeds + cleanup helpers
├── server.js                    # Playwright webServer wrapper (isolated DATA_DIR)
├── scenarios.js                # shared scenario definitions (UMD-ish)
├── playwright/
│   ├── pages.spec.js          # page-level smoke (real server, no mocks)
│   └── scenarios.spec.js      # one Playwright test per scenario
└── .last-run.json             # JSON reporter output (gitignored)

playwright.config.js            # baseURL :TEST_PORT, spawns tests/server.js
```

Server-side wiring:
- `GET /debug/tests`              → page (in-browser runner UI)
- `GET /debug/tests/scenarios.js` → serves `tests/scenarios.js`
- `GET /debug/tests/last-run.json`→ serves `tests/.last-run.json`
- Sidebar link added to all `/debug` pages under "Other".

The Playwright runner starts `tests/server.js`, which:
- creates a unique repo-local `.playwright-data/run-*` directory,
- seeds a deterministic throwaway context (`playwright`) plus
  `app-settings.json` with search / embedding / summarization disabled,
- launches `server.js` with `PORT=$TEST_PORT` and `DATA_DIR=<isolated root>`,
- shuts the child down on SIGINT/SIGTERM and removes only its own data dir.

Port selection is deterministic: `playwright.config.js` picks the first
free port from `TEST_PORT` (default `3101`) plus local fallback ports
(`TEST_PORT_ALT`, `TEST_PORT_FALLBACK`, then `3102-3104`). `3001` is
never considered. If no candidate is free, Playwright fails fast with a
clear error instead of reusing an existing server.
The selected port is carried to Playwright workers in `WN_PLAYWRIGHT_PORT`;
worker config reloads must not choose a different port once the server is
running. The wrapper starts the real `server.js` without module-resolution
shims or production-only patches.
`webServer.gracefulShutdown` must send SIGTERM before a forced kill, so
the wrapper can remove its fixture directory. The default immediate kill
leaves `.playwright-data/run-*` behind.

Some restricted CLI environments prevent Chromium's zygote/GPU children
from reading `/proc`, failing before a page can open. A temporary local
config with `launchOptions.args: ['--no-zygote', '--in-process-gpu',
'--disable-gpu']` can run the same suite without changing shared defaults.
Do not use `--single-process`: the first browser context can work while
later contexts crash. Keep environment diagnostics separate from app
failures; do not skip scenarios or patch module resolution to hide them.

---

## How scenarios work

Each scenario in `tests/scenarios.js`:

```js
{
    id:   'task-create-emits-event',           // stable kebab-case
    name: 'task-create dispatches task:created on submit',
    url:  '/debug/task-create',                // any /debug/* page
    run:  async function (ctx) { /* DOM-only, throws on fail */ },
}
```

The `run` function gets `{ doc, win, sleep, waitFor, assert }`.
Stick to those — no `page.goto`, no Node APIs — so the same code runs
in both harnesses.

### Playwright harness
`tests/playwright/scenarios.spec.js` requires `tests/scenarios.js`,
serialises each `run` via `.toString()`, and injects it into the page
through `page.evaluate`. The helpers are also injected as a string
prelude so the function context matches the in-browser case.

### In-browser harness
`/debug/tests` loads `tests/scenarios.js` as a regular `<script>`
(it self-registers `window.WN_TEST_SCENARIOS` + `WN_TEST_HELPERS`).
Each scenario runs inside a hidden `<iframe>` whose `src` is
`scenario.url`. The iframe preloads `domains/_mock-services.js`
because it's a `/debug/*` page.

### Mock services
Components on `/debug/*` already accept `service="MockTaskService"`
(etc) attributes; the mock implementations live in
`domains/_mock-services.js` and are seeded on every iframe load. No
real I/O happens. To add a new mock service, follow the existing
pattern in that file (delay + uid + an in-memory array).

---

## Running

```bash
# CI / CLI: Playwright manages its own isolated server on TEST_PORT
npm test

# In-browser: start the isolated server in another terminal first
TEST_PORT=3101 node tests/server.js
# Visit http://localhost:3101/debug/tests and click "Run all".
```

Exit codes from `npm test` are real (good for CI). Playwright writes
a JSON report to `tests/.last-run.json`, which the `/debug/tests`
page reads to render the "Last Playwright run" panel.

---

## Adding a new scenario

1. Append a new entry to the `SCENARIOS` array in
   `tests/scenarios.js`. Use the existing `ctx.waitFor(...)` helper
   for any async DOM condition; never `setTimeout` blindly.
2. Verify locally:
   - `/debug/tests` → click "Run" on the new row.
   - `npm test` → Playwright wraps it as `[your-id] ${name}`.
3. If the scenario needs a new mock seed, edit
   `domains/_mock-services.js`. Keep mocks shallow.

### Gotchas

- **Shadow DOM**: many components own a shadow root. Call
  `host.shadowRoot.querySelector(...)`. Components like
  `<global-search>` or `<modal-container>` slot content into light
  DOM — query the host element directly there.
- **Demo seeding**: most `/debug/<component>` pages seed their demos
  in a `customElements.whenDefined(...)`. Wait for the seed before
  overwriting (`await waitFor(() => el._data.length > 0)`).
- **Duplicate rows**: `<json-table>` renders the table twice (inline
  + overlay for fullscreen). Scope counts to `.inline tbody tr`.
- **Page-level smoke** in `pages.spec.js` hits the isolated real
  server, not mocks. Keep those checks coarse (status + page title)
  and use the seeded synthetic fixtures from
  `tests/helpers/playwright-fixtures.js`.

---

## Conventions agents must follow

- Scenarios are pure DOM. No Playwright APIs, no Node APIs.
- Don't import scenarios from other files; the UMD-ish wrapper in
  `tests/scenarios.js` exists so the same file works in CommonJS
  (Playwright) and as a `<script>` in the browser. Don't break it.
- Every scenario must:
  - Have a unique `id` (kebab-case).
  - Have a stable `url` under `/debug/*`.
  - Throw on failure with a clear `Error.message` — that string
    surfaces both in the UI and in the Playwright failure log.
- When you change a component's shadow structure or selectors, run
  `npm test` and the in-browser runner; both must stay green.
- Don't commit `tests/.last-run.json` or `test-results/` (already
  in `.gitignore`).
