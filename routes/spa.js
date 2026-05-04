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
    if (pathname === '/' || pathname === '/index.html') {
        const body = ''; // intentionally empty; the SPA router fills <content>.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Ukenotater', body));
        return;
    }

    // SPA stubs — these pages render via /pages/<slug>.html fragments + components.
    // The original full server-rendered handlers below are unreachable and will be removed
    // as each page is fully ported to web components.
    {
        const SPA_STUBS = {
            '/tasks':    'Oppgaver',
            '/people':   'Personer og steder',
            '/results':  'Resultater',
            '/notes':    'Notater',
            '/settings': 'Innstillinger'
        };
        if (Object.prototype.hasOwnProperty.call(SPA_STUBS, pathname)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pageHtml(SPA_STUBS[pathname], ''));
            return;
        }
        const calStubMatch = pathname.match(/^\/calendar(?:\/(\d{4}-W\d{2}))?$/);
        if (calStubMatch) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pageHtml('Kalender', ''));
            return;
        }
    }
    };
};
