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
 * Exposed as named export `TaskService`.
 */
const BASE = '/api/tasks';

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

export const TaskService = {
    list:    ()                  => req('GET',    BASE),
    create:  (text)              => req('POST',   BASE, { text }),
    update:  (id, patch)         => req('PUT',    `${BASE}/${encodeURIComponent(id)}`, patch),
    remove:  (id)                => req('DELETE', `${BASE}/${encodeURIComponent(id)}`),
    toggle:  (id, comment = '')  => req('PUT',    `${BASE}/${encodeURIComponent(id)}/toggle`, { comment }),
    merge:   (srcId, tgtId)      => req('POST',   `${BASE}/merge`, { srcId, tgtId }),
    reorder: (ids)               => req('POST',   `${BASE}/reorder`, { ids }),
};


if (typeof window !== 'undefined') window.TaskService = TaskService;
