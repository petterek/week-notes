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
    if (pathname === '/api/people' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadPeople()));
        return;
    }

    // API: create person directly (without needing an @-mention first)
    if (pathname === '/api/people' && req.method === 'POST') {
        try {
            const data = JSON.parse(await readBody(req) || '{}');
            const firstName = String(data.firstName || '').trim();
            if (!firstName) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'firstName is required' })); return; }
            const lastName = String(data.lastName || '').trim();
            const all = loadAllPeople();
            // Generate a unique lowercase key from firstName (or firstName+last initial on collision)
            const baseKey = firstName.toLowerCase().replace(/\s+/g, '');
            let key = baseKey;
            const liveKeys = new Set([
                ...all.filter(p => !p.deleted).map(p => p.key),
                ...loadCompanies().map(c => c.key)
            ]);
            if (liveKeys.has(key) && lastName) {
                key = (firstName + lastName.charAt(0)).toLowerCase().replace(/\s+/g, '');
            }
            let n = 2;
            while (liveKeys.has(key)) { key = baseKey + n; n++; }
            const primaryCompanyKey = String(data.primaryCompanyKey || '').trim().toLowerCase() || undefined;
            const extraCompanyKeys = Array.isArray(data.extraCompanyKeys)
                ? [...new Set(data.extraCompanyKeys.map(k => String(k).trim().toLowerCase()).filter(k => k && k !== primaryCompanyKey))]
                : [];
            const person = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                key,
                name: firstName,
                firstName,
                lastName,
                title: String(data.title || '').trim(),
                email: String(data.email || '').trim(),
                phone: String(data.phone || '').trim(),
                notes: String(data.notes || '').trim(),
                primaryCompanyKey,
                extraCompanyKeys,
                created: new Date().toISOString()
            };
            all.push(person);
            savePeople(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, person }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }


    const peopleUpdateMatch = pathname.match(/^\/api\/people\/([^/]+)$/);
    if (peopleUpdateMatch && req.method === 'PUT') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const people = loadAllPeople();
                const idx = people.findIndex(p => p.id === peopleUpdateMatch[1]);
                if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
                const person = people[idx];
                if (data.firstName) {
                    person.firstName = data.firstName;
                    person.lastName = data.lastName || '';
                    // @mention key stays as first name for compatibility
                    person.name = data.firstName;
                    person.key = data.firstName.toLowerCase();
                }
                if (data.title !== undefined) person.title = data.title;
                if (data.email !== undefined) person.email = data.email;
                if (data.phone !== undefined) person.phone = data.phone;
                if (data.notes !== undefined) person.notes = data.notes;
                if (data.inactive !== undefined) person.inactive = !!data.inactive;
                if (data.primaryCompanyKey !== undefined) {
                    const v = String(data.primaryCompanyKey || '').trim().toLowerCase();
                    person.primaryCompanyKey = v || undefined;
                }
                if (data.extraCompanyKeys !== undefined) {
                    const primary = person.primaryCompanyKey;
                    person.extraCompanyKeys = Array.isArray(data.extraCompanyKeys)
                        ? [...new Set(data.extraCompanyKeys.map(k => String(k).trim().toLowerCase()).filter(k => k && k !== primary))]
                        : [];
                }
                savePeople(people);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, person }));
            } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false })); }
        });
        return;
    }

    if (peopleUpdateMatch && req.method === 'DELETE') {
        const people = loadAllPeople();
        const idx = people.findIndex(p => p.id === peopleUpdateMatch[1]);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
            return;
        }
        // Tombstone instead of removing, so syncMentions does not recreate
        // the person from existing @-references in notes/tasks.
        people[idx].deleted = true;
        people[idx].deletedAt = new Date().toISOString();
        savePeople(people);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    };
};
