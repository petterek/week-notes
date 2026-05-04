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
    const noteViewMatch = pathname.match(/^\/api\/notes\/([^/]+)\/([^/]+)\/render$/);
    if (noteViewMatch && req.method === 'GET') {
        const week = decodeURIComponent(noteViewMatch[1]);
        const file = decodeURIComponent(noteViewMatch[2]);
        const filePath = path.join(dataDir(), week, file);
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const html = linkMentions(marked(preTaskMarkers(raw)));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, html, name: file.replace(/\.md$/, ''), week }));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        }
        return;
    }

    // API: update person

    const metaMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/meta$/);
    if (metaMatch && req.method === 'GET') {
        const [, week, file] = metaMatch;
        const meta = getNoteMeta(week, decodeURIComponent(file));
        const metaTags = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(meta.themes) ? meta.themes : []);
        const merged = { ...meta, tags: metaTags, themes: metaTags };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(merged));
        return;
    }

    // API: git history for a single note. Returns a list of commits that
    // touched the file, newest first.
    const historyMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/history$/);
    if (historyMatch && req.method === 'GET') {
        const [, week, fileEnc] = historyMatch;
        const file = decodeURIComponent(fileEnc);
        if (!/^\d{4}-W\d{2}$/.test(week) || !/^[^/\\]+\.md$/.test(file)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ugyldig uke eller filnavn' }));
            return;
        }
        const repo = dataDir();
        if (!gitIsRepo(repo)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
        }
        const rel = `${week}/${file}`;
        try {
            const out = git(repo, `log --format=%H%x09%cI%x09%an%x09%s -- "${rel.replace(/"/g, '\\"')}"`).trim();
            const items = out ? out.split('\n').map(line => {
                const [hash, iso, author, ...rest] = line.split('\t');
                return { hash, shortHash: hash.slice(0, 7), date: iso, author, subject: rest.join('\t') };
            }) : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(items));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: file content at a specific commit.
    const showMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/at\/([0-9a-f]{4,40})$/);
    if (showMatch && req.method === 'GET') {
        const [, week, fileEnc, hash] = showMatch;
        const file = decodeURIComponent(fileEnc);
        if (!/^\d{4}-W\d{2}$/.test(week) || !/^[^/\\]+\.md$/.test(file)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ugyldig uke eller filnavn' }));
            return;
        }
        const repo = dataDir();
        if (!gitIsRepo(repo)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ingen git-historikk' }));
            return;
        }
        const rel = `${week}/${file}`;
        try {
            const content = git(repo, `show ${hash}:"${rel.replace(/"/g, '\\"')}"`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ hash, path: rel, content }));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Fant ikke denne versjonen' }));
        }
        return;
    }

    // API: list weeks that have content (notes / results / completed tasks)
    if (pathname === '/api/weeks' && req.method === 'GET') {
        let dirWeeks = [];
        try {
            dirWeeks = fs.readdirSync(dataDir(), { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-W\d{2}$/.test(d.name))
                .map(d => d.name);
        } catch {}
        const tasks = loadTasks();
        const results = loadResults();
        const taskWeeks = new Set();
        tasks.forEach(t => { if (t.week) taskWeeks.add(t.week); });
        const all = new Set([...dirWeeks, ...taskWeeks]);
        const out = [];
        all.forEach(w => {
            const files = getMdFiles(w).filter(f => f !== 'summarize.md');
            const hasResults = results.some(r => r.week === w);
            const hasCompleted = tasks.some(t => t.done && (t.completedWeek || t.week) === w);
            if (files.length === 0 && !hasResults && !hasCompleted) return;
            out.push(w);
        });
        out.sort((a, b) => b.localeCompare(a));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
    }

    // API: aggregate index of every note across every week, metadata only.
    // Used by /notes page for filtering by type/themes/date.
    if (pathname === '/api/notes/themes' && req.method === 'GET') {
        const themes = getContextThemes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(themes));
        return;
    }
    if (pathname === '/api/notes' && req.method === 'GET') {
        let weekDirs = [];
        try {
            weekDirs = fs.readdirSync(dataDir(), { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-W\d{2}$/.test(d.name))
                .map(d => d.name);
        } catch {}
        const out = [];
        const _bucket = _ctxCacheBucket(getActiveContext());
        for (const week of weekDirs) {
            const files = getMdFiles(week).filter(f => f !== 'summarize.md');
            if (_bucket) _loadWeekNotesMeta(week, _bucket);
            for (const file of files) {
                const meta = getNoteMeta(week, file);
                const tagsArr = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(meta.themes) ? meta.themes : []);
                out.push({
                    week,
                    file,
                    name: file.replace(/\.md$/, ''),
                    type: meta.type || 'note',
                    pinned: !!meta.pinned,
                    tags: tagsArr,
                    themes: tagsArr,
                    created: meta.created || '',
                    modified: meta.modified || '',
                });
            }
        }
        // Newest week first, then by created/modified desc, then by file name.
        out.sort((a, b) => {
            if (a.week !== b.week) return b.week.localeCompare(a.week);
            const ad = a.modified || a.created;
            const bd = b.modified || b.created;
            if (ad && bd && ad !== bd) return bd.localeCompare(ad);
            if (ad && !bd) return -1;
            if (!ad && bd) return 1;
            return a.file.localeCompare(b.file);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
    }

    // API: week summary used by <week-section>
    const weekInfoMatch = pathname.match(/^\/api\/week\/([^/]+)$/);
    if (weekInfoMatch && req.method === 'GET') {
        const week = weekInfoMatch[1];
        const files = getMdFiles(week);
        const hasSummary = files.includes('summarize.md');
        const _bucket = _ctxCacheBucket(getActiveContext());
        if (_bucket) _loadWeekNotesMeta(week, _bucket);
        const noteFiles = files.filter(f => f !== 'summarize.md').map(f => {
            const m = getNoteMeta(week, f);
            return { file: f, pinned: !!m.pinned, created: m.created || '' };
        });
        noteFiles.sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            if (a.created && b.created) return b.created.localeCompare(a.created);
            if (a.created) return -1;
            if (b.created) return 1;
            return b.file.localeCompare(a.file);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            week,
            weekNum: (week.split('-')[1] || ''),
            dateRange: isoWeekToDateRange(week),
            notes: noteFiles,
            hasSummary,
        }));
        return;
    }

    // API: note card data (name, type, pinned, presentationStyle, snippet HTML)
    // Reads from the meta sidecar only — `snippet` (plaintext) and `title`
    // (H1 heading) are recomputed and persisted on every save. For old notes
    // whose sidecar predates these fields, lazily compute + persist on first
    // read.
    const cardMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/card$/);
    if (cardMatch && req.method === 'GET') {
        const [, week, fileEnc] = cardMatch;
        const file = decodeURIComponent(fileEnc);
        const meta = getNoteMeta(week, file);
        let snippetText = (typeof meta.snippet === 'string') ? meta.snippet : null;
        let titleText = (typeof meta.title === 'string' && meta.title) ? meta.title : null;
        if (snippetText == null || titleText == null) {
            const entry = readNoteCached(week, file);
            if (!entry) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }
            const lazy = {};
            if (snippetText == null) {
                snippetText = noteSnippet(entry.raw, 220);
                lazy.snippet = snippetText;
            }
            if (titleText == null) {
                const m = String(entry.raw || '').match(/^\s*#\s+(.+?)\s*$/m);
                if (m) {
                    titleText = m[1].trim();
                    lazy.title = titleText;
                }
            }
            if (Object.keys(lazy).length) {
                try { setNoteMeta(week, file, lazy); } catch (_) {}
            }
        }
        const name = file.replace(/\.md$/, '');
        const snippet = linkMentions(escapeHtml(snippetText || ''));
        const cardTags = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(meta.themes) ? meta.themes : []);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            week, file, name,
            title: titleText || '',
            type: meta.type || 'note',
            pinned: !!meta.pinned,
            presentationStyle: meta.presentationStyle || null,
            tags: cardTags,
            themes: cardTags,
            snippet,
        }));
        return;
    }

    // API: toggle pin
    const pinMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/pin$/);
    if (pinMatch && req.method === 'PUT') {
        const [, week, file] = pinMatch;
        const existing = getNoteMeta(week, decodeURIComponent(file));
        setNoteMeta(week, decodeURIComponent(file), { pinned: !existing.pinned });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pinned: !existing.pinned }));
        return;
    }

    // API: get raw note content
    const rawNoteMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/raw$/);
    if (rawNoteMatch && req.method === 'GET') {
        const [, week, file] = rawNoteMatch;
        const fileName = decodeURIComponent(file);
        const filePath = path.join(dataDir(), week, fileName);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403); res.end('Forbidden'); return;
        }
        const entry = readNoteCached(week, fileName);
        if (entry) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(entry.raw);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Filen finnes ikke' }));
        }
        return;
    }

    // API: delete note
    const deleteNoteMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)$/);
    if (deleteNoteMatch && req.method === 'DELETE') {
        const [, week, file] = deleteNoteMatch;
        const decoded = decodeURIComponent(file);
        const filePath = path.join(dataDir(), week, decoded);
        try {
            fs.unlinkSync(filePath);
            deleteNoteMeta(week, decoded);
            clearTaskNoteRef(`${week}/${decoded}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Filen finnes ikke' }));
        }
        return;
    }

    };
};
