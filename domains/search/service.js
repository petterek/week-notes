/**
 * SearchService — wraps the global-search endpoint.
 *
 * GET /api/search?q=…  → search(q)
 *
 * Exposed as named export `SearchService` and via `window["week-note-services"].SearchService`.
 */
import { apiRequest as req } from '/services/_shared/http.js';


export const SearchService = {
    search: (q) => req('GET', '/api/search?q=' + encodeURIComponent(q || '')),
};
