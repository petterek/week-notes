/**
 * Shared HTTP helper for all domain services.
 *
 * Sends a fetch request with optional JSON body and Accept header,
 * throws on non-2xx, and parses the response based on Content-Type
 * (or the optional Accept hint).
 *
 * GET requests with no body are deduped while in-flight: if N components
 * call the same URL in the same tick (e.g. 45× /api/people on home page
 * load), only one fetch is issued and all callers await the same promise.
 * This dramatically reduces request fan-out and the resulting browser
 * HTTP/1.1 connection-limit queueing.
 *
 * Used by every service module under domains/<key>/service.js.
 */
const _inFlight = new Map();
const _recent = new Map();
const _RECENT_TTL_MS = 200;

function _clone(value) {
    if (value == null || typeof value !== 'object') return value;
    try { return structuredClone(value); }
    catch { try { return JSON.parse(JSON.stringify(value)); } catch { return value; } }
}

export async function apiRequest(method, path, body, accept) {
    const isGet = method === 'GET' && body === undefined;
    const key = isGet ? `${path}|${accept || ''}` : null;
    if (key) {
        if (_inFlight.has(key)) return _clone(await _inFlight.get(key));
        const cached = _recent.get(key);
        if (cached && (performance.now() - cached.t) < _RECENT_TTL_MS) {
            return _clone(cached.v);
        }
    } else {
        _recent.clear();
    }
    const exec = (async () => {
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
    })();
    if (key) {
        _inFlight.set(key, exec);
        exec.finally(() => { _inFlight.delete(key); });
        const value = await exec;
        _recent.set(key, { t: performance.now(), v: value });
        return _clone(value);
    }
    return exec;
}
