# Feature: API documentation and explorer

`openapi.json` is the self-contained OpenAPI 3.1 contract for the HTTP API.
It describes existing routes rather than imposing new API conventions.
Keep operation IDs unique and update it when routes or wire contracts change.
The storage schemas in `schemas/` are separate: some represent collections
and legacy shapes, not API requests or response envelopes.

| Resource | Purpose |
| --- | --- |
| `GET /openapi.json` | Serve the contract as JSON |
| `GET /api-explorer` | Interactive Swagger UI |
| `routes/api-docs.js` | Exact allowlist of documentation and asset paths |
| `public/api-explorer.js` | Local spec loading and mutation confirmation |
| `public/api-explorer.css` | Theme-variable overrides for vendor styling |
| `tests/playwright/api-docs.spec.js` | Validation, path coverage, response contracts and browser tests |

The docs handler runs before other handlers. `isApiDocsPath` is shared with
the first-run guard so documentation remains available without a context.
Only GET is served; never expose arbitrary files from `node_modules`.

Swagger UI is installed through `swagger-ui-dist`, not a CDN.
Keep `validatorUrl: null`, `queryConfigEnabled: false` and same-origin
requests. The explorer's CSP also restricts connections to the current host.
Use the browser-managed `wn_ctx` cookie; there is no authentication scheme.
The displayed context is the one selected when opening the page, not a
promise that other tabs cannot change the cookie afterward.

Confirm mutations in the wrapped Execute component before it enters loading
state. Cancelling an HTTP interceptor after execution begins can leave vendor
UI state broken. Cancelled requests must not reach the API and must remain
retryable. The explorer is not a sandbox: Git and deletion endpoints operate
on the host. Tests use only disposable data roots.
