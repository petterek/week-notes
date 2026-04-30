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
 * Exposed as named export `MeetingsService` and via `window["week-note-services"].MeetingsService`.
 */
const BASE = '/api/meetings';
const TYPES = '/api/meeting-types';

import { apiRequest as req } from '/services/_shared/http.js';


export const MeetingsService = {
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
