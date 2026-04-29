/**
 * NotesService — wraps note-related endpoints.
 *
 * POST   /api/save           {folder,file,content,append?,type?,…}  → save(data)
 * GET    /api/notes/:week/:file/render → renderHtml(week, file)
 * GET    /api/notes/:week/:file/raw    → raw(week, file)
 * GET    /api/notes/:week/:file/meta   → meta(week, file)
 * GET    /api/notes/:week/:file/card   → card(week, file)
 * PUT    /api/notes/:week/:file/pin    {pinned?} → setPinned(week, file, pinned)
 * DELETE /api/notes/:week/:file        → remove(week, file)
 *
 * Exposed as named export `NotesService`.
 */
async function req(method, path, body, accept) {
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
}

function noteUrl(week, file, suffix) {
    return `/api/notes/${encodeURIComponent(week)}/${encodeURIComponent(file)}${suffix || ''}`;
}

export const NotesService = {
    save:       (data)            => req('POST',   '/api/save', data),
    raw:        (week, file)      => req('GET',    noteUrl(week, file, '/raw'), undefined, 'text/plain'),
    renderHtml: (week, file)      => req('GET',    noteUrl(week, file, '/render'), undefined, 'text/html'),
    meta:       (week, file)      => req('GET',    noteUrl(week, file, '/meta')),
    card:       (week, file)      => req('GET',    noteUrl(week, file, '/card')),
    setPinned:  (week, file, pinned) => req('PUT', noteUrl(week, file, '/pin'), { pinned: !!pinned }),
    remove:     (week, file)      => req('DELETE', noteUrl(week, file)),
    listWeeks:  ()                => req('GET',    '/api/weeks'),
    getWeek:    (week)            => req('GET',    `/api/week/${encodeURIComponent(week)}`),
};


if (typeof window !== 'undefined') window.NotesService = NotesService;
