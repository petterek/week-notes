/**
 * ContextService — wraps context (workspace) management + per-context git.
 *
 * Contexts:
 *   GET    /api/contexts                          → list()
 *   POST   /api/contexts        {…}               → create(data)
 *   POST   /api/contexts/clone  {…}               → clone(data)
 *   POST   /api/contexts/switch {id}              → switchTo(id)
 *   GET    /api/contexts/disconnected             → listDisconnected()
 *   DELETE /api/contexts/disconnected/:id         → forgetDisconnected(id)
 *   POST   /api/contexts/:id/disconnect           → disconnect(id)
 *
 * Git per context:
 *   POST   /api/contexts/:id/commit               → commit(id)
 *   GET    /api/contexts/:id/git                  → gitStatus(id)
 *   POST   /api/contexts/:id/push                 → push(id)
 *   POST   /api/contexts/:id/pull                 → pull(id)
 *
 * Exposed as named export `ContextService` and via `window["week-note-services"].ContextService`.
 */
import { apiRequest as req } from '/services/_shared/http.js';


const enc = encodeURIComponent;

export const ContextService = {
    list:               ()          => req('GET',    '/api/contexts'),
    create:             (data)      => req('POST',   '/api/contexts', data),
    clone:              (data)      => req('POST',   '/api/contexts/clone', data),
    switchTo:           (id)        => req('POST',   '/api/contexts/switch', { id }),
    listDisconnected:   ()          => req('GET',    '/api/contexts/disconnected'),
    forgetDisconnected: (id)        => req('DELETE', `/api/contexts/disconnected/${enc(id)}`),
    disconnect:         (id)        => req('POST',   `/api/contexts/${enc(id)}/disconnect`),

    commit:             (id, body) => req('POST',   `/api/contexts/${enc(id)}/commit`, body),
    gitStatus:          (id)        => req('GET',    `/api/contexts/${enc(id)}/git`),
    push:               (id)        => req('POST',   `/api/contexts/${enc(id)}/push`),
    pull:               (id)        => req('POST',   `/api/contexts/${enc(id)}/pull`),
};
