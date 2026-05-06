/**
 * GoalsService — wraps /api/goals endpoints.
 *
 * GET    /api/goals                                         → list()
 * POST   /api/goals  {title,description?,targetDate?,status?} → create(data)
 * PUT    /api/goals/:id {title?,description?,status?,targetDate?} → update(id, patch)
 * DELETE /api/goals/:id                                     → remove(id)
 *
 * Goals lifecycle states: 'active', 'achieved', 'abandoned'.
 *
 * Exposed as named export `GoalsService` and via window["week-note-services"].goals_service.
 */
const BASE = '/api/goals';

import { apiRequest as req } from '/services/_shared/http.js';

export const GoalsService = {
    list:   ()           => req('GET',    BASE),
    create: (data)       => req('POST',   BASE, data),
    update: (id, patch)  => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
    remove: (id)         => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
};
