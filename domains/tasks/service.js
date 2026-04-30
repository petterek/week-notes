/**
 * TaskService — wraps /api/tasks endpoints.
 *
 * GET    /api/tasks                  → list()
 * POST   /api/tasks         {text}   → create(text)
 * PUT    /api/tasks/:id     {text?,note?} → update(id, patch)
 * DELETE /api/tasks/:id              → remove(id)
 * PUT    /api/tasks/:id/toggle {comment?} → toggle(id, comment?)
 * POST   /api/tasks/merge   {srcId,tgtId} → merge(srcId, tgtId)
 * POST   /api/tasks/reorder {ids}    → reorder(ids)
 *
 * Exposed as named export `TaskService` and via `window["week-note-services"].TaskService`.
 */
const BASE = '/api/tasks';

import { apiRequest as req } from '/services/_shared/http.js';


export const TaskService = {
    list:    ()                  => req('GET',    BASE),
    create:  (text)              => req('POST',   BASE, { text }),
    update:  (id, patch)         => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
    remove:  (id)                => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
    toggle:  (id, comment = '')  => req('PUT',    `${BASE}/${encodeURIComponent(id)}/toggle`, { comment }),
    merge:   (srcId, tgtId)      => req('POST',   `${BASE}/merge`, { srcId, tgtId }),
    reorder: (ids)               => req('POST',   `${BASE}/reorder`, { ids }),
};
