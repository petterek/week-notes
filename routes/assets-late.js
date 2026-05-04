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
    if (pathname.startsWith('/components/') && pathname.endsWith('.js')) {
        const slug = pathname.slice('/components/'.length);
        if (slug.includes('/') || slug.includes('..')) { res.writeHead(400); res.end('Bad'); return; }
        // Search components/ first, then each domains/<name>/ folder so
        // moved components keep working under their stable /components/ URL.
        const candidates = [path.join(__dirname, 'components', slug)];
        try {
            for (const d of fs.readdirSync(path.join(__dirname, 'domains'), { withFileTypes: true })) {
                if (d.isDirectory()) candidates.push(path.join(__dirname, 'domains', d.name, slug));
            }
        } catch {}
        for (const p of candidates) {
            try {
                const data = fs.readFileSync(p);
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
                res.end(data);
                return;
            } catch {}
        }
        res.writeHead(404); res.end('Not found');
        return;
    }

    if (pathname === '/style.css') {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'public', 'style.css'));
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) {
            res.writeHead(404); res.end('Not found');
        }
        return;
    }

    // Shared mention autocomplete script
    if (pathname === '/mention-autocomplete.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(`
function initMentionAutocomplete(el) {
    let people = [];
    let dropdown = null;
    fetch('/api/people').then(r => r.json()).then(p => { people = (p || []).filter(x => !x.inactive); });

    function getMentionQuery() {
        const val = el.value, pos = el.selectionStart;
        const before = val.slice(0, pos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) return null;
        const afterAt = before.slice(atIdx + 1);
        if (/\\s/.test(afterAt)) return null;
        if (atIdx > 0 && !/[\\s\\n(,;]/.test(before[atIdx - 1])) return null;
        return afterAt.toLowerCase();
    }

    function showDropdown(query) {
        closeDropdown();
        const matches = people.filter(p => p.key.startsWith(query));
        if (matches.length === 0) return;
        dropdown = document.createElement('div');
        dropdown.style.cssText = 'position:fixed;background:white;border:1px solid var(--border-soft);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:9999;min-width:180px;overflow:hidden;font-family:inherit';
        matches.forEach((p, i) => {
            const item = document.createElement('div');
            item.textContent = '@' + p.name;
            item.dataset.name = p.name;
            item.dataset.idx = i;
            item.style.cssText = 'padding:8px 14px;cursor:pointer;font-size:0.9em;color:#2d3748';
            item.addEventListener('mouseenter', () => setActive(i));
            item.addEventListener('mousedown', e => { e.preventDefault(); selectPerson(p.name); });
            dropdown.appendChild(item);
        });
        const rect = el.getBoundingClientRect();
        document.body.appendChild(dropdown);
        const ddRect = dropdown.getBoundingClientRect();
        const vh = window.innerHeight;
        let top = rect.bottom + 4;
        // If we'd overflow the viewport bottom, place above the field instead
        if (top + ddRect.height > vh - 8) {
            top = Math.max(8, rect.top - ddRect.height - 4);
        }
        dropdown.style.top = top + 'px';
        dropdown.style.left = Math.max(8, rect.left) + 'px';
        setActive(0);
    }

    function setActive(idx) {
        if (!dropdown) return;
        dropdown.querySelectorAll('div').forEach((el, i) => {
            el.style.background = i === idx ? '#ebf8ff' : '';
            el.style.color = i === idx ? '#2b6cb0' : '#2d3748';
            el.dataset.active = i === idx ? 'true' : '';
        });
    }

    function getActiveIdx() {
        if (!dropdown) return -1;
        return [...dropdown.querySelectorAll('div')].findIndex(el => el.dataset.active === 'true');
    }

    function selectPerson(name) {
        const val = el.value, pos = el.selectionStart;
        const before = val.slice(0, pos);
        const atIdx = before.lastIndexOf('@');
        const newBefore = before.slice(0, atIdx) + '@' + name + ' ';
        el.value = newBefore + val.slice(pos);
        el.selectionStart = el.selectionEnd = newBefore.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        closeDropdown();
        el.focus();
    }

    function closeDropdown() {
        if (dropdown) { dropdown.remove(); dropdown = null; }
    }

    el.addEventListener('input', () => {
        const q = getMentionQuery();
        if (q === null) { closeDropdown(); return; }
        showDropdown(q);
    });

    el.addEventListener('keydown', e => {
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('div');
        const idx = getActiveIdx();
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(idx + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(idx - 1, 0)); }
        else if (e.key === 'Tab' || e.key === 'Enter') {
            if (idx >= 0) { e.preventDefault(); e.stopPropagation(); selectPerson(items[idx].dataset.name); }
        }
        else if (e.key === 'Escape') closeDropdown();
    });

    document.addEventListener('click', e => {
        if (dropdown && !dropdown.contains(e.target) && e.target !== el) closeDropdown();
    }, true);

    // ===== Ctrl+D / Ctrl+Shift+D date(time) picker (custom <date-time-picker>) =====
    let popup = null;
    let outsideHandler = null;

    function ensurePickerLoaded() {
        if (window.__wnDatePickerLoaded) return window.__wnDatePickerLoaded;
        if (customElements.get('date-time-picker')) {
            window.__wnDatePickerLoaded = Promise.resolve();
            return window.__wnDatePickerLoaded;
        }
        window.__wnDatePickerLoaded = new Promise((resolve) => {
            const s = document.createElement('script');
            s.type = 'module';
            s.src = '/components/date-time-picker.js';
            s.onload = () => customElements.whenDefined('date-time-picker').then(resolve);
            document.head.appendChild(s);
        });
        return window.__wnDatePickerLoaded;
    }

    function openDatePicker(kind) {
        closeDatePicker();
        const start = el.selectionStart != null ? el.selectionStart : el.value.length;
        const end = el.selectionEnd != null ? el.selectionEnd : start;
        ensurePickerLoaded().then(() => mountDatePicker(kind, start, end));
    }

    function mountDatePicker(kind, start, end) {
        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', kind === 'datetime' ? 'datetime' : 'date');
        picker.style.cssText = 'position:fixed;z-index:9999;visibility:hidden;left:-9999px;top:0';
        document.body.appendChild(picker);
        popup = picker;

        const rect = el.getBoundingClientRect();
        requestAnimationFrame(() => {
            const pr = picker.getBoundingClientRect();
            const top = Math.min(window.innerHeight - pr.height - 8, Math.max(8, rect.top + 24));
            const left = Math.min(window.innerWidth - pr.width - 8, Math.max(8, rect.left + 8));
            picker.style.cssText = 'position:fixed;z-index:9999;visibility:visible;top:' + top + 'px;left:' + left + 'px';
        });

        picker.addEventListener('datetime-selected', (e) => insertDateValue(start, end, e.detail.value));
        picker.addEventListener('datetime-cancelled', () => { closeDatePicker(); el.focus(); });
        picker.focus();

        outsideHandler = (e) => {
            if (popup && !popup.contains(e.target) && e.target !== el && !el.contains(e.target)) closeDatePicker();
        };
        setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 0);
    }

    function insertDateValue(start, end, str) {
        const val = el.value;
        const before = val.slice(0, start);
        const after = val.slice(end);
        el.value = before + str + after;
        const np = before.length + str.length;
        try { el.selectionStart = el.selectionEnd = np; } catch (_) {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        closeDatePicker();
        el.focus();
    }

    function closeDatePicker() {
        if (popup) { popup.remove(); popup = null; }
        if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler, true);
            outsideHandler = null;
        }
    }

    el.addEventListener('keydown', e => {
        if (!e.ctrlKey || e.altKey || e.metaKey) return;
        if ((e.key || '').toLowerCase() !== 'd') return;
        e.preventDefault();
        e.stopPropagation();
        openDatePicker(e.shiftKey ? 'datetime' : 'date');
    });
}
`);
        return;
    }
    };
};
