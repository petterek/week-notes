'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const {
        THEMES, deleteCustomTheme, findTheme, listAllThemes, readCustomTheme, safeThemeId, uniqueThemeId,
        writeCustomTheme,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/themes' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(listAllThemes()));
        return;
    }
    // API: clone a theme to a new custom theme
    if (pathname === '/api/themes' && req.method === 'POST') {
        try {
            const { from, name } = await _core.readJsonBody(req);
            const src = findTheme(from);
            if (!src) throw new Error('Kildetema ikke funnet');
            const baseName = String(name || (src.name + ' (kopi)')).trim() || 'Nytt tema';
            const id = uniqueThemeId(baseName);
            writeCustomTheme(id, baseName, src.vars);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, theme: readCustomTheme(id) }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }
    // API: update / delete a custom theme
    const themeMatch = pathname.match(/^\/api\/themes\/([a-z0-9_-]+)$/);
    if (themeMatch && req.method === 'PUT') {
        const id = safeThemeId(themeMatch[1]);
        if (THEMES.includes(id)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Innebygde temaer kan ikke endres — klone først' }));
            return;
        }
        try {
            const { name, vars } = await _core.readJsonBody(req);
            if (!vars || typeof vars !== 'object') throw new Error('Mangler variabler');
            const existing = readCustomTheme(id);
            if (!existing) throw new Error('Tema finnes ikke');
            writeCustomTheme(id, name || existing.name, vars);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, theme: readCustomTheme(id) }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }
    if (themeMatch && req.method === 'DELETE') {
        try {
            deleteCustomTheme(themeMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }

    };
};
