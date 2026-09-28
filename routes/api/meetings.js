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
    const { ACTIVE_FILE, APP_SETTINGS_FILE, CONTEXTS_DIR, CONTEXT_ICONS, CUSTOM_THEMES_DIR, DEFAULT_EMBED_MODEL, DEFAULT_MEETING_TYPES, DEFAULT_SUMMARIZE_MODEL, DISCONNECTED_FILE, EMBED_MODELS, PORT, SUMMARIZE_MODELS, THEMES, THEME_LABELS, THEME_VAR_NAMES, USER_FILE, WEEK_NOTES_MARKER, WEEK_NOTES_VERSION, _cacheGetCollection, _cacheInvalidateCollection, _cacheInvalidateContext, _cacheInvalidateNotesMeta, _cacheInvalidateSettings, _cacheSetCollection, _cloneArray, _ctxCache, _ctxCacheBucket, _ensureNotesMetaBucket, _loadWeekNotesMeta, _mdFilesCache, _noteContentCache, _statMtime, _weekDirsCache, buildEmbedDocs, checkExternalTools, clearTaskNoteRef, cloneContext, commentModalHtml, companiesFile, computeNoteReferences, contextSwitcherHtml, createContext, currentIsoWeek, currentReleaseTag, dataDir, dateToIsoWeek, deleteCustomTheme, deleteNoteMeta, disconnectContext, embedEmit, embedMeta, embedReady, embedReqSeq, embedSseClients, embedState, embedWorker, ensureAllContextsInitialised, entityDir, entityLegacyFile, escapeHtml, extractCloseMarkers, extractInlineTasks, extractMentions, extractNoteRelations, extractResults, extractTaskRefs, findTheme, forgetDisconnected, getActiveContext, getActiveTheme, getAppSettings, getCalendarActivity, getContextSettings, getContextThemes, getCurrentYearWeek, getDefaultMeetingMinutes, getGhToken, getMdFiles, getMePersonKey, getNoteMeta, getUpcomingMeetingsDays, getUser, getWeekDirs, getWorkHours, git, gitCommitAll, gitCurrentBranch, gitGetRemote, gitInitIfNeeded, gitIsDirty, gitIsRepo, gitLastCommit, gitPull, gitPullInitial, gitPush, gitRemoteHasFile, iconPickerHtml, isEmbedReady, isRemoteSummarizeModel, isValidThemeId, isoToLocalDateTime, isoWeekMonday, isoWeekToDateRange, itemStem, linkMentions, listAllThemes, listBuiltinThemes, listContexts, listCustomThemes, loadAllCompanies, loadAllPeople, loadAllPlaces, loadAllTasks, loadCollection, loadCompanies, loadDisconnected, loadMeetingTypes, loadMeetings, loadMeetingsForContext, loadMeetingSeries, saveMeetingSeries, loadNotesMeta, loadPeople, loadPlaces, loadResults, loadTasks, meetingId, meetingSeriesId, agendaItemId, decisionId, meetingTypeIcon, meetingTypeLabel, meetingTypesFile, meetingsFile, navLinksHtml, navbarHtml, noteModalHtml, noteSnippet, noteSnippetCached, notesMetaDir, notesMetaFile, notesMetaSidecarPath, pageHtml, parseThemeCss, pendingEmbed, pendingSearches, pendingSummarize, peopleFile, placesFile, preTaskMarkers, presentationPageHtml, presentationStyleCss, processInlineResults, pullContextRemote, readBody, readBuiltinTheme, readCustomTheme, readJsonDirAll, readMarker, readNoteCached, rebuildTaskNoteRefs, reindexEmbeddings, reindexSearch, restartEmbedWorker, restartSearchWorker, restartSummarizeWorker, resultsFile, safeName, safeThemeId, sanitizeItemFilename, saveCompanies, saveDisconnected, saveMeetingTypes, saveMeetings, saveNotesMeta, savePeople, savePlaces, saveResults, saveTasks, searchAll, searchMdFiles, searchReqSeq, searchSnippet, searchViaWorker, searchWorker, setActiveContext, setAppSettings, setContextSettings, setMePersonKey, setNoteMeta, shiftIsoWeek, startEmbedWorker, startSearchWorker, startSummarizeWorker, stopEmbedWorker, stopSearchWorker, stopSummarizeWorker, summarizeEmit, summarizeReady, summarizeReqSeq, summarizeSseClients, summarizeState, summarizeViaLocalWorker, summarizeWeek, summarizeWorker, syncCollection, syncMentions, syncTaskNote, syncTaskNoteRefs, tasksFile, themeCssFor, uniqueThemeId, vectorHitToSearchResult, vectorSearchViaWorker, writeCustomTheme, writeMarker } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/meeting-types' && req.method === 'GET') {
        const ctx = _core.getActiveContextFromReq(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes(ctx)));
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
        const allCtx = sp.get('allContexts') === '1';

        let meetings;
        if (allCtx) {
            // Check if cross-context calendar is enabled
            const appSettings = getAppSettings();
            if (!appSettings.crossContextCalendar || !appSettings.crossContextCalendar.enabled) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Cross-context calendar is disabled' }));
                return;
            }
            const ctxIds = listContexts();
            const activeCtx = getActiveContext();
            meetings = [];
            for (const ctxId of ctxIds) {
                const s = getContextSettings(ctxId);
                const ctxMeetings = loadMeetingsForContext(ctxId);
                for (const m of ctxMeetings) {
                    m._ctx = ctxId;
                    m._ctxName = s.name || ctxId;
                    m._ctxIcon = s.icon || '📁';
                    m._ctxColor = s.color || '';
                    m._ctxActive = ctxId === activeCtx;
                }
                meetings.push(...ctxMeetings);
            }
        } else {
            meetings = loadMeetings();
        }

        if (sp.get('week')) {
            const w = sp.get('week');
            const wMon = isoWeekMonday(w);
            if (wMon) {
                const monStr = wMon.toISOString().slice(0, 10);
                const sun = new Date(wMon);
                sun.setUTCDate(wMon.getUTCDate() + 6);
                const sunStr = sun.toISOString().slice(0, 10);
                meetings = meetings.filter(m => {
                    const mEnd = m.endDate || m.date;
                    return m.date <= sunStr && mEnd >= monStr;
                });
            } else {
                meetings = meetings.filter(m => dateToIsoWeek(new Date(m.date + 'T00:00:00Z')) === w);
            }
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
        if (!data.date || (!data.title && !data.seriesId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'date and title required' }));
            return;
        }
        if (data.start && data.end) {
            // Compare full datetimes for multi-day meetings
            const startDt = (data.date || '') + ' ' + data.start;
            const endDt = (data.endDate || data.date || '') + ' ' + data.end;
            if (endDt <= startDt) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Sluttid må være etter starttid' }));
                return;
            }
        }
        const meetings = loadMeetings();
        const validTypes = loadMeetingTypes().map(t => t.key);
        let series = null;
        if (data.seriesId) {
            series = loadMeetingSeries().find(s => s.id === data.seriesId);
            if (!series) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'invalid seriesId' }));
                return;
            }
        }
        let type = 'meeting';
        if (validTypes.includes(data.type)) type = data.type;
        else if (series && validTypes.includes(series.defaultType)) type = series.defaultType;
        let attendees;
        if (Array.isArray(data.attendees)) attendees = data.attendees;
        else if (typeof data.attendees === 'string' && data.attendees) attendees = extractMentions(data.attendees);
        else attendees = series ? (series.defaultAttendees || []) : [];
        const location = (data.location !== undefined ? data.location : (series ? series.defaultLocation : '')) || '';
        const placeKey = (data.placeKey !== undefined ? data.placeKey : (series ? series.defaultPlaceKey : '')) || '';
        const m = {
            id: meetingId(),
            date: data.date,
            start: data.start || '',
            end: data.end || '',
            title: String(data.title || (series ? series.title : '')).trim(),
            type,
            attendees,
            location: location.trim(),
            placeKey: placeKey.trim().toLowerCase(),
            notes: (data.notes || '').trim(),
            noteRef: /^[^/]+\/[^/]+\.md$/.test(data.noteRef || '') ? data.noteRef.trim() : '',
            created: new Date().toISOString()
        };
        if (data.endDate && data.endDate !== data.date) m.endDate = data.endDate;
        if (series) {
            m.seriesId = series.id;
            m.status = 'planned';
            m.minutes = '';
            m.decisions = [];
            // Agenda population: auto-include every queued item (carried-forward
            // deferred items included), snapshotting the title so later series
            // edits/deletes don't change historical minutes. Editable up until
            // the occurrence is started/closed.
            const queued = (series.agendaItems || []).filter(a => a.state === 'queued');
            m.agenda = queued.map((a, idx) => ({ agendaItemId: a.id, title: a.title, order: idx, notes: '', outcome: null }));
        }
        if (!m.title) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'title required' }));
            return;
        }
        meetings.push(m);
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // API: fetch a single occurrence (used by the meeting-occurrence workspace page)
    const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
    if (meetingMatch && req.method === 'GET') {
        const m = loadMeetings().find(x => x.id === meetingMatch[1]);
        if (!m) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(m));
        return;
    }

    // ---- Series occurrence lifecycle: planned -> in-progress -> closed ----
    // Lifecycle actions only apply to occurrences that belong to a series
    // (m.seriesId set); standalone meetings have no `status` and are
    // unaffected. Closing syncs each agenda entry's outcome back onto the
    // series' persistent agendaItems (resolved/cancelled leave the queue,
    // deferred — including auto-deferred still-open items — re-enters it).
    function syncAgendaOutcomeToSeries(m, entry) {
        if (!m.seriesId) return;
        const series = loadMeetingSeries();
        const s = series.find(x => x.id === m.seriesId);
        if (!s || !Array.isArray(s.agendaItems)) return;
        const item = s.agendaItems.find(a => a.id === entry.agendaItemId);
        if (!item) return;
        if (entry.outcome === 'resolved') item.state = 'resolved';
        else if (entry.outcome === 'cancelled') item.state = 'cancelled';
        else item.state = 'queued'; // deferred, or outcome cleared back to open
        item.updatedAt = new Date().toISOString();
        s.updated = new Date().toISOString();
        saveMeetingSeries(series);
    }

    const startMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/start$/);
    if (startMatch && req.method === 'POST') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === startMatch[1]);
        if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        if (!m.seriesId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not a series occurrence' })); return; }
        if (m.status === 'closed') { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'already closed — reopen first' })); return; }
        m.status = 'in-progress';
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    const closeMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/close$/);
    if (closeMatch && req.method === 'POST') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === closeMatch[1]);
        if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        if (!m.seriesId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not a series occurrence' })); return; }
        if (m.status === 'closed') { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'already closed' })); return; }
        if (Array.isArray(m.agenda)) {
            for (const entry of m.agenda) {
                if (!entry.outcome) entry.outcome = 'deferred'; // confirm_auto_defer
                syncAgendaOutcomeToSeries(m, entry);
            }
        }
        m.status = 'closed';
        m.closedAt = new Date().toISOString();
        m.updated = m.closedAt;
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    const reopenMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/reopen$/);
    if (reopenMatch && req.method === 'POST') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === reopenMatch[1]);
        if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        if (!m.seriesId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not a series occurrence' })); return; }
        if (m.status !== 'closed') { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not closed' })); return; }
        m.status = 'in-progress';
        delete m.closedAt;
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // Add an ad-hoc agenda item mid-meeting. Also creates the item on the
    // series so it becomes part of the persistent thread (and can carry
    // forward if deferred).
    const agendaAddMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/agenda$/);
    if (agendaAddMatch && req.method === 'POST') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === agendaAddMatch[1]);
        if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        if (!m.seriesId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not a series occurrence' })); return; }
        const data = JSON.parse(await readBody(req) || '{}');
        const title = String(data.title || '').trim();
        if (!title) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'title required' })); return; }
        const series = loadMeetingSeries();
        const s = series.find(x => x.id === m.seriesId);
        if (!s) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'series not found' })); return; }
        if (!Array.isArray(s.agendaItems)) s.agendaItems = [];
        const item = { id: agendaItemId(), title, state: 'queued', order: s.agendaItems.length, createdAt: new Date().toISOString() };
        s.agendaItems.push(item);
        s.updated = new Date().toISOString();
        saveMeetingSeries(series);
        if (!Array.isArray(m.agenda)) m.agenda = [];
        m.agenda.push({ agendaItemId: item.id, title: item.title, order: m.agenda.length, notes: '', outcome: null });
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // Update one occurrence's agenda entry (notes and/or outcome).
    const agendaEntryMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/agenda\/([^/]+)$/);
    if (agendaEntryMatch && req.method === 'PUT') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === agendaEntryMatch[1]);
        if (!m || !Array.isArray(m.agenda)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        const entry = m.agenda.find(a => a.agendaItemId === agendaEntryMatch[2]);
        if (!entry) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'agenda entry not found' })); return; }
        const data = JSON.parse(await readBody(req) || '{}');
        if (data.notes !== undefined) entry.notes = String(data.notes || '');
        if (data.outcome !== undefined) {
            entry.outcome = (data.outcome === null || data.outcome === '') ? null
                : (['resolved', 'deferred', 'cancelled'].includes(data.outcome) ? data.outcome : entry.outcome);
            syncAgendaOutcomeToSeries(m, entry);
        }
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // Decisions: immutable per-occurrence log (add + correction-delete only).
    const decisionsCollMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/decisions$/);
    if (decisionsCollMatch && req.method === 'POST') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === decisionsCollMatch[1]);
        if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        const data = JSON.parse(await readBody(req) || '{}');
        const text = String(data.text || '').trim();
        if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'text required' })); return; }
        if (!Array.isArray(m.decisions)) m.decisions = [];
        const d = { id: decisionId(), text, createdAt: new Date().toISOString() };
        m.decisions.push(d);
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, decision: d, meeting: m }));
        return;
    }

    const decisionItemMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/decisions\/([^/]+)$/);
    if (decisionItemMatch && req.method === 'DELETE') {
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === decisionItemMatch[1]);
        if (!m || !Array.isArray(m.decisions)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        const idx = m.decisions.findIndex(d => d.id === decisionItemMatch[2]);
        if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'decision not found' })); return; }
        m.decisions.splice(idx, 1);
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: update / delete meeting
    const meetingEditMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
    if (meetingEditMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const id = meetingEditMatch[1];
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
            // Cascade: dangling references to this specific occurrence no
            // longer make sense (the series and its agenda items are
            // untouched, so meetingSeriesId/agendaItemId stay valid).
            const tasks = loadTasks();
            let tasksDirty = false;
            tasks.forEach(t => { if (t.meetingId === id) { delete t.meetingId; tasksDirty = true; } });
            if (tasksDirty) saveTasks(tasks);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        const data = JSON.parse(await readBody(req) || '{}');
        const m = meetings[idx];
        // Validate end > start (compare full datetimes for multi-day support)
        const effDate = data.date !== undefined ? data.date : m.date;
        const effStart = data.start !== undefined ? data.start : m.start;
        const effEnd = data.end !== undefined ? data.end : m.end;
        const effEndDate = data.endDate !== undefined ? data.endDate : (m.endDate || effDate);
        if (effStart && effEnd) {
            const startDt = (effDate || '') + ' ' + effStart;
            const endDt = (effEndDate || effDate || '') + ' ' + effEnd;
            if (endDt <= startDt) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Sluttid må være etter starttid' }));
                return;
            }
        }
        if (data.date !== undefined) m.date = data.date;
        if (data.start !== undefined) m.start = data.start;
        if (data.end !== undefined) m.end = data.end;
        if (data.endDate !== undefined) {
            if (data.endDate && data.endDate !== m.date) m.endDate = data.endDate;
            else delete m.endDate;
        }
        if (data.title !== undefined) m.title = String(data.title).trim();
        if (data.type !== undefined && loadMeetingTypes().some(t => t.key === data.type)) m.type = data.type;
        if (data.attendees !== undefined) m.attendees = Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || '');
        if (data.location !== undefined) m.location = (data.location || '').trim();
        if (data.placeKey !== undefined) m.placeKey = (data.placeKey || '').trim().toLowerCase();
        if (data.notes !== undefined) m.notes = (data.notes || '').trim();
        if (data.noteRef !== undefined) m.noteRef = /^[^/]+\/[^/]+\.md$/.test(data.noteRef || '') ? data.noteRef.trim() : '';
        if (data.minutes !== undefined) m.minutes = String(data.minutes || '');
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    };
};

