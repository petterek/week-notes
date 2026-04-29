/**
 * ResultsService — wraps /api/results endpoints.
 *
 * GET    /api/results[?week=W]   → list({ week? })
 * POST   /api/results  {text,week?,taskId?,taskText?} → create(data)
 * PUT    /api/results/:id {text} → update(id, patch)
 * DELETE /api/results/:id        → remove(id)
 *
 * Exposed as window.ResultsService.
 */
(function () {
    if (typeof window !== 'undefined' && window.ResultsService) return;

    const BASE = '/api/results';

    async function req(method, path, body) {
        const opts = { method, headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const r = await fetch(path, opts);
        if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status);
        const ct = r.headers.get('Content-Type') || '';
        return ct.includes('json') ? r.json() : r.text();
    }

    const ResultsService = {
        list: (filter = {}) => {
            const qs = filter.week ? '?week=' + encodeURIComponent(filter.week) : '';
            return req('GET', BASE + qs);
        },
        create: (data)        => req('POST',   BASE, data),
        update: (id, patch)   => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
        remove: (id)          => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
    };

    if (typeof window !== 'undefined') window.ResultsService = ResultsService;
    if (typeof module !== 'undefined' && module.exports) module.exports = ResultsService;
})();
