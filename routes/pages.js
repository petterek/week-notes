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

    // Theme builder page
    if (pathname === '/themes') {
        const themes = listAllThemes();
        const activeTheme = getActiveTheme();
        const colorVars = ['bg', 'surface', 'surface-alt', 'surface-head', 'border', 'border-soft', 'border-faint', 'text', 'text-strong', 'text-muted', 'text-muted-warm', 'text-subtle', 'accent', 'accent-strong', 'accent-soft'];
        const VAR_LABELS = {
            'bg': 'Bakgrunn', 'surface': 'Overflate', 'surface-alt': 'Overflate (alt)', 'surface-head': 'Overflate (header)',
            'border': 'Kantlinje', 'border-soft': 'Kantlinje (myk)', 'border-faint': 'Kantlinje (lys)',
            'text': 'Tekst', 'text-strong': 'Tekst (sterk)', 'text-muted': 'Tekst (dempet)', 'text-muted-warm': 'Tekst (dempet varm)', 'text-subtle': 'Tekst (subtil)',
            'accent': 'Aksent', 'accent-strong': 'Aksent (sterk)', 'accent-soft': 'Aksent (myk)',
            'font-family': 'Skrifttype', 'font-size': 'Skriftstørrelse'
        };
        const body = `
            <div class="th-page">
                <aside class="th-rail">
                    <h2>🎨 Temaer</h2>
                    <div class="th-list" id="thList">
                        ${themes.map(t => {
                            const v = t.vars || {};
                            const previewStyle = [
                                v['surface'] && `--p-surface:${v['surface']}`,
                                v['surface-head'] && `--p-head:${v['surface-head']}`,
                                v['border'] && `--p-border:${v['border']}`,
                                v['accent'] && `--p-accent:${v['accent']}`,
                                v['text-muted'] && `--p-muted:${v['text-muted']}`,
                                v['text-subtle'] && `--p-subtle:${v['text-subtle']}`,
                            ].filter(Boolean).join(';');
                            return `<button type="button" class="th-rail-item${t.id === activeTheme ? ' active' : ''}" data-id="${escapeHtml(t.id)}"${previewStyle ? ` style="${previewStyle}"` : ''}>
                                <span class="th-rail-preview">
                                    <span class="th-rail-bar"></span>
                                    <span class="th-rail-body"><span class="th-rail-line l1"></span><span class="th-rail-line l2"></span><span class="th-rail-line l3"></span></span>
                                </span>
                                <span class="th-rail-name">${escapeHtml(t.name || t.id)}${t.builtin ? '' : ' <span class="th-tag">tilpasset</span>'}</span>
                            </button>`;
                        }).join('')}
                    </div>
                    <p class="th-rail-hint">Klikk et tema for å se det. Innebygde temaer er låst — klone for å redigere.</p>
                </aside>
                <main class="th-detail" id="thDetail">
                    <div class="th-empty">Velg et tema fra listen til venstre.</div>
                </main>
            </div>
            <style>
                body:has(.th-page) { max-width: none; padding: 70px 20px 20px; }
                .th-page { display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: start; }
                .th-rail { position: sticky; top: 80px; background: var(--surface); border: 1px solid var(--border-faint); border-radius: 8px; padding: 14px; max-height: calc(100vh - 100px); overflow-y: auto; }
                .th-rail h2 { margin: 0 0 12px; font-size: 1.05em; color: var(--accent); }
                .th-list { display: flex; flex-direction: column; gap: 6px; }
                .th-rail-item { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--bg); border: 1px solid var(--border-faint); border-radius: 6px; cursor: pointer; font-family: inherit; text-align: left; transition: border-color 0.12s, background 0.12s; }
                .th-rail-item:hover { border-color: var(--border); }
                .th-rail-item.active { border-color: var(--accent); background: var(--accent-soft); }
                .th-rail-item.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
                .th-rail-preview { display: flex; flex-direction: column; width: 48px; height: 36px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); flex-shrink: 0; background: var(--p-surface, var(--surface)); }
                .th-rail-bar { height: 8px; background: var(--p-head, var(--p-surface, var(--surface-head))); border-bottom: 1px solid var(--p-border, var(--border-faint)); }
                .th-rail-body { flex: 1; padding: 4px; display: flex; flex-direction: column; gap: 2px; }
                .th-rail-line { height: 3px; border-radius: 1px; }
                .th-rail-line.l1 { width: 80%; background: var(--p-accent, var(--accent)); }
                .th-rail-line.l2 { width: 60%; background: var(--p-muted, var(--text-muted)); }
                .th-rail-line.l3 { width: 40%; background: var(--p-subtle, var(--text-subtle)); }
                .th-rail-name { flex: 1; font-size: 0.9em; font-weight: 600; color: var(--text); }
                .th-tag { display: inline-block; font-size: 0.7em; font-weight: 500; color: var(--text-subtle); background: var(--surface-alt); padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
                .th-rail-hint { font-size: 0.78em; color: var(--text-subtle); margin-top: 12px; line-height: 1.4; }
                .th-detail { background: var(--surface); border: 1px solid var(--border-faint); border-radius: 8px; padding: 20px 24px; min-height: 400px; }
                .th-empty { text-align: center; color: var(--text-subtle); padding: 60px 20px; font-style: italic; }
                .th-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
                .th-head h3 { margin: 0; flex: 1; min-width: 200px; }
                .th-name-input { font-size: 1.1em; font-weight: 600; padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); font-family: inherit; flex: 1; min-width: 200px; }
                .th-actions { display: flex; gap: 8px; flex-wrap: wrap; }
                .th-btn { padding: 7px 14px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-strong); cursor: pointer; font-family: inherit; font-size: 0.9em; font-weight: 600; }
                .th-btn:hover { border-color: var(--accent); }
                .th-btn.primary { background: var(--accent); color: var(--surface); border-color: var(--accent); }
                .th-btn.primary:hover { background: var(--accent-strong); }
                .th-btn.danger { color: #c53030; border-color: #f5b8b8; }
                .th-btn.danger:hover { background: #fff5f5; border-color: #c53030; }
                .th-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .th-vars { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px 16px; margin: 16px 0 24px; }
                .th-var { display: flex; flex-direction: column; gap: 4px; }
                .th-var label { font-size: 0.78em; color: var(--text-muted); font-weight: 600; }
                .th-color-row { display: flex; align-items: center; gap: 6px; }
                .th-color-row input[type=color] { width: 40px; height: 32px; padding: 0; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: var(--bg); }
                .th-color-row input[type=text] { flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); font-family: monospace; font-size: 0.85em; }
                .th-var input[type=text]:not(.th-name-input), .th-var input[type=number] { padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); font-family: inherit; font-size: 0.9em; }
                .th-section-title { font-size: 0.85em; color: var(--text-muted-warm); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px; font-weight: 700; }
                .th-preview-pane { border: 1px solid var(--border-faint); border-radius: 8px; padding: 18px; margin-top: 8px; }
                .th-preview-pane .pv-card { background: var(--pv-surface); color: var(--pv-text); border: 1px solid var(--pv-border); border-radius: 6px; padding: 14px 18px; font-family: var(--pv-font-family); font-size: var(--pv-font-size, 16px); }
                .th-preview-pane .pv-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--pv-border-soft); }
                .th-preview-pane .pv-title { color: var(--pv-text-strong); font-weight: 700; flex: 1; }
                .th-preview-pane .pv-accent { color: var(--pv-accent); font-weight: 600; }
                .th-preview-pane .pv-muted { color: var(--pv-text-muted); font-size: 0.9em; }
                .th-preview-pane .pv-subtle { color: var(--pv-text-subtle); font-size: 0.85em; font-style: italic; margin-top: 6px; }
                .th-preview-pane .pv-btn { background: var(--pv-accent); color: var(--pv-surface); border: none; padding: 5px 12px; border-radius: 4px; font-family: inherit; font-size: 0.85em; font-weight: 600; cursor: pointer; }
                .th-preview-pane .pv-pill { display: inline-block; background: var(--pv-accent-soft); color: var(--pv-accent-strong); padding: 2px 8px; border-radius: 8px; font-size: 0.78em; font-weight: 600; margin-left: 6px; }
                .th-preview-pane .pv-bg { background: var(--pv-bg); padding: 10px; border-radius: 6px; margin-top: 10px; }
            </style>
            <script>
                (function () {
                    const COLOR_VARS = ${JSON.stringify(colorVars)};
                    const VAR_LABELS = ${JSON.stringify(VAR_LABELS).replace(/</g, '\\u003c')};
                    const ACTIVE = ${JSON.stringify(activeTheme)};
                    let currentId = null;
                    let currentTheme = null;
                    const list = document.getElementById('thList');
                    const detail = document.getElementById('thDetail');
                    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
                    function isHexColor(s) { return /^#[0-9a-fA-F]{3,8}$/.test(String(s || '').trim()); }
                    function load() {
                        return fetch('/api/themes').then(r => r.json());
                    }
                    function selectId(id) {
                        list.querySelectorAll('.th-rail-item').forEach(b => b.classList.toggle('selected', b.getAttribute('data-id') === id));
                        load().then(themes => {
                            const t = themes.find(x => x.id === id);
                            if (!t) return;
                            currentId = id;
                            currentTheme = t;
                            render(t);
                        });
                    }
                    function render(t) {
                        const v = t.vars || {};
                        const builtin = t.builtin;
                        const colorRows = COLOR_VARS.map(name => {
                            const val = v[name] || '';
                            const safeVal = isHexColor(val) ? val : '#888888';
                            return '<div class="th-var">'
                                + '<label>' + esc(VAR_LABELS[name] || name) + ' <code style="opacity:0.5">--' + name + '</code></label>'
                                + '<div class="th-color-row">'
                                + '<input type="color" data-var="' + name + '" data-kind="color" value="' + esc(safeVal) + '"' + (builtin ? ' disabled' : '') + '>'
                                + '<input type="text" data-var="' + name + '" data-kind="text" value="' + esc(val) + '"' + (builtin ? ' disabled' : '') + '>'
                                + '</div></div>';
                        }).join('');
                        const fontFamilyVal = v['font-family'] || '';
                        const fontSizeVal = String(v['font-size'] || '').replace(/px$/i, '') || '16';
                        detail.innerHTML = ''
                            + '<div class="th-head">'
                            + '<input type="text" class="th-name-input" id="thName" value="' + esc(t.name || t.id) + '"' + (builtin ? ' disabled' : '') + '>'
                            + '<div class="th-actions">'
                            + (builtin
                                ? '<button class="th-btn primary" id="thClone">📋 Klone</button>'
                                : '<button class="th-btn primary" id="thSave">💾 Lagre</button>'
                                + '<button class="th-btn" id="thClone">📋 Klone</button>'
                                + '<button class="th-btn danger" id="thDelete">🗑️ Slett</button>')
                            + '<button class="th-btn" id="thApply">✅ Sett som tema</button>'
                            + '</div></div>'
                            + (builtin ? '<p class="pv-muted" style="margin:0 0 14px;color:var(--text-subtle);font-style:italic">Innebygde temaer er låst. Klone for å lage en redigerbar versjon.</p>' : '')
                            + '<h4 class="th-section-title">Farger</h4>'
                            + '<div class="th-vars">' + colorRows + '</div>'
                            + '<h4 class="th-section-title">Skrift</h4>'
                            + '<div class="th-vars">'
                            + '<div class="th-var"><label>Skrifttype <code style="opacity:0.5">--font-family</code></label><input type="text" data-var="font-family" data-kind="font" value="' + esc(fontFamilyVal) + '"' + (builtin ? ' disabled' : '') + '></div>'
                            + '<div class="th-var"><label>Skriftstørrelse (px) <code style="opacity:0.5">--font-size</code></label><input type="number" data-var="font-size" data-kind="fontsize" min="10" max="32" step="1" value="' + esc(fontSizeVal) + '"' + (builtin ? ' disabled' : '') + '></div>'
                            + '</div>'
                            + '<h4 class="th-section-title">Forhåndsvisning</h4>'
                            + '<div class="th-preview-pane" id="thPreview"></div>';
                        wireInputs();
                        renderPreview();
                        const apply = document.getElementById('thApply');
                        if (apply) apply.addEventListener('click', applyTheme);
                        const clone = document.getElementById('thClone');
                        if (clone) clone.addEventListener('click', cloneTheme);
                        const save = document.getElementById('thSave');
                        if (save) save.addEventListener('click', saveTheme);
                        const del = document.getElementById('thDelete');
                        if (del) del.addEventListener('click', deleteTheme);
                    }
                    function gatherVars() {
                        const vars = Object.assign({}, currentTheme.vars || {});
                        detail.querySelectorAll('input[data-var]').forEach(inp => {
                            const name = inp.getAttribute('data-var');
                            const kind = inp.getAttribute('data-kind');
                            if (kind === 'text' || kind === 'font') {
                                if (inp.value.trim()) vars[name] = inp.value.trim();
                            } else if (kind === 'fontsize') {
                                if (inp.value) vars[name] = inp.value + 'px';
                            }
                            // 'color' inputs are mirrored into the text input via wireInputs, so ignore here
                        });
                        return vars;
                    }
                    function wireInputs() {
                        detail.querySelectorAll('input[data-var]').forEach(inp => {
                            const kind = inp.getAttribute('data-kind');
                            if (kind === 'color') {
                                inp.addEventListener('input', () => {
                                    const txt = detail.querySelector('input[data-kind=text][data-var="' + inp.getAttribute('data-var') + '"]');
                                    if (txt) txt.value = inp.value;
                                    renderPreview();
                                });
                            } else if (kind === 'text') {
                                inp.addEventListener('input', () => {
                                    const col = detail.querySelector('input[data-kind=color][data-var="' + inp.getAttribute('data-var') + '"]');
                                    if (col && isHexColor(inp.value)) col.value = inp.value;
                                    renderPreview();
                                });
                            } else {
                                inp.addEventListener('input', renderPreview);
                            }
                        });
                        const nameInp = document.getElementById('thName');
                        if (nameInp) nameInp.addEventListener('input', renderPreview);
                    }
                    function renderPreview() {
                        const v = gatherVars();
                        const pv = document.getElementById('thPreview');
                        if (!pv) return;
                        const kv = {
                            'pv-bg': v['bg'], 'pv-surface': v['surface'], 'pv-border': v['border'], 'pv-border-soft': v['border-soft'],
                            'pv-text': v['text'], 'pv-text-strong': v['text-strong'], 'pv-text-muted': v['text-muted'], 'pv-text-subtle': v['text-subtle'],
                            'pv-accent': v['accent'], 'pv-accent-strong': v['accent-strong'], 'pv-accent-soft': v['accent-soft'],
                            'pv-font-family': v['font-family'], 'pv-font-size': v['font-size']
                        };
                        const styleStr = Object.entries(kv).filter(([, val]) => val).map(([k, val]) => '--' + k + ':' + val).join(';');
                        pv.setAttribute('style', styleStr);
                        const nameInp = document.getElementById('thName');
                        const name = nameInp ? nameInp.value : (currentTheme && currentTheme.name) || '';
                        pv.innerHTML = '<div class="pv-bg"><div class="pv-card">'
                            + '<div class="pv-head"><span class="pv-title">' + esc(name) + '</span><span class="pv-pill">aktiv</span></div>'
                            + '<p>Hovedtekst i dette temaet. <span class="pv-accent">Aksentert tekst</span> sammen med <span class="pv-muted">dempet tekst</span>.</p>'
                            + '<p class="pv-subtle">Subtil notat-linje, ofte brukt til metadata.</p>'
                            + '<button class="pv-btn">Knapp</button>'
                            + '</div></div>';
                    }
                    function cloneTheme() {
                        const name = prompt('Navn på det nye temaet:', (currentTheme.name || currentId) + ' (kopi)');
                        if (!name) return;
                        fetch('/api/themes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentId, name: name }) })
                            .then(r => r.json()).then(d => {
                                if (!d.ok) { alert('Klone feilet: ' + d.error); return; }
                                location.href = '/themes#' + d.theme.id;
                                location.reload();
                            });
                    }
                    function saveTheme() {
                        const name = document.getElementById('thName').value.trim() || currentTheme.name;
                        const vars = gatherVars();
                        fetch('/api/themes/' + encodeURIComponent(currentId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, vars: vars }) })
                            .then(r => r.json()).then(d => {
                                if (!d.ok) { alert('Lagring feilet: ' + d.error); return; }
                                // Reload theme stylesheet on the page
                                const link = document.getElementById('themeStylesheet');
                                if (link && ACTIVE === currentId) link.href = '/themes/' + currentId + '.css?ts=' + Date.now();
                                currentTheme = d.theme;
                                const item = list.querySelector('.th-rail-item[data-id="' + currentId + '"] .th-rail-name');
                                if (item) item.textContent = d.theme.name + ' tilpasset';
                            });
                    }
                    function deleteTheme() {
                        if (!confirm('Slette temaet "' + (currentTheme.name || currentId) + '"?')) return;
                        fetch('/api/themes/' + encodeURIComponent(currentId), { method: 'DELETE' })
                            .then(r => r.json()).then(d => {
                                if (!d.ok) { alert('Slett feilet: ' + d.error); return; }
                                location.href = '/themes';
                            });
                    }
                    function applyTheme() {
                        // Apply to active context via settings PUT
                        fetch('/api/contexts').then(r => r.json()).then(d => {
                            const active = d.active;
                            if (!active) { alert('Ingen aktiv kontekst'); return; }
                            const ctx = (d.contexts || []).find(c => c.id === active);
                            const settings = Object.assign({}, ctx ? ctx.settings : {}, { theme: currentId });
                            fetch('/api/contexts/' + encodeURIComponent(active) + '/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
                                .then(r => r.json()).then(d2 => {
                                    if (!d2.ok) { alert('Kunne ikke aktivere: ' + d2.error); return; }
                                    const link = document.getElementById('themeStylesheet');
                                    if (link) link.href = '/themes/' + currentId + '.css?ts=' + Date.now();
                                    list.querySelectorAll('.th-rail-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-id') === currentId));
                                });
                        });
                    }
                    list.querySelectorAll('.th-rail-item').forEach(b => {
                        b.addEventListener('click', () => selectId(b.getAttribute('data-id')));
                    });
                    // Auto-select from hash, or active theme
                    const initial = (location.hash && location.hash.slice(1)) || ACTIVE;
                    if (initial && list.querySelector('.th-rail-item[data-id="' + initial + '"]')) selectId(initial);
                })();
            </script>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Temaer', body));
        return;
    }

    // Settings / contexts page

    // Open or create a meeting note linked to a meeting id
    const meetingNoteMatch = pathname.match(/^\/meeting-note\/([A-Za-z0-9_]+)$/);
    if (meetingNoteMatch) {
        const mid = meetingNoteMatch[1];
        const meetings = loadMeetings();
        const m = meetings.find(x => x.id === mid);
        if (!m) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Møte ikke funnet');
            return;
        }
        // Search existing notes meta for one already linked to this meeting
        const meta = loadNotesMeta();
        for (const key of Object.keys(meta)) {
            if (meta[key] && meta[key].meetingId === mid) {
                const slash = key.indexOf('/');
                if (slash > 0) {
                    const w = key.slice(0, slash);
                    const f = key.slice(slash + 1);
                    if (fs.existsSync(path.join(dataDir(), w, f))) {
                        res.writeHead(302, { Location: `/editor/${w}/${encodeURIComponent(f)}` });
                        res.end();
                        return;
                    }
                }
            }
        }
        // Compute week folder (YYYY-N format used by note folders) from meeting date
        const md = new Date((m.date || '') + 'T00:00:00Z');
        let week;
        if (isNaN(md.getTime())) {
            week = getCurrentYearWeek();
        } else {
            const t = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), md.getUTCDate()));
            t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
            const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
            const wn = Math.ceil((((t - ys) / 86400000) + 1) / 7);
            week = `${t.getUTCFullYear()}-${wn}`;
        }
        const slug = (m.title || 'mote').toLowerCase()
            .replace(/[^a-z0-9æøå]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'mote';
        const dir = path.join(dataDir(), week);
        fs.mkdirSync(dir, { recursive: true });
        let file = `mote-${m.date}-${slug}.md`;
        let n = 1;
        while (fs.existsSync(path.join(dir, file))) {
            n += 1;
            file = `mote-${m.date}-${slug}-${n}.md`;
        }
        const lines = [
            `# ${m.title || 'Møte'}`,
            '',
            `**Dato:** ${m.date}${m.start ? ' kl. ' + m.start : ''}${m.end ? '–' + m.end : ''}  `
        ];
        if (m.location) lines.push(`**Sted:** ${m.location}  `);
        if (m.attendees && m.attendees.length) {
            lines.push(`**Deltakere:** ${m.attendees.map(a => '@' + a).join(' ')}  `);
        }
        lines.push('', '## Agenda', '', '- ', '', '## Notater', '');
        if (m.notes) lines.push(m.notes, '');
        lines.push('## Aksjonspunkter', '', '- [ ] ', '');
        fs.writeFileSync(path.join(dir, file), lines.join('\n'), 'utf-8');
        const now = new Date().toISOString();
        const meMeta = getMePersonKey(getActiveContext());
        const noteMeta = { type: 'meeting', meetingId: mid, created: now, modified: now };
        if (meMeta) { noteMeta.createdBy = meMeta; noteMeta.lastSavedBy = meMeta; }
        setNoteMeta(week, file, noteMeta);
        res.writeHead(302, { Location: `/editor/${week}/${encodeURIComponent(file)}` });
        res.end();
        return;
    }



    // Editor: new note (SPA — hydrates from /pages/editor.html)
    if (pathname === '/editor') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Nytt notat', ''));
        return;
    }

    // Editor: edit existing file (SPA — note-editor reads URL for week/file)
    const editorMatch = pathname.match(/^\/editor\/([^/]+)\/([^/]+\.md)$/);
    if (editorMatch) {
        const [, week, file] = editorMatch;
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Rediger ' + file, ''));
        return;
    }

    // Presentation: render note as reveal.js slideshow
    const presentMatch = pathname.match(/^\/present\/([^/]+)\/([^/]+\.md)$/);
    if (presentMatch) {
        const [, weekRaw, fileRaw] = presentMatch;
        const week = decodeURIComponent(weekRaw);
        const file = decodeURIComponent(fileRaw);
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        let content = '';
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Notat ikke funnet');
            return;
        }
        const styleParam = url.searchParams.get('style');
        const meta = getNoteMeta(week, file);
        const style = styleParam || meta.presentationStyle || 'paper';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(presentationPageHtml(week, file, content, style));
        return;
    }
    };
};
