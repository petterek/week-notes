/**
 * MeetingsService — wraps /api/meetings + /api/meeting-types + /api/meeting-series endpoints.
 *
 * GET    /api/meetings[?week=W][&upcoming=N] → list({ week?, upcoming? })
 * POST   /api/meetings           {date,title,…} → create(data)
 * GET    /api/meetings/:id                      → get(id)
 * PUT    /api/meetings/:id       {…}            → update(id, patch)
 * DELETE /api/meetings/:id                      → remove(id)
 * GET    /api/meeting-types                     → listTypes()
 * PUT    /api/meeting-types      {types}        → saveTypes(types)
 *
 * Meeting-series (recurring occurrences with a persistent agenda thread):
 * GET    /api/meeting-series                    → listSeries()
 * POST   /api/meeting-series     {title,…}      → createSeries(data)
 * GET    /api/meeting-series/:id                → getSeries(id)
 * PUT    /api/meeting-series/:id {…}            → updateSeries(id, patch)
 * DELETE /api/meeting-series/:id                → removeSeries(id)
 * POST   /api/meeting-series/:id/agenda {title} → addAgendaItem(id, title)
 * PUT    /api/meeting-series/:id/agenda/:itemId → updateAgendaItem(id, itemId, patch)
 * DELETE /api/meeting-series/:id/agenda/:itemId → removeAgendaItem(id, itemId)
 *
 * Occurrence lifecycle + in-meeting actions (only for occurrences with seriesId):
 * POST   /api/meetings/:id/start                → start(id)
 * POST   /api/meetings/:id/close                → close(id)
 * POST   /api/meetings/:id/reopen                → reopen(id)
 * POST   /api/meetings/:id/agenda {title}        → addOccurrenceAgendaItem(id, title)
 * PUT    /api/meetings/:id/agenda/:agendaItemId  → updateOccurrenceAgendaItem(id, agendaItemId, patch)
 * POST   /api/meetings/:id/decisions {text}      → addDecision(id, text)
 * DELETE /api/meetings/:id/decisions/:decisionId → removeDecision(id, decisionId)
 * PUT    /api/meetings/:id/decisions/:decisionId → updateDecision(id, decisionId, patch)
 *
 * Exposed as named export `MeetingsService` and via `window["week-note-services"].MeetingsService`.
 */
const BASE = '/api/meetings';
const TYPES = '/api/meeting-types';
const SERIES = '/api/meeting-series';

import { apiRequest as req } from '/services/_shared/http.js';


export const MeetingsService = {
    list: (filter = {}) => {
        const params = new URLSearchParams();
        if (filter.week) params.set('week', filter.week);
        if (filter.upcoming != null) params.set('upcoming', String(filter.upcoming));
        if (filter.allContexts) params.set('allContexts', '1');
        const qs = params.toString();
        return req('GET', qs ? `${BASE}?${qs}` : BASE);
    },
    get:     (id)           => req('GET',    `${BASE}/${encodeURIComponent(id)}`),
    create:  (data)        => req('POST',   BASE, data),
    importCalendar: (content, timeZone) => req('POST', `${BASE}/import`, { content, timeZone }),
    previewCalendar: (content, timeZone) => req('POST', `${BASE}/import/preview`, { content, timeZone }),
    update:  (id, patch)   => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
    remove:  (id)          => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
    listTypes: ()          => req('GET',    TYPES),
    saveTypes: (types)     => req('PUT',    TYPES, { types }),

    // --- Meeting series ---
    listSeries:  ()              => req('GET',    SERIES),
    createSeries: (data)         => req('POST',   SERIES, data),
    getSeries:   (id)             => req('GET',    `${SERIES}/${encodeURIComponent(id)}`),
    updateSeries: (id, patch)    => req('PUT',    `${SERIES}/${encodeURIComponent(id)}`, patch),
    removeSeries: (id)            => req('DELETE', `${SERIES}/${encodeURIComponent(id)}`),
    addAgendaItem: (id, title)    => req('POST',   `${SERIES}/${encodeURIComponent(id)}/agenda`, { title }),
    updateAgendaItem: (id, itemId, patch) => req('PUT', `${SERIES}/${encodeURIComponent(id)}/agenda/${encodeURIComponent(itemId)}`, patch),
    removeAgendaItem: (id, itemId) => req('DELETE', `${SERIES}/${encodeURIComponent(id)}/agenda/${encodeURIComponent(itemId)}`),

    // --- Occurrence lifecycle + in-meeting actions ---
    start:  (id) => req('POST', `${BASE}/${encodeURIComponent(id)}/start`),
    close:  (id) => req('POST', `${BASE}/${encodeURIComponent(id)}/close`),
    reopen: (id) => req('POST', `${BASE}/${encodeURIComponent(id)}/reopen`),
    addOccurrenceAgendaItem: (id, title) => req('POST', `${BASE}/${encodeURIComponent(id)}/agenda`, { title }),
    updateOccurrenceAgendaItem: (id, agendaItemId, patch) => req('PUT', `${BASE}/${encodeURIComponent(id)}/agenda/${encodeURIComponent(agendaItemId)}`, patch),
    addDecision: (id, text, agendaItemId) => req('POST', `${BASE}/${encodeURIComponent(id)}/decisions`, { text, ...(agendaItemId ? { agendaItemId } : {}) }),
    updateDecision: (id, decisionId, patch) => req('PUT', `${BASE}/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}`, patch),
    removeDecision: (id, decisionId) => req('DELETE', `${BASE}/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}`),
};
