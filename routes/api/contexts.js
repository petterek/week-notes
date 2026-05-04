'use strict';
module.exports = function(deps) {
    const fs = require('fs');
    const path = require('path');
    const https = require('https');
    const crypto = require('crypto');
    const { execSync, execFileSync } = require('child_process');
    const { marked } = require('marked');
    const _core = deps.core;
    const __dirname = deps.rootDir;
    const _bound = Object.assign({}, _core);
    // Destructure lazily via getters so live bindings (e.g. embedState) work.
    // For simplicity destructure all.
    const { ACTIVE_FILE, APP_SETTINGS_FILE, CONTEXTS_DIR, CONTEXT_ICONS, CUSTOM_THEMES_DIR, DEFAULT_EMBED_MODEL, DEFAULT_MEETING_TYPES, DEFAULT_SUMMARIZE_MODEL, DISCONNECTED_FILE, EMBED_MODELS, PORT, SUMMARIZE_MODELS, THEMES, THEME_LABELS, THEME_VAR_NAMES, USER_FILE, WEEK_NOTES_MARKER, WEEK_NOTES_VERSION, _cacheGetCollection, _cacheInvalidateCollection, _cacheInvalidateContext, _cacheInvalidateNotesMeta, _cacheInvalidateSettings, _cacheSetCollection, _cloneArray, _ctxCache, _ctxCacheBucket, _ensureNotesMetaBucket, _loadWeekNotesMeta, _mdFilesCache, _noteContentCache, _statMtime, _weekDirsCache, buildEmbedDocs, checkExternalTools, clearTaskNoteRef, cloneContext, commentModalHtml, companiesFile, computeNoteReferences, contextSwitcherHtml, createContext, currentIsoWeek, currentReleaseTag, dataDir, dateToIsoWeek, deleteCustomTheme, deleteNoteMeta, disconnectContext, embedEmit, embedMeta, embedReady, embedReqSeq, embedSseClients, embedState, embedWorker, ensureAllContextsInitialised, entityDir, entityLegacyFile, escapeHtml, extractCloseMarkers, extractInlineTasks, extractMentions, extractNoteRelations, extractResults, extractTaskRefs, findTheme, forgetDisconnected, getActiveContext, getActiveTheme, getAppSettings, getCalendarActivity, getContextSettings, getContextThemes, getCurrentYearWeek, getDefaultMeetingMinutes, getGhToken, getMdFiles, getMePersonKey, getNoteMeta, getUpcomingMeetingsDays, getUser, getWeekDirs, getWorkHours, git, gitCommitAll, gitCurrentBranch, gitGetRemote, gitInitIfNeeded, gitIsDirty, gitIsRepo, gitLastCommit, gitPull, gitPullInitial, gitPush, gitRemoteHasFile, iconPickerHtml, isEmbedReady, isRemoteSummarizeModel, isValidThemeId, isoToLocalDateTime, isoWeekMonday, isoWeekToDateRange, itemStem, linkMentions, listAllThemes, listBuiltinThemes, listContexts, listCustomThemes, loadAllCompanies, loadAllPeople, loadAllPlaces, loadAllTasks, loadCollection, loadCompanies, loadDisconnected, loadMeetingTypes, loadMeetings, loadNotesMeta, loadPeople, loadPlaces, loadResults, loadTasks, meetingId, meetingTypeIcon, meetingTypeLabel, meetingTypesFile, meetingsFile, navLinksHtml, navbarHtml, noteModalHtml, noteSnippet, noteSnippetCached, notesMetaDir, notesMetaFile, notesMetaSidecarPath, pageHtml, parseThemeCss, pendingEmbed, pendingSearches, pendingSummarize, peopleFile, placesFile, preTaskMarkers, presentationPageHtml, presentationStyleCss, processInlineResults, pullContextRemote, readBody, readBuiltinTheme, readCustomTheme, readJsonDirAll, readMarker, readNoteCached, rebuildTaskNoteRefs, reindexEmbeddings, reindexSearch, restartEmbedWorker, restartSearchWorker, restartSummarizeWorker, resultsFile, safeName, safeThemeId, sanitizeItemFilename, saveCompanies, saveDisconnected, saveMeetingTypes, saveMeetings, saveNotesMeta, savePeople, savePlaces, saveResults, saveTasks, searchAll, searchMdFiles, searchReqSeq, searchSnippet, searchViaWorker, searchWorker, setActiveContext, setAppSettings, setContextSettings, setMePersonKey, setNoteMeta, shiftIsoWeek, startEmbedWorker, startSearchWorker, startSummarizeWorker, stopEmbedWorker, stopSearchWorker, stopSummarizeWorker, summarizeEmit, summarizeReady, summarizeReqSeq, summarizeSseClients, summarizeState, summarizeViaLocalWorker, summarizeWeek, summarizeWorker, syncCollection, syncMentions, syncTaskNote, syncTaskNoteRefs, tasksFile, themeCssFor, uniqueThemeId, vectorHitToSearchResult, vectorSearchViaWorker, writeCustomTheme, writeMarker } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/contexts' && req.method === 'GET') {
        const active = getActiveContext();
        const list = listContexts().map(name => ({
            id: name,
            active: name === active,
            settings: getContextSettings(name)
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
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
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { id } = JSON.parse(body || '{}');
                // Fast path: just commit current and flip the .active pointer.
                // The git pull and the search reindex run in the background.
                const next = setActiveContext(id, { skipPull: true });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, active: next }));
                setImmediate(() => {
                    try { pullContextRemote(next); } catch (e) { console.error('bg pull', e.message); }
                    try { rebuildTaskNoteRefs(); } catch (e) { console.error('rebuildTaskNoteRefs', e.message); }
                    reindexSearch();
                    if (getAppSettings().vectorSearch.enabled) restartEmbedWorker();
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    // API: create new context
    if (pathname === '/api/contexts' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { name, icon, description, remote, force } = JSON.parse(body || '{}');
                if (!name) throw new Error('Mangler navn');
                const id = createContext(name, { name, icon: icon || '📁', description: description || '', remote: remote || '' }, { force: !!force });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
            }
        });
        return;
    }

    // API: clone context from a git remote
    if (pathname === '/api/contexts/clone' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { remote, name, force } = JSON.parse(body || '{}');
                const id = cloneContext(remote, name, { force: !!force });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
            }
        });
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
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '[]');
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
        });
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
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                const force = !!data.__force;
                delete data.__force;
                setContextSettings(id, data, { force });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
            }
        });
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
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            const dir = path.join(CONTEXTS_DIR, id);
            gitInitIfNeeded(dir, getContextSettings(id).name || id);
            let message = '';
            try { message = JSON.parse(body || '{}').message || ''; } catch {}
            const result = gitCommitAll(dir, message || `Manuell commit (${new Date().toISOString()})`);
            res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
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
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let opts = {};
            try { opts = JSON.parse(body || '{}'); } catch {}
            const r = runMigrate({
                quarantine: !!opts.quarantine,
                commit: opts.commit !== false,
                only: Array.isArray(opts.only) ? opts.only : null,
            });
            // Migrations rewrite the on-disk shape — drop everything
            // we cached for this context so subsequent reads pick up
            // the new layout.
            _cacheInvalidateContext(id);
            res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(r));
        });
        return;
    }

    // API: get rendered note content
    };
};
