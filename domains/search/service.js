/**
 * SearchService — wraps the global-search endpoint.
 *
 * GET /api/search?q=…  → search(q)
 *
 * Exposed as named export `SearchService` and via `window["week-note-services"].SearchService`.
 */
async function req(method, path) {
    const r = await fetch(path, { method });
    if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status);
    const ct = r.headers.get('Content-Type') || '';
    return ct.includes('json') ? r.json() : r.text();
}

export const SearchService = {
    search: (q) => req('GET', '/api/search?q=' + encodeURIComponent(q || '')),
};
