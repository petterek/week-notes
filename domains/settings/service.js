/**
 * SettingsService — wraps per-context settings, meeting-types and theme
 * endpoints. Workspace/context lifecycle (list/create/switch/git) lives in
 * ContextService.
 *
 * Per-context settings + meeting-types:
 *   GET    /api/contexts/:id/settings               → getSettings(id)
 *   PUT    /api/contexts/:id/settings    {…}        → saveSettings(id, body)
 *   GET    /api/contexts/:id/meeting-types          → getMeetingTypes(id)
 *   PUT    /api/contexts/:id/meeting-types {types}  → saveMeetingTypes(id, types)
 *
 * Themes:
 *   GET    /api/themes                              → listThemes()
 *   POST   /api/themes  {from,name}                 → createTheme(data)
 *   PUT    /api/themes/:id {name,vars}              → updateTheme(id, body)
 *   DELETE /api/themes/:id                          → removeTheme(id)
 *
 * Exposed as named export `SettingsService` and via `window["week-note-services"].SettingsService`.
 */
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

const enc = encodeURIComponent;

export const SettingsService = {
    getSettings:      (id)         => req('GET', `/api/contexts/${enc(id)}/settings`),
    saveSettings:     (id, body)   => req('PUT', `/api/contexts/${enc(id)}/settings`, body),
    getMeetingTypes:  (id)         => req('GET', `/api/contexts/${enc(id)}/meeting-types`),
    saveMeetingTypes: (id, types)  => req('PUT', `/api/contexts/${enc(id)}/meeting-types`, { types }),

    listThemes:  ()         => req('GET',    '/api/themes'),
    createTheme: (data)     => req('POST',   '/api/themes', data),
    updateTheme: (id, body) => req('PUT',    `/api/themes/${enc(id)}`, body),
    removeTheme: (id)       => req('DELETE', `/api/themes/${enc(id)}`),
};
