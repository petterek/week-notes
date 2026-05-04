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
    if (pathname === '/api/meeting-types' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes()));
        return;
    }
    if (pathname === '/api/meeting-types' && req.method === 'PUT') {
        try {
            const data = JSON.parse(await readBody(req) || '[]');
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
            saveMeetingTypes(cleaned);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, types: cleaned }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }

    if (pathname === '/api/meetings' && req.method === 'GET') {
        const sp = new URL('http://x' + req.url).searchParams;
        let meetings = loadMeetings();
        if (sp.get('week')) {
            const w = sp.get('week');
            meetings = meetings.filter(m => dateToIsoWeek(new Date(m.date + 'T00:00:00Z')) === w);
        }
        if (sp.get('upcoming')) {
            const days = parseInt(sp.get('upcoming'), 10) || 7;
            const now = new Date();
            const today = now.toISOString().slice(0, 10);
            const cutoff = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
            meetings = meetings.filter(m => m.date >= today && m.date <= cutoff);
        }
        meetings.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(meetings));
        return;
    }

    // API: create meeting
    if (pathname === '/api/meetings' && req.method === 'POST') {
        const data = JSON.parse(await readBody(req) || '{}');
        if (!data.date || !data.title) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'date and title required' }));
            return;
        }
        const meetings = loadMeetings();
        const validTypes = loadMeetingTypes().map(t => t.key);
        const m = {
            id: meetingId(),
            date: data.date,
            start: data.start || '',
            end: data.end || '',
            title: String(data.title).trim(),
            type: validTypes.includes(data.type) ? data.type : 'meeting',
            attendees: Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || ''),
            location: (data.location || '').trim(),
            placeKey: (data.placeKey || '').trim().toLowerCase(),
            notes: (data.notes || '').trim(),
            created: new Date().toISOString()
        };
        meetings.push(m);
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes, (m.attendees || []).map(a => '@' + a).join(' ')); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // API: update / delete meeting
    const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
    if (meetingMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const id = meetingMatch[1];
        const meetings = loadMeetings();
        const idx = meetings.findIndex(m => m.id === id);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
        }
        if (req.method === 'DELETE') {
            meetings.splice(idx, 1);
            saveMeetings(meetings);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        const data = JSON.parse(await readBody(req) || '{}');
        const m = meetings[idx];
        if (data.date !== undefined) m.date = data.date;
        if (data.start !== undefined) m.start = data.start;
        if (data.end !== undefined) m.end = data.end;
        if (data.title !== undefined) m.title = String(data.title).trim();
        if (data.type !== undefined && loadMeetingTypes().some(t => t.key === data.type)) m.type = data.type;
        if (data.attendees !== undefined) m.attendees = Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || '');
        if (data.location !== undefined) m.location = (data.location || '').trim();
        if (data.placeKey !== undefined) m.placeKey = (data.placeKey || '').trim().toLowerCase();
        if (data.notes !== undefined) m.notes = (data.notes || '').trim();
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes, (m.attendees || []).map(a => '@' + a).join(' ')); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    };
};
