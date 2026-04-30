/**
 * ResultsService — wraps /api/results endpoints.
 *
 * GET    /api/results[?week=W]   → list({ week? })
 * POST   /api/results  {text,week?,taskId?,taskText?} → create(data)
 * PUT    /api/results/:id {text} → update(id, patch)
 * DELETE /api/results/:id        → remove(id)
 *
 * Exposed as named export `ResultsService` and via `window["week-note-services"].ResultsService`.
 */
const BASE = '/api/results';

import { apiRequest as req } from '/services/_shared/http.js';


export const ResultsService = {
    list: (filter = {}) => {
        const qs = filter.week ? '?week=' + encodeURIComponent(filter.week) : '';
        return req('GET', BASE + qs);
    },
    create: (data)        => req('POST',   BASE, data),
    update: (id, patch)   => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
    remove: (id)          => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
};
