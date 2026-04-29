/**
 * PeopleService — wraps /api/people endpoints.
 *
 * GET    /api/people              → list()
 * POST   /api/people    {…}       → create(person)
 * PUT    /api/people/:id {…}      → update(id, patch)
 * DELETE /api/people/:id          → remove(id)
 *
 * Exposed as named export `PeopleService`.
 */
const BASE = '/api/people';

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

export const PeopleService = {
    list:   ()           => req('GET',    BASE),
    create: (person)     => req('POST',   BASE, person),
    update: (id, patch)  => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
    remove: (id)         => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
};


if (typeof window !== 'undefined') window.PeopleService = PeopleService;
