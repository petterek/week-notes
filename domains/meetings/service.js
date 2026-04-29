/**
 * MeetingsService — wraps /api/meetings + /api/meeting-types endpoints.
 *
 * GET    /api/meetings[?week=W][&upcoming=N] → list({ week?, upcoming? })
 * POST   /api/meetings           {date,title,…} → create(data)
 * PUT    /api/meetings/:id       {…}            → update(id, patch)
 * DELETE /api/meetings/:id                      → remove(id)
 * GET    /api/meeting-types                     → listTypes()
 * PUT    /api/meeting-types      {types}        → saveTypes(types)
 *
 * Exposed as window.MeetingsService.
 */
(function () {
    if (typeof window !== 'undefined' && window.MeetingsService) return;

    const BASE = '/api/meetings';
    const TYPES = '/api/meeting-types';

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

    const MeetingsService = {
        list: (filter = {}) => {
            const params = new URLSearchParams();
            if (filter.week) params.set('week', filter.week);
            if (filter.upcoming != null) params.set('upcoming', String(filter.upcoming));
            const qs = params.toString();
            return req('GET', qs ? `${BASE}?${qs}` : BASE);
        },
        create:  (data)        => req('POST',   BASE, data),
        update:  (id, patch)   => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
        remove:  (id)          => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
        listTypes: ()          => req('GET',    TYPES),
        saveTypes: (types)     => req('PUT',    TYPES, { types }),
    };

    if (typeof window !== 'undefined') window.MeetingsService = MeetingsService;
    if (typeof module !== 'undefined' && module.exports) module.exports = MeetingsService;
})();
