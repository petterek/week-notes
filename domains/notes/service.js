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
 * Exposed as named export `NotesService` and via `window["week-note-services"].NotesService`.
 */
import { apiRequest as req } from '/services/_shared/http.js';


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
    listAll:    ()                => req('GET',    '/api/notes'),
    listThemes: ()                => req('GET',    '/api/notes/themes'),
    history:    (week, file)      => req('GET',    noteUrl(week, file, '/history')),
    versionAt:  (week, file, hash) => req('GET',   noteUrl(week, file, '/at/' + encodeURIComponent(hash))),
    getWeek:    (week)            => req('GET',    `/api/week/${encodeURIComponent(week)}`),
};
