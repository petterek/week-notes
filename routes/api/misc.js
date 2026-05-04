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
    if (pathname === '/api/summarize' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { week } = body;
            if (!week || week.includes('/') || week.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig uke' }));
                return;
            }
            const summary = await summarizeWeek(week);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, summary }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: search md files
    if (pathname === '/api/search' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('[]');
            return;
        }
        try {
            const results = await searchViaWorker(q.trim());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) {
            // Last-ditch fallback to synchronous in-process search
            try {
                const results = searchAll(q.trim());
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        }
        return;
    }

    if (pathname === '/api/embed-search' && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
        if (!isEmbedReady()) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'embed-worker ikke klar' })); return; }
        try {
            const hits = await vectorSearchViaWorker(q);
            const results = hits.map(vectorHitToSearchResult).filter(Boolean);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // Per-machine identity: which person in the people register represents
    // the active user on THIS machine, per context. Stored in data/user.json
    // (outside any context's git repo), so multiple users sharing a context
    // each have their own "@me" mapping.
    if (pathname === '/api/me' && req.method === 'GET') {
        const ctx = getActiveContext();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, context: ctx, key: getMePersonKey(ctx) }));
        return;
    }
    if (pathname === '/api/me/all' && req.method === 'GET') {
        const active = getActiveContext();
        const mappings = listContexts().map(c => ({
            context: c,
            key: getMePersonKey(c),
            active: c === active,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, active, mappings }));
        return;
    }
    if (pathname === '/api/me' && req.method === 'PUT') {
        try {
            const body = JSON.parse(await readBody(req) || '{}');
            const ctx = getActiveContext();
            const saved = setMePersonKey(ctx, body.key || '');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, context: ctx, key: saved }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }

    // App-wide settings (currently just vector-search). Per-context settings
    // remain at /api/contexts/:id/settings.
    if (pathname === '/api/app-settings' && req.method === 'GET') {
        const annotateLocal = (m) => {
            const dir = path.join(__dirname, 'models', m.id.replace(/\//g, path.sep));
            let downloaded = false;
            try {
                downloaded = fs.existsSync(path.join(dir, 'onnx', 'model_quantized.onnx'))
                          || fs.existsSync(path.join(dir, 'onnx', 'model.onnx'));
            } catch {}
            return Object.assign({}, m, { downloaded });
        };
        const modelsAnnotated = EMBED_MODELS.map(annotateLocal);
        // Remote summarize entries are always "downloaded:true" (no-op).
        const summarizeModelsAnnotated = SUMMARIZE_MODELS.map(m =>
            m.remote ? Object.assign({}, m, { downloaded: true }) : annotateLocal(m)
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            settings: getAppSettings(),
            models: modelsAnnotated,
            summarizeModels: summarizeModelsAnnotated,
        }));
        return;
    }
    if (pathname.match(/^\/api\/app-settings\/models\/(.+)$/) && req.method === 'DELETE') {
        try {
            const modelId = decodeURIComponent(pathname.match(/^\/api\/app-settings\/models\/(.+)$/)[1]);
            const inEmbed = EMBED_MODELS.some(m => m.id === modelId);
            const inSummarize = SUMMARIZE_MODELS.some(m => m.id === modelId);
            if (!inEmbed && !inSummarize) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Ukjent modell' }));
                return;
            }
            if (isRemoteSummarizeModel(modelId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Ekstern modell kan ikke slettes.' }));
                return;
            }
            const settings = getAppSettings();
            if (inEmbed && settings.vectorSearch.enabled && settings.vectorSearch.model === modelId) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Kan ikke slette aktiv modell. Slå av først eller bytt modell.' }));
                return;
            }
            if (inSummarize && settings.summarization.enabled && settings.summarization.model === modelId) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Kan ikke slette aktiv modell. Slå av først eller bytt modell.' }));
                return;
            }
            const dir = path.join(__dirname, 'models', modelId.replace(/\//g, path.sep));
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.warn('rm model failed', e); }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }
    if (pathname === '/api/app-settings' && req.method === 'PUT') {
        try {
            const body = JSON.parse(await readBody(req) || '{}');
            const before = getAppSettings();
            const next = setAppSettings(body);
            const vsChanged = before.vectorSearch.enabled !== next.vectorSearch.enabled
                           || before.vectorSearch.model   !== next.vectorSearch.model;
            if (vsChanged) {
                if (next.vectorSearch.enabled) restartEmbedWorker();
                else { stopEmbedWorker(); embedEmit({ phase: 'disabled', model: next.vectorSearch.model, progress: null, error: null, docCount: 0 }); }
            }
            const siChanged = before.searchIndex.enabled !== next.searchIndex.enabled;
            if (siChanged) {
                if (next.searchIndex.enabled) restartSearchWorker();
                else stopSearchWorker();
            }
            const sumChanged = before.summarization.enabled !== next.summarization.enabled
                            || before.summarization.model   !== next.summarization.model;
            if (sumChanged) {
                if (next.summarization.enabled) restartSummarizeWorker();
                else { stopSummarizeWorker(); summarizeEmit({ phase: 'disabled', model: next.summarization.model, progress: null, error: null }); }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, settings: next }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }
    if (pathname === '/api/embed/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ ok: true }, embedState)));
        return;
    }
    if (pathname === '/api/summarize/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ ok: true }, summarizeState)));
        return;
    }
    if (pathname === '/api/summarize/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(summarizeState)}\n\n`);
        summarizeSseClients.add(res);
        const keepalive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 30000);
        const cleanup = () => { clearInterval(keepalive); summarizeSseClients.delete(res); };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }
    // Per-context index stats: read on-disk caches and report sizes.
    {
        const m = pathname.match(/^\/api\/contexts\/([^/]+)\/index-stats$/);
        if (m && req.method === 'GET') {
            const id = decodeURIComponent(m[1]);
            const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
            const ctxDir = path.join(CONTEXTS_DIR, safe);
            const cacheDir = path.join(ctxDir, '.cache');
            const readCache = (file) => {
                const p = path.join(cacheDir, file);
                try {
                    const st = fs.statSync(p);
                    let json = null;
                    try { json = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
                    return { exists: true, sizeBytes: st.size, mtime: st.mtimeMs, data: json };
                } catch {
                    return { exists: false };
                }
            };
            const search = readCache('search-index.json');
            const embed  = readCache('embeddings.json');
            const isActive = id === getActiveContext();
            const out = {
                ok: true,
                contextId: id,
                isActive,
                search: {
                    cacheExists: search.exists,
                    sizeBytes:   search.exists ? search.sizeBytes : 0,
                    mtime:       search.exists ? search.mtime : null,
                    docs:        search.exists && search.data && search.data.docs ? Object.keys(search.data.docs).length : null,
                    tokens:      search.exists && search.data && search.data.tokens ? Object.keys(search.data.tokens).length : null,
                    version:     search.exists && search.data ? search.data.version : null,
                },
                embed: {
                    cacheExists: embed.exists,
                    sizeBytes:   embed.exists ? embed.sizeBytes : 0,
                    mtime:       embed.exists ? embed.mtime : null,
                    docs:        embed.exists && embed.data && embed.data.entries ? Object.keys(embed.data.entries).length : null,
                    model:       embed.exists && embed.data ? embed.data.model || null : null,
                    dim:         embed.exists && embed.data ? embed.data.dim || null : null,
                },
                liveEmbed: isActive ? { phase: embedState.phase, docCount: embedState.docCount, model: embedState.model } : null,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
            return;
        }
    }
    // SSE: stream live embed-worker state (load progress, ready, errors).
    // The same payload as /api/embed/status is emitted on every change.
    if (pathname === '/api/embed/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(embedState)}\n\n`);
        embedSseClients.add(res);
        const keepalive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 30000);
        const cleanup = () => { clearInterval(keepalive); embedSseClients.delete(res); };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }


    // API: read autosave temp content for a note (for restore-prompt preview).
    // GET /api/save/autosave?folder=YYYY-WNN&file=foo.md
    if (pathname === '/api/save/autosave' && req.method === 'GET') {
        try {
            const folder = url.searchParams.get('folder') || '';
            const file = url.searchParams.get('file') || '';
            if (!folder || !file || file.includes('/') || file.includes('\\') || folder.includes('/') || folder.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig mappe eller filnavn' }));
                return;
            }
            const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
            const resolved = path.resolve(tmpPath);
            if (!resolved.startsWith(path.resolve(dataDir()))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }
            if (!fs.existsSync(tmpPath)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, exists: false }));
                return;
            }
            const stat = fs.statSync(tmpPath);
            const content = fs.readFileSync(tmpPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, exists: true, content, modified: stat.mtime.toISOString() }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Serverfeil: ' + e.message }));
        }
        return;
    }

    if (pathname === '/api/save/autosave' && req.method === 'DELETE') {
        try {
            const body = JSON.parse(await readBody(req) || '{}');
            const { folder, file } = body;
            if (!folder || !file || file.includes('/') || file.includes('\\') || folder.includes('/') || folder.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig mappe eller filnavn' }));
                return;
            }
            const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
            const resolved = path.resolve(tmpPath);
            if (!resolved.startsWith(path.resolve(dataDir()))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }
            let removed = false;
            try { if (fs.existsSync(tmpPath)) { fs.unlinkSync(tmpPath); removed = true; } } catch (_) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, removed }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Serverfeil: ' + e.message }));
        }
        return;
    }

    // API: save file
    if (pathname === '/api/save' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { folder, file: rawFile, content, append, type, presentationStyle, autosave, themes, tags, commit, createNew, title } = body;
            let file = rawFile;

            if (!folder || !file || typeof content !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Mangler mappe, filnavn eller innhold' }));
                return;
            }
            if (!file.endsWith('.md') || file.includes('/') || file.includes('\\') || folder.includes('/') || folder.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig mappe eller filnavn' }));
                return;
            }

            const dirPath = path.resolve(dataDir(), folder);
            if (!dirPath.startsWith(path.resolve(dataDir()))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }

            fs.mkdirSync(path.join(dataDir(), folder), { recursive: true });
            // When the client signals this is a brand new note (createNew),
            // dedupe the filename against existing files in the week by
            // appending "-2", "-3", … until we find a free slot. Skipped
            // for autosave (writes to a temp path) and for edits of an
            // existing note (which intentionally overwrite).
            if (createNew && !autosave && !append) {
                const base = file.replace(/\.md$/i, '');
                let candidate = file;
                let n = 2;
                while (fs.existsSync(path.join(dataDir(), folder, candidate))) {
                    candidate = `${base}-${n}.md`;
                    n++;
                    if (n > 9999) break;
                }
                file = candidate;
            }
            const filePath = path.join(dataDir(), folder, file);

            // On EXPLICIT save (not autosave), process inline-create markers:
            //   {{X}} → create a new task with text X
            //   [[X]] → create a new result with text X
            // Both have their markers stripped (inner text kept) before
            // the file is written, so the on-disk content is clean.
            let finalContent = content;
            let createdTasks = 0;
            let createdResults = 0;
            let closedTasks = 0;
            if (!autosave) {
                const noteWeek = (typeof folder === 'string' && /^\d{4}-W\d{2}$/.test(folder)) ? folder : getCurrentYearWeek();
                const inline = extractInlineTasks(finalContent);
                if (inline.tasks.length > 0) {
                    const allTasks = loadTasks();
                    const noteRef = `${folder}/${file}`;
                    const newIds = [];
                    inline.tasks.forEach(text => {
                        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                        allTasks.push({
                            id,
                            text,
                            done: false,
                            week: noteWeek,
                            noteRef,
                            created: new Date().toISOString(),
                        });
                        newIds.push(id);
                    });
                    saveTasks(allTasks);
                    createdTasks = inline.tasks.length;
                    // Rewrite each {{X}} marker (in order) to {{?<newId>}}
                    // so the saved file keeps a stable ref to the new task.
                    // Preserve the link so the note can render an interactive
                    // checkbox and close-from-note works.
                    let i = 0;
                    finalContent = finalContent.replace(/\{\{([^{}!?][^{}]*)\}\}/g, (m) => {
                        if (i >= newIds.length) return m;
                        return `{{?${newIds[i++]}}}`;
                    });
                }
                // Process '{{!<id>}}' close markers: close the matching open
                // task. The marker is left in the file so the rendered note
                // can show a checked checkbox with the task text, and so
                // close-from-note can flip {{?id}} → {{!id}} in place.
                {
                    const allTasks = loadTasks();
                    const re = /\{\{!\s*([^{}\s]+)\s*\}\}/g;
                    const seen = new Set();
                    let m;
                    while ((m = re.exec(finalContent)) !== null) {
                        const id = m[1];
                        const t = allTasks.find(x => x.id === id);
                        if (!t) continue;
                        if (!t.done) {
                            t.done = true;
                            t.completedWeek = noteWeek;
                            t.completedAt = new Date().toISOString();
                            const meKey = getMePersonKey(getActiveContext());
                            if (meKey) t.completedBy = meKey;
                            if (!seen.has(id)) { closedTasks++; seen.add(id); }
                        }
                    }
                    if (seen.size > 0) saveTasks(allTasks);
                }
                // Also close any open task whose text appears verbatim as
                // '~~<task text>~~' (e.g. user-typed strikethrough or the
                // already-substituted marker on a re-save). The marker is
                // left in place.
                {
                    const allTasks = loadTasks();
                    const openByText = allTasks.filter(t => !t.done && t.text);
                    if (openByText.length) {
                        let changed = false;
                        const nowIso = new Date().toISOString();
                        const meKey = getMePersonKey(getActiveContext());
                        for (const t of openByText) {
                            const marker = `~~${t.text}~~`;
                            if (finalContent.includes(marker)) {
                                t.done = true;
                                t.completedWeek = noteWeek;
                                t.completedAt = nowIso;
                                if (meKey) t.completedBy = meKey;
                                changed = true;
                                closedTasks++;
                            }
                        }
                        if (changed) saveTasks(allTasks);
                    }
                }
                const resOut = processInlineResults(finalContent, noteWeek);
                createdResults = resOut.createdCount;
                finalContent = resOut.text;
            }

            if (autosave) {
                // Autosave goes to a sibling temp file so the real note isn't
                // touched until the user explicitly saves. The temp file is
                // a hidden dotfile next to the real file: `.<file>.autosave`.
                const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
                fs.writeFileSync(tmpPath, finalContent, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, autosave: true, path: `/${folder}/${file}`, tmp: true }));
                return;
            }

            if (append && fs.existsSync(filePath)) {
                fs.appendFileSync(filePath, '\n\n' + finalContent, 'utf-8');
            } else {
                fs.writeFileSync(filePath, finalContent, 'utf-8');
            }
            // Reconcile task→note backrefs against the post-write content.
            // For append we need the merged file; for overwrite finalContent
            // is the same as on-disk. Using readFileSync covers both.
            try {
                const onDisk = fs.readFileSync(filePath, 'utf-8');
                syncTaskNoteRefs(`${folder}/${file}`, onDisk);
            } catch (_) {}
            // Remove any stale autosave temp file now that we've persisted.
            try {
                const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch (_) {}

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: `/${folder}/${file}`, file, folder, content: finalContent, createdTasks, createdResults, closedTasks }));

            const now = new Date().toISOString();
            const existing = getNoteMeta(folder, file);
            const saves = Array.isArray(existing.saves) ? existing.saves.slice() : [];
            const meKey = !autosave ? getMePersonKey(getActiveContext()) : '';
            if (!autosave) {
                const entry = { at: now };
                if (meKey) entry.by = meKey;
                try {
                    const repo = dataDir();
                    if (gitIsRepo(repo)) {
                        const sha = git(repo, 'rev-parse HEAD').trim();
                        if (sha) entry.sha = sha;
                    }
                } catch (_) {}
                saves.push(entry);
            }
            const updates = { type: type || existing.type || 'note', modified: now, saves };
            if (presentationStyle) updates.presentationStyle = presentationStyle;
            const incomingTags = Array.isArray(tags) ? tags : (Array.isArray(themes) ? themes : null);
            if (incomingTags) {
                const norm = incomingTags
                    .map(t => String(t || '').trim())
                    .filter(Boolean)
                    .filter((t, i, arr) => arr.indexOf(t) === i);
                updates.tags = norm;
                updates.themes = norm;
            }
            if (!existing.created) updates.created = now;
            // Pre-compute the plaintext snippet so the card endpoint can
            // serve it from the meta sidecar without reading the .md file.
            updates.snippet = noteSnippet(finalContent, 220);
            // Display title — original heading text as typed (preserves
            // æ/ø/å and other unicode the slugified filename loses).
            // Falls back to the first H1 in finalContent when the client
            // didn't supply one.
            let displayTitle = (typeof title === 'string') ? title.trim() : '';
            if (!displayTitle) {
                const m = String(finalContent || '').match(/^\s*#\s+(.+?)\s*$/m);
                if (m) displayTitle = m[1].trim();
            }
            if (displayTitle) updates.title = displayTitle;
            // Author tracking: createdBy is set once (first explicit save with
            // an identity), lastSavedBy updates on every explicit save. Both
            // hold the person key from data/user.json (per-context @me mapping).
            // Autosaves are not attributed.
            if (!autosave && meKey) {
                if (!existing.createdBy) updates.createdBy = meKey;
                updates.lastSavedBy = meKey;
            }
            // Cross-entity references — recomputed from finalContent on
            // each save so the sidecar always reflects what the note
            // currently links to. Meeting notes carry meetingId as a
            // first-class field; surface it here too for symmetry.
            const references = computeNoteReferences(finalContent);
            const meetingIdForRef = updates.meetingId || existing.meetingId;
            if (meetingIdForRef && !references.meetings.includes(meetingIdForRef)) {
                references.meetings = [meetingIdForRef, ...references.meetings];
            }
            updates.references = references;
            setNoteMeta(folder, file, updates);
            syncMentions(content);

            // Commit the note (and *every* sidecar / related entity file
            // touched by this save — git add -A sweeps the whole context
            // repo) to git so we keep history. Best-effort, never blocks
            // the response. Only runs when the client opted in (e.g. the
            // editor's "Ferdig" button / Ctrl+Enter); autosaves persist without
            // creating a commit so iterative editing doesn't pollute
            // history.
            if (commit) try {
                const repo = dataDir();
                // Lazy-write the .week-notes marker on first explicit save
                // (was previously written eagerly on context create/clone).
                if (!fs.existsSync(path.join(repo, WEEK_NOTES_MARKER))) writeMarker(repo);
                if (!gitIsRepo(repo)) gitInitIfNeeded(repo);
                if (gitIsRepo(repo)) {
                    // Ensure autosave dotfiles and the embed sidecar never end up in commits.
                    const giPath = path.join(repo, '.gitignore');
                    const want = ['.*.autosave', '.cache/'];
                    let cur = '';
                    try { cur = fs.readFileSync(giPath, 'utf-8'); } catch (_) {}
                    const have = new Set(cur.split(/\r?\n/).map(s => s.trim()));
                    const missing = want.filter(w => !have.has(w));
                    if (missing.length > 0) {
                        const next = (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + missing.join('\n') + '\n';
                        fs.writeFileSync(giPath, next, 'utf-8');
                    }
                    const action = (!existing.created) ? 'Opprett' : 'Oppdater';
                    const subject = `${action} ${folder}/${file}`;
                    gitCommitAll(repo, subject);
                }
            } catch (_) {}
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Serverfeil: ' + e.message }));
        }
        return;
    }
    };
};
