/**
 * Shared HTTP helper for all domain services.
 *
 * Sends a fetch request with optional JSON body and Accept header,
 * throws on non-2xx, and parses the response based on Content-Type
 * (or the optional Accept hint).
 *
 * Used by every service module under domains/<key>/service.js.
 */
export async function apiRequest(method, path, body, accept) {
    const opts = { method, headers: {} };
    if (accept) opts.headers['Accept'] = accept;
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status);
    const ct = r.headers.get('Content-Type') || '';
    if (accept === 'text/plain' || ct.startsWith('text/')) return r.text();
    return ct.includes('json') ? r.json() : r.text();
}
