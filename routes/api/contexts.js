'use strict';
module.exports = function(deps) {
    const path = require('path');
    const { execFileSync } = require('child_process');
    const _core = deps.core;
    const __dirname = deps.rootDir;
    const {
        CONTEXTS_DIR, _cacheInvalidateContext, cloneContext, createContext, disconnectContext,
        forgetDisconnected, getAppSettings, getContextSettings, getContextThemes, git, gitCommitAll,
        gitCurrentBranch, gitGetRemote, gitInitIfNeeded, gitIsDirty, gitIsRepo, gitLastCommit, gitPull,
        gitPush, listContexts, loadDisconnected, loadMeetingTypes, pullContextRemote,
        rebuildTaskNoteRefs, reindexSearch, restartEmbedWorker, safeName, saveMeetingTypes,
        setActiveContext, setContextSettings,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/contexts' && req.method === 'GET') {
        const active = _core.getActiveContextFromReq(req);
        const list = listContexts().map(name => {
            const settings = getContextSettings(name);
            // For the active context, surface the *union* of
            // settings.availableThemes (preferences) and tags actually
            // used by notes (derived from the inverted tag index, never
            // persisted). For other contexts we can't cheaply read note
            // meta, so we return raw settings.
            if (name === active) {
                const themes = getContextThemes(name);
                return { id: name, active: true, settings: { ...settings, availableThemes: themes } };
            }
            return { id: name, active: false, settings };
        });
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': _core.activeContextCookie(active),
        });
        res.end(JSON.stringify({ active, contexts: list }));
        return;
    }

    // API: list previously-disconnected contexts (URL memory only)
    if (pathname === '/api/contexts/disconnected' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadDisconnected()));
        return;
    }
    // API: forget a disconnected entry
    const forgetMatch = pathname.match(/^\/api\/contexts\/disconnected\/([^/]+)$/);
    if (forgetMatch && req.method === 'DELETE') {
        try {
            forgetDisconnected(forgetMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }
    // API: disconnect (commit + push + remove + remember url)
    const disconnectMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/disconnect$/);
    if (disconnectMatch && req.method === 'POST') {
        try {
            const result = disconnectContext(disconnectMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: result.id, remote: result.remote }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }

    // API: switch active context
    if (pathname === '/api/contexts/switch' && req.method === 'POST') {
        try {
            const { id } = await _core.readJsonBody(req);
            const next = setActiveContext(id, { skipPull: true });
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Set-Cookie': _core.activeContextCookie(next),
            });
            res.end(JSON.stringify({ ok: true, active: next }));
            setImmediate(() => _core.runWithDataContext(next, () => {
                try { pullContextRemote(next); } catch (e) { console.error('bg pull', e.message); }
                try { rebuildTaskNoteRefs(); } catch (e) { console.error('rebuildTaskNoteRefs', e.message); }
                reindexSearch();
                if (getAppSettings().vectorSearch.enabled) restartEmbedWorker();
            }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }

    // API: create new context
    if (pathname === '/api/contexts' && req.method === 'POST') {
        try {
            const { name, icon, description, remote, force } = await _core.readJsonBody(req);
            if (!name) throw new Error('Mangler navn');
            const id = createContext(name, { name, icon: icon || '📁', description: description || '', remote: remote || '' }, { force: !!force });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
        }
        return;
    }

    // API: clone context from a git remote
    if (pathname === '/api/contexts/clone' && req.method === 'POST') {
        try {
            const { remote, name, force } = await _core.readJsonBody(req);
            const id = cloneContext(remote, name, { force: !!force });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
        }
        return;
    }

    // API: read/update context settings
    const ctxMeetingTypesMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/meeting-types$/);
    if (ctxMeetingTypesMatch && req.method === 'GET') {
        const id = safeName(ctxMeetingTypesMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('[]'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes(id)));
        return;
    }
    if (ctxMeetingTypesMatch && req.method === 'PUT') {
        const id = safeName(ctxMeetingTypesMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'context not found' }));
            return;
        }
        try {
            const data = await _core.readJsonBody(req, []);
            if (!Array.isArray(data)) throw new Error('expected array');
            const seenKeys = new Set();
            const cleaned = data.map(t => {
                let key = (t && typeof t.key === 'string') ? t.key.trim() : '';
                const label = (t && typeof t.label === 'string') ? t.label.trim() : '';
                const icon = (t && typeof t.icon === 'string') ? t.icon.trim() : '';
                if (!label) return null;
                if (!key || seenKeys.has(key)) {
                    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                    key = base;
                    let n = 2;
                    while (seenKeys.has(key)) key = base + '-' + (n++);
                }
                seenKeys.add(key);
                const mins = parseInt(t && t.mins, 10);
                return { key, icon, label, mins: (mins > 0 && mins <= 600) ? mins : 60 };
            }).filter(Boolean);
            saveMeetingTypes(cleaned, id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, types: cleaned }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }

    const ctxSettingsMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/settings$/);
    if (ctxSettingsMatch && req.method === 'GET') {
        const id = safeName(ctxSettingsMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('{}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getContextSettings(id)));
        return;
    }
    if (ctxSettingsMatch && req.method === 'PUT') {
        const id = safeName(ctxSettingsMatch[1]);
        try {
            const data = await _core.readJsonBody(req);
            const force = !!data.__force;
            delete data.__force;
            setContextSettings(id, data, { force });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
        }
        return;
    }

    // API: commit pending changes in a context
    const ctxCommitMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/commit$/);
    if (ctxCommitMatch && req.method === 'POST') {
        const id = safeName(ctxCommitMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const { message = '' } = await _core.readJsonBody(req);
        const dir = path.join(CONTEXTS_DIR, id);
        gitInitIfNeeded(dir, getContextSettings(id).name || id);
        const result = gitCommitAll(dir, message || `Manuell commit (${new Date().toISOString()})`);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: git status for a context (dirty + last commit)
    const ctxStatusMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/git$/);
    if (ctxStatusMatch && req.method === 'GET') {
        const id = safeName(ctxStatusMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('{}'); return; }
        const dir = path.join(CONTEXTS_DIR, id);
        const isRepo = gitIsRepo(dir);
        const dirty = isRepo ? gitIsDirty(dir) : false;
        const last = isRepo ? gitLastCommit(dir) : null;
        const remote = isRepo ? gitGetRemote(dir) : null;
        const branch = isRepo ? gitCurrentBranch(dir) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ isRepo, dirty, last, remote, branch }));
        return;
    }

    // API: push a context's repo
    const ctxPushMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/push$/);
    if (ctxPushMatch && req.method === 'POST') {
        const id = safeName(ctxPushMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const dir = path.join(CONTEXTS_DIR, id);
        const result = gitPush(dir);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: pull a context's repo from origin
    const ctxPullMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/pull$/);
    if (ctxPullMatch && req.method === 'POST') {
        const id = safeName(ctxPullMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const dir = path.join(CONTEXTS_DIR, id);
        const result = gitPull(dir);
        _cacheInvalidateContext(id);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: list/preview/run data migrations for a context.
    // GET  → dry-run (preview what would change).
    // POST → actually run, with optional { quarantine, commit }.
    const ctxMigrateMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/migrations$/);
    if (ctxMigrateMatch && (req.method === 'GET' || req.method === 'POST')) {
        const id = safeName(ctxMigrateMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const runMigrate = (opts) => {
            const args = ['scripts/migrate-context.js', '--ctx', id, '--json'];
            if (opts.dryRun) args.push('--dry-run');
            if (opts.quarantine) args.push('--quarantine');
            if (opts.commit) args.push('--commit');
            if (opts.only && opts.only.length) args.push('--only', opts.only.join(','));
            try {
                const out = require('child_process').execFileSync(process.execPath, args, {
                    cwd: __dirname,
                    encoding: 'utf-8',
                    timeout: 120000,
                });
                let parsed = null;
                try { parsed = JSON.parse(out); } catch {}
                return parsed
                    ? Object.assign({ ok: true }, parsed)
                    : { ok: true, output: out };
            } catch (e) {
                return { ok: false, error: e.message, output: (e.stdout || '') + (e.stderr || '') };
            }
        };
        if (req.method === 'GET') {
            const r = runMigrate({ dryRun: true });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(r));
            return;
        }
        const opts = await _core.readJsonBody(req);
        const r = runMigrate({
            quarantine: !!opts.quarantine,
            commit: opts.commit !== false,
            only: Array.isArray(opts.only) ? opts.only : null,
        });
        _cacheInvalidateContext(id);
        res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
        return;
    }

    // API: get rendered note content
    };
};
