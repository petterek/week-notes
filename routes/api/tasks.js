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
    if (pathname === '/api/tasks/merge' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const src = tasks.find(t => t.id === body.srcId);
        const tgt = tasks.find(t => t.id === body.tgtId);
        if (src && tgt) {
            const parts = [tgt.note, src.text, src.note].filter(Boolean);
            const mergedNote = parts.join('\n');
            syncTaskNote(tgt, mergedNote, tasks);
            const filtered = tasks.filter(t => t.id !== body.srcId);
            // Remove results for deleted src task
            saveResults(loadResults().filter(r => r.taskId !== body.srcId));
            saveTasks(filtered);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filtered));
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found' }));
        }
        return;
    }

    // API: reorder tasks
    if (pathname === '/api/tasks/reorder' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const ids = body.ids;
        const tasks = loadTasks();
        const ordered = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean);
        const rest = tasks.filter(t => !ids.includes(t.id));
        saveTasks([...ordered, ...rest]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    if (pathname === '/api/tasks' && req.method === 'GET') {
        const all = url.searchParams.get('all');
        const includeDeleted = all === '1' || all === 'true';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(includeDeleted ? loadAllTasks() : loadTasks()));
        return;
    }

    // API: add task
    if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const meKey = getMePersonKey(getActiveContext()) || '';
        const task = {
            id: Date.now().toString(36),
            text: body.text,
            done: false,
            created: new Date().toISOString(),
            week: body.week || getCurrentYearWeek(),
        };
        if (meKey) task.author = meKey;
        // Responsible defaults to author (@me); body may override with a
        // different person key. Empty string explicitly clears it.
        if (typeof body.responsible === 'string') {
            const r = body.responsible.trim();
            if (r) task.responsible = r;
        } else if (meKey) {
            task.responsible = meKey;
        }
        if (typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(body.dueDate.trim())) {
            task.dueDate = body.dueDate.trim();
        }
        tasks.push(task);
        saveTasks(tasks);
        syncMentions(body.text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: edit task text / note / responsible / dueDate
    const editTaskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (editTaskMatch && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const task = tasks.find(t => t.id === editTaskMatch[1]);
        if (task) {
            if (body.text) task.text = body.text.trim();
            if (typeof body.responsible === 'string') {
                const r = body.responsible.trim();
                if (r) task.responsible = r;
                else delete task.responsible;
            }
            if (typeof body.dueDate === 'string') {
                const d = body.dueDate.trim();
                if (!d) delete task.dueDate;
                else if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(d)) task.dueDate = d;
            } else if (body.dueDate === null) {
                delete task.dueDate;
            }
            if (body.note !== undefined) syncTaskNote(task, body.note, tasks);
            else syncMentions(task.text, task.note);
            saveTasks(tasks);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: toggle task
    const toggleMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/toggle$/);
    if (toggleMatch && req.method === 'PUT') {
        let comment = '';
        try {
            const body = JSON.parse(await readBody(req));
            comment = (body.comment || '').trim();
        } catch {}

        const tasks = loadTasks();
        const task = tasks.find(t => t.id === toggleMatch[1]);
        if (task) {
            task.done = !task.done;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            if (task.done) {
                task.completedAt = now.toISOString();
                task.completedWeek = getCurrentYearWeek();
                const meKey = getMePersonKey(getActiveContext());
                if (meKey) task.completedBy = meKey;
            } else {
                delete task.completedAt;
                delete task.completedWeek;
                delete task.completedBy;
            }
            if (task.done && comment) {
                const week = task.completedWeek || task.week || getCurrentYearWeek();
                const proc = processInlineResults(comment, week, { taskId: task.id, taskText: task.text });
                if (proc.createdCount > 0) {
                    syncMentions(task.text, comment);
                }
                const cleanComment = proc.text;
                const fileName = `oppgave-${task.id}.md`;
                fs.mkdirSync(path.join(dataDir(), week), { recursive: true });
                fs.writeFileSync(path.join(dataDir(), week, fileName),
                    `# ✅ ${task.text}\n\n${cleanComment}\n\n---\n*Fullført: ${dateStr}*\n`, 'utf-8');
                task.commentFile = `${week}/${fileName}`;
                const meTask = getMePersonKey(getActiveContext());
                const taskMeta = { type: 'task', created: now.toISOString() };
                if (meTask) { taskMeta.createdBy = meTask; taskMeta.lastSavedBy = meTask; }
                setNoteMeta(week, fileName, taskMeta);
            }
        }
        saveTasks(tasks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: close (or reopen) a task from a rendered note view, also
    // flipping the {{?<id>}} ↔ {{!<id>}} marker in the source note file
    // so the rendered checkbox state persists.
    const closeFromNoteMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/close-from-note$/);
    if (closeFromNoteMatch && req.method === 'POST') {
        const id = closeFromNoteMatch[1];
        let body = {};
        try { body = JSON.parse(await readBody(req)); } catch {}
        const wantDone = body.done !== undefined ? !!body.done : true;
        const comment = (typeof body.comment === 'string') ? body.comment.trim() : '';
        const tasks = loadTasks();
        const task = tasks.find(t => t.id === id);
        if (!task) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Task not found' }));
            return;
        }
        task.done = wantDone;
        if (wantDone) {
            task.completedAt = new Date().toISOString();
            task.completedWeek = getCurrentYearWeek();
            const meKey = getMePersonKey(getActiveContext());
            if (meKey) task.completedBy = meKey;
        } else {
            delete task.completedAt;
            delete task.completedWeek;
            delete task.completedBy;
        }
        // Optional completion comment: create the same oppgave-<id>.md
        // sidecar note as POST /api/tasks/:id/toggle does.
        if (wantDone && comment) {
            const week = task.completedWeek || task.week || getCurrentYearWeek();
            const proc = processInlineResults(comment, week, { taskId: task.id, taskText: task.text });
            if (proc.createdCount > 0) syncMentions(task.text, comment);
            const cleanComment = proc.text;
            const fileName = `oppgave-${task.id}.md`;
            const dateStr = new Date().toISOString().slice(0, 10);
            fs.mkdirSync(path.join(dataDir(), week), { recursive: true });
            fs.writeFileSync(path.join(dataDir(), week, fileName),
                `# ✅ ${task.text}\n\n${cleanComment}\n\n---\n*Fullført: ${dateStr}*\n`, 'utf-8');
            task.commentFile = `${week}/${fileName}`;
            const meKey = getMePersonKey(getActiveContext());
            const taskMeta = { type: 'task', created: new Date().toISOString() };
            if (meKey) { taskMeta.createdBy = meKey; taskMeta.lastSavedBy = meKey; }
            setNoteMeta(week, fileName, taskMeta);
        }
        saveTasks(tasks);
        // Flip the marker in the source file when noteRef is set.
        let noteUpdated = false;
        if (task.noteRef && /^[^/]+\/[^/]+\.md$/.test(task.noteRef)) {
            const filePath = path.join(dataDir(), task.noteRef);
            try {
                if (fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf-8');
                    const fromKind = wantDone ? '?' : '!';
                    const toKind = wantDone ? '!' : '?';
                    const re = new RegExp(`\\{\\{\\${fromKind}\\s*${id}\\s*\\}\\}`, 'g');
                    const next = content.replace(re, `{{${toKind}${id}}}`);
                    if (next !== content) {
                        fs.writeFileSync(filePath, next, 'utf-8');
                        noteUpdated = true;
                    }
                }
            } catch (e) { /* non-fatal */ }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, task, noteUpdated }));
        return;
    }
    const deleteMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        const all = loadAllTasks();
        const id = deleteMatch[1];
        const idx = all.findIndex(t => t.id === id);
        if (idx >= 0) {
            all[idx] = { ...all[idx], deleted: true, deletedAt: new Date().toISOString() };
            saveTasks(all);
        }
        // Remove results for deleted task
        saveResults(loadResults().filter(r => r.taskId !== id));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadTasks()));
        return;
    }
    };
};
