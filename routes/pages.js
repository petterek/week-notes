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
    if (pathname === '/results') {
        const results = loadResults().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
        const people = loadPeople();

        const byWeek = {};
        results.forEach(r => {
            if (!byWeek[r.week]) byWeek[r.week] = [];
            byWeek[r.week].push(r);
        });
        const weeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a));
        const currentWeek = getCurrentYearWeek();

        let body = '<div class="results-page">';
        body += `<div class="results-head">
            <h1>⚖️ Resultater</h1>
            <button class="btn-primary" id="newResultBtn">➕ Nytt resultat</button>
        </div>`;
        body += '<p class="results-hint">Tips: Skriv <code>[beslutning]</code> i et oppgavenotat for å lage et resultat knyttet til en oppgave.</p>';

        if (results.length === 0) {
            body += '<p class="empty-quiet" style="margin-top:24px">Ingen resultater ennå. Klikk <strong>➕ Nytt resultat</strong> for å legge til, eller skriv <code>[beslutning]</code> i et oppgavenotat.</p>';
        } else {
            weeks.forEach(week => {
                const weekNum = (week || '').split('-W')[1] || week;
                const isCurrent = week === currentWeek;
                body += `<section class="results-week">`;
                body += `<h2 class="results-week-h">Uke ${escapeHtml(weekNum)}${isCurrent ? ' <span class="pill live">aktiv</span>' : ''}</h2>`;
                byWeek[week]
                    .slice()
                    .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
                    .forEach(r => {
                        const linkedPeople = (r.people || []).map(name => {
                            const key = String(name).toLowerCase();
                            const p = people.find(p => (p.key && p.key === key) || (p.name && p.name.toLowerCase() === key));
                            const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
                            return `<entity-mention kind="person" key="${escapeHtml(key)}" label="${escapeHtml(display)}"></entity-mention>`;
                        }).join(' ');
                        const rJson = JSON.stringify(r).replace(/'/g, '&#39;').replace(/</g, '\\u003c');

                        body += `<article class="result-card">
                            <div class="result-row">
                                <span class="result-text">⚖️ ${linkMentions(escapeHtml(r.text))}</span>
                                <button class="result-act result-edit" onclick='openEditResult(${rJson})' title="Rediger">✏️</button>
                                <button class="result-act result-del" onclick="deleteResult('${escapeHtml(r.id)}')" title="Slett">✕</button>
                            </div>
                            <div class="result-meta">
                                ${r.taskText ? `<span class="result-task">📌 <a href="/tasks">${escapeHtml(r.taskText)}</a></span>` : ''}
                                ${linkedPeople ? `<span class="result-people">${linkedPeople}</span>` : ''}
                                <span class="result-date">${r.created ? r.created.slice(0, 10) : ''}</span>
                            </div>
                        </article>`;
                    });
                body += `</section>`;
            });
        }
        body += '</div>';

        body += `
<style>
.results-page { max-width: 920px; }
.results-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; }
.results-head h1 { margin: 0; }
.results-hint { color: var(--text-subtle); font-size: 0.85em; margin: 0 0 24px; }
.results-hint code { background: var(--surface-alt); padding: 1px 6px; border-radius: 3px; }
.results-week { margin-bottom: 32px; }
.results-week-h { color: var(--accent); font-size: 0.95em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--border-soft); display: flex; align-items: center; gap: 10px; }
.results-week-h .pill.live { font-size: 0.7em; }
.result-card { background: var(--surface); border: 1px solid var(--border-soft); border-left: 4px solid var(--accent); border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; }
.result-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
.result-text { flex: 1; font-size: 1em; color: var(--text-strong); line-height: 1.45; }
.result-act { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 6px; border-radius: 4px; font-family: inherit; color: var(--text-muted); }
.result-act:hover { background: var(--surface-head); }
.result-del { color: #c53030; }
.result-del:hover { background: #fff5f5; }
.result-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.82em; color: var(--text-subtle); }
.result-task a { color: var(--text-muted); text-decoration: none; }
.result-task a:hover { text-decoration: underline; }
.result-person { font-size: 0.85em; }
.result-date { margin-left: auto; }

#newResultModal .nr-form { display: flex; flex-direction: column; gap: 12px; }
#newResultModal label { font-size: 0.85em; font-weight: 600; color: var(--text-muted); }
#newResultModal textarea, #newResultModal input { display: block; width: 100%; margin-top: 4px; }
</style>`;

        body += `
<div id="editResultModal" class="page-modal" onclick="if(event.target===this)closeEditResult()">
  <div class="page-modal-card" style="max-width:560px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="margin:0">✏️ Rediger resultat</h3>
      <button onclick="closeEditResult()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
    </div>
    <input type="hidden" id="editResultId" />
    <div style="display:flex;flex-direction:column;gap:12px">
      <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Resultat
        <textarea id="editResultText" rows="3" style="display:block;margin-top:4px"></textarea>
      </label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px">
      <button class="page-modal-btn cancel" onclick="closeEditResult()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveEditResult()">💾 Lagre</button>
    </div>
  </div>
</div>
<div id="newResultModal" class="page-modal" onclick="if(event.target===this)closeNewResult()">
  <div class="page-modal-card" style="max-width:560px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="margin:0">➕ Nytt resultat</h3>
      <button onclick="closeNewResult()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
    </div>
    <div class="nr-form">
      <label>Tekst<textarea id="newResultText" rows="3" placeholder="Hva ble besluttet eller oppnådd?"></textarea></label>
      <label>Uke<input type="text" id="newResultWeek" value="${escapeHtml(currentWeek)}" placeholder="${escapeHtml(currentWeek)}" /></label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px">
      <button class="page-modal-btn cancel" onclick="closeNewResult()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveNewResult()">💾 Lagre</button>
    </div>
  </div>
</div>
<script>
function openEditResult(r) {
    document.getElementById('editResultId').value = r.id;
    document.getElementById('editResultText').value = r.text;
    const modal = document.getElementById('editResultModal');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('editResultText').focus(), 50);
}
function closeEditResult() { document.getElementById('editResultModal').style.display = 'none'; }
function saveEditResult() {
    const id = document.getElementById('editResultId').value;
    const text = document.getElementById('editResultText').value.trim();
    if (!text) return;
    fetch('/api/results/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); });
}
function deleteResult(id) {
    if (!confirm('Slett dette resultatet?')) return;
    fetch('/api/results/' + id, { method: 'DELETE' })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); });
}
function openNewResult() {
    document.getElementById('newResultText').value = '';
    const modal = document.getElementById('newResultModal');
    modal.style.display = 'flex';
    setTimeout(() => {
        const ta = document.getElementById('newResultText');
        ta.focus();
        if (window.initMentionAutocomplete) window.initMentionAutocomplete(ta);
    }, 50);
}
function closeNewResult() { document.getElementById('newResultModal').style.display = 'none'; }
function saveNewResult() {
    const text = document.getElementById('newResultText').value.trim();
    const week = document.getElementById('newResultWeek').value.trim();
    if (!text) return;
    fetch('/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, week }) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert(r.error || 'Feil'); });
}
document.getElementById('newResultBtn').addEventListener('click', openNewResult);
document.addEventListener('keydown', function(e) {
    const editOpen = document.getElementById('editResultModal').style.display === 'flex';
    const newOpen = document.getElementById('newResultModal').style.display === 'flex';
    if (editOpen) {
        if (e.key === 'Escape') closeEditResult();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditResult();
    } else if (newOpen) {
        if (e.key === 'Escape') closeNewResult();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNewResult();
    }
});
</script>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Resultater', body));
        return;
    }

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
    if (pathname === '/settings') {
        const active = getActiveContext();
        const all = listContexts().map(id => {
            const dir = path.join(CONTEXTS_DIR, id);
            return {
                id,
                settings: getContextSettings(id),
                active: id === active,
                marker: readMarker(dir),
                git: { isRepo: gitIsRepo(dir), dirty: gitIsDirty(dir), last: gitLastCommit(dir) }
            };
        });
        const cur = all.find(c => c.active) || all[0];
        const formatGitStatus = (c) => {
            if (!c.git.isRepo) return '<span class="git-row"><span class="git-dot off"></span>Ikke et git-repo</span>';
            const parts = [];
            if (c.git.dirty) {
                parts.push('<span class="git-pill dirty" title="Uforpliktede endringer">● Endringer</span>');
            } else {
                parts.push('<span class="git-pill clean" title="Arbeidstreet er rent">✓ Rent</span>');
            }
            if (c.settings.remote) {
                parts.push(`<span class="git-pill remote" title="${escapeHtml(c.settings.remote)}">🌐 origin</span>`);
                parts.push(`<button type="button" class="btn-push" data-push="${escapeHtml(c.id)}" title="git push origin HEAD">⬆️ Push</button>`);
            } else {
                parts.push('<span class="git-pill no-remote">⊘ ingen remote</span>');
            }
            if (c.git.last) {
                const when = c.git.last.date ? new Date(c.git.last.date).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : '';
                parts.push(`<span class="git-last" title="${escapeHtml(c.git.last.subject || '')}"><code>${escapeHtml(c.git.last.hash)}</code> ${escapeHtml(c.git.last.subject || '')}${when ? ` <span class="git-when">· ${escapeHtml(when)}</span>` : ''}</span>`);
            } else {
                parts.push('<span class="git-last muted">Ingen commits ennå</span>');
            }
            return `<div class="git-row">${parts.join('')}</div>`;
        };
        const railItem = (c) => `
            <button type="button" class="ctx-rail-item${c.active ? ' is-active' : ''}${c.id === cur.id ? ' selected' : ''}" data-target="${escapeHtml(c.id)}">
                <span class="ctx-rail-icon">${escapeHtml(c.settings.icon || '📁')}</span>
                <span class="ctx-rail-text">
                    <span class="ctx-rail-name">${escapeHtml(c.settings.name || c.id)}</span>
                    <span class="ctx-rail-id">${escapeHtml(c.id)}</span>
                </span>
                ${c.active ? '<span class="ctx-rail-badge">●</span>' : ''}
            </button>`;
        const detailPane = (c) => `
            <div class="ctx-detail${c.id === cur.id ? ' visible' : ''}" data-detail="${escapeHtml(c.id)}">
                <div class="ctx-detail-head">
                    <span class="ctx-icon-lg">${escapeHtml(c.settings.icon || '📁')}</span>
                    <div style="flex:1;min-width:0">
                        <h2 style="margin:0">${escapeHtml(c.settings.name || c.id)}</h2>
                        <div class="ctx-id">${escapeHtml(c.id)}</div>
                    </div>
                    ${c.active
                        ? '<span class="ctx-active-badge">Aktiv kontekst</span>'
                        : `<button type="button" class="btn-primary" data-switch="${escapeHtml(c.id)}">Bytt til</button>`}
                </div>
                ${c.settings.description ? `<div class="ctx-desc">${escapeHtml(c.settings.description)}</div>` : ''}
                <div class="ctx-tabs" role="tablist">
                    <button type="button" class="ctx-tab-btn is-active" data-tab="general">📝 Generelt</button>
                    <button type="button" class="ctx-tab-btn" data-tab="tags">🏷️ Tagger</button>
                    <button type="button" class="ctx-tab-btn" data-tab="meetings">🗓️ Møter</button>
                    <button type="button" class="ctx-tab-btn" data-tab="git">📦 Git</button>
                </div>
                <form class="ctx-edit-form" data-form="${escapeHtml(c.id)}">
                    <div class="ctx-tab-panel is-active" data-panel="general">
                    <div class="ctx-detail-section">
                        <h3>📝 Generelt</h3>
                        ${(function(){
                            const m = c.marker;
                            const ver = m && typeof m.version === 'string' ? m.version : '';
                            const short = ver && ver !== 'unknown' ? ver.slice(0, 7) : ver;
                            const current = WEEK_NOTES_VERSION;
                            const currentShort = current && current !== 'unknown' ? current.slice(0, 7) : current;
                            const matches = ver && current && ver === current;
                            const cls = !ver ? 'ctx-version missing' : (matches ? 'ctx-version match' : 'ctx-version mismatch');
                            const icon = !ver ? '⚠️' : (matches ? '✓' : 'ℹ️');
                            const label = !ver ? 'Mangler .week-notes-fil' : (matches ? 'Samme som denne serveren' : 'Annen versjon enn serveren');
                            return `<div class="${cls}">
                                <span class="ctx-version-icon">${icon}</span>
                                <span class="ctx-version-meta">
                                    <span class="ctx-version-row"><strong>Kontekst-versjon:</strong> <code>${escapeHtml(short || '—')}</code></span>
                                    <span class="ctx-version-row ctx-version-sub"><span>Server: <code>${escapeHtml(currentShort || 'ukjent')}</code></span> · <span>${escapeHtml(label)}</span></span>
                                </span>
                            </div>`;
                        })()}
                        <div class="ctx-form-grid">
                            <label>Navn<input type="text" name="name" value="${escapeHtml(c.settings.name || '')}" required></label>
                            <label>Ikon${iconPickerHtml('icon', c.settings.icon || '📁', 'pick-' + c.id)}</label>
                        </div>
                        <label>Beskrivelse<textarea name="description" rows="2">${escapeHtml(c.settings.description || '')}</textarea></label>

                        <fieldset class="theme-block">
                            <legend>Tema</legend>
                            <div class="theme-grid">
                                ${listAllThemes().map(t => {
                                    const selected = (c.settings.theme || 'paper') === t.id;
                                    const v = t.vars || {};
                                    const previewStyle = [
                                        v['surface'] && `--p-surface:${v['surface']}`,
                                        v['surface-head'] && `--p-head:${v['surface-head']}`,
                                        v['border'] && `--p-border:${v['border']}`,
                                        v['accent'] && `--p-accent:${v['accent']}`,
                                        v['text-muted'] && `--p-muted:${v['text-muted']}`,
                                        v['text-subtle'] && `--p-subtle:${v['text-subtle']}`,
                                    ].filter(Boolean).join(';');
                                    return `<label class="theme-swatch theme-${escapeHtml(t.id)}${selected ? ' is-selected' : ''}"${previewStyle ? ` style="${previewStyle}"` : ''}>
                                        <input type="radio" name="theme" value="${escapeHtml(t.id)}"${selected ? ' checked' : ''}>
                                        <span class="theme-preview">
                                            <span class="theme-bar"></span>
                                            <span class="theme-body">
                                                <span class="theme-line theme-line-1"></span>
                                                <span class="theme-line theme-line-2"></span>
                                                <span class="theme-line theme-line-3"></span>
                                            </span>
                                        </span>
                                        <span class="theme-name">${escapeHtml(t.name || t.id)}${t.builtin ? '' : ' ✏️'}</span>
                                    </label>`;
                                }).join('')}
                            </div>
                            <p class="theme-builder-link"><a href="/themes">🎨 Tilpass tema →</a></p>
                        </fieldset>
                    </div>
                    </div>
                    <div class="ctx-tab-panel" data-panel="tags">
                    <div class="ctx-detail-section">
                        <h3>🏷️ Tagger</h3>
                        <p class="section-hint">Tagger (tema) tilgjengelig for autofullføring i notatredigereren og som filter på <a href="/notes">notater-siden</a>.</p>
                        <label>Tilgjengelige tagger
                            <tag-editor name="availableThemes" value="${escapeHtml((Array.isArray(c.settings.availableThemes) ? c.settings.availableThemes : []).join(','))}" placeholder="Skriv tag og trykk Enter…"></tag-editor>
                        </label>
                    </div>
                    </div>
                    <div class="ctx-tab-panel" data-panel="meetings">
                    <div class="ctx-detail-section">
                        <h3>🗓️ Arbeidstid</h3>
                        <fieldset class="workhours-block">
                            <legend>Arbeidstid pr. dag</legend>
                            ${(function(){
                                const labels = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];
                                const wh = getWorkHours(c.id).hours;
                                const hourOpts = (sel) => Array.from({length:24},(_,h)=>{const v=String(h).padStart(2,'0');return `<option value="${v}"${sel===v?' selected':''}>${v}</option>`;}).join('');
                                const minOpts = (sel) => Array.from({length:12},(_,k)=>{const v=String(k*5).padStart(2,'0');return `<option value="${v}"${sel===v?' selected':''}>${v}</option>`;}).join('');
                                return '<div class="wh-week">' + labels.map((lbl, i) => {
                                    const day = wh[i];
                                    const on = !!day;
                                    const sH = on ? day.start.slice(0,2) : '08';
                                    const sM = on ? day.start.slice(3,5) : '00';
                                    const eH = on ? day.end.slice(0,2) : '16';
                                    const eM = on ? day.end.slice(3,5) : '00';
                                    return `<div class="wh-day${on?' on':''}">
                                        <label class="wh-on"><input type="checkbox" name="wh-on-${i}"${on?' checked':''}><span class="wh-day-name">${lbl}</span></label>
                                        <div class="wh-times">
                                            <span class="time-pick"><select name="wh-sH-${i}" class="t-h">${hourOpts(sH)}</select><span class="t-sep">:</span><select name="wh-sM-${i}" class="t-m">${minOpts(sM)}</select></span>
                                            <span class="wh-dash">→</span>
                                            <span class="time-pick"><select name="wh-eH-${i}" class="t-h">${hourOpts(eH)}</select><span class="t-sep">:</span><select name="wh-eM-${i}" class="t-m">${minOpts(eM)}</select></span>
                                        </div>
                                        <div class="wh-off-label">Fri</div>
                                    </div>`;
                                }).join('') + '</div>';
                            })()}
                        </fieldset>
                    </div>
                    <div class="ctx-detail-section" data-mt="${escapeHtml(c.id)}">
                        <h3>✏️ Møtetyper</h3>
                        <p class="section-hint">Definerer kategorier for møter i kalenderen i denne konteksten.</p>
                        <div class="mt-list" data-mt-list="${escapeHtml(c.id)}"></div>
                        <button type="button" class="btn-cancel mt-add" data-mt-add="${escapeHtml(c.id)}" style="margin-top:8px">+ Ny type</button>
                        <script type="application/json" data-mt-init="${escapeHtml(c.id)}">${JSON.stringify(loadMeetingTypes(c.id)).replace(/</g, '\\u003c')}</script>
                    </div>
                    </div>
                    <div class="ctx-tab-panel" data-panel="git">
                    <div class="ctx-detail-section">
                        <h3>📦 Status</h3>
                        ${formatGitStatus(c)}
                    </div>
                    <div class="ctx-detail-section">
                        <h3>🔗 Git-remote</h3>
                        <label>Git-remote (origin)<input type="text" name="remote" value="${escapeHtml(c.settings.remote || '')}" placeholder="git@github.com:bruker/repo.git" spellcheck="false"></label>
                        ${(c.settings.remote || '').trim() ? `
                        <div class="git-remote-actions">
                            <button type="button" class="btn-pull" data-pull="${escapeHtml(c.id)}">📥 Pull fra remote</button>
                            <span class="git-action-status" data-pull-status="${escapeHtml(c.id)}"></span>
                        </div>` : ''}
                    </div>
                    ${(c.settings.remote || '').trim() ? `
                    <div class="ctx-detail-section">
                        <h3>🔌 Koble fra</h3>
                        <p class="section-hint">Committer alle endringer, pusher til origin og fjerner den lokale mappen. Git-URLen huskes lokalt så du kan klone den tilbake senere.</p>
                        <button type="button" class="btn-disconnect" data-disconnect="${escapeHtml(c.id)}" data-name="${escapeHtml(c.settings.name || c.id)}">🔌 Koble fra denne konteksten</button>
                    </div>` : ''}
                    </div>
                    <div class="ctx-detail-actions">
                        <button type="submit" class="btn-primary">💾 Lagre endringer</button>
                        <span class="settings-status" data-status="${escapeHtml(c.id)}"></span>
                    </div>
                </form>
            </div>`;
        const newPane = `
            <div class="ctx-detail" data-detail="__new">
                <div class="ctx-detail-head">
                    <span class="ctx-icon-lg">➕</span>
                    <div style="flex:1"><h2 style="margin:0">Ny kontekst</h2><div class="ctx-id">Opprett en ny isolert arbeidsmiljø</div></div>
                </div>
                <form id="newCtxForm" class="ctx-edit-form">
                    <div class="ctx-detail-section">
                        <div class="ctx-form-grid">
                            <label>Navn<input type="text" id="newName" placeholder="f.eks. Privat" required></label>
                            <label>Ikon${iconPickerHtml('icon', '📁', 'pick-new', 'newIcon')}</label>
                        </div>
                        <label>Beskrivelse<textarea id="newDescription" rows="2"></textarea></label>
                        <label>Git-remote (valgfritt)<input type="text" id="newRemote" placeholder="git@github.com:bruker/repo.git" spellcheck="false"></label>
                    </div>
                    <div class="ctx-detail-actions">
                        <button type="submit" class="btn-primary">➕ Opprett</button>
                        <span id="newCtxStatus" class="settings-status"></span>
                    </div>
                </form>
            </div>`;
        const clonePane = `
            <div class="ctx-detail" data-detail="__clone">
                <div class="ctx-detail-head">
                    <span class="ctx-icon-lg">📥</span>
                    <div style="flex:1"><h2 style="margin:0">Klon fra remote</h2><div class="ctx-id">Hent en eksisterende kontekst fra en git-remote</div></div>
                </div>
                <form id="cloneCtxForm" class="ctx-edit-form">
                    <div class="ctx-detail-section">
                        <label>Git-remote<input type="text" id="cloneRemote" placeholder="git@github.com:bruker/repo.git" spellcheck="false" required></label>
                        <label>Navn (valgfritt — utledes fra repo-URLen)<input type="text" id="cloneName" placeholder="overstyr utledet navn" spellcheck="false"></label>
                        <div id="knownRepos" class="known-repos" hidden>
                            <div class="known-repos__label">Tidligere koblet fra:</div>
                            <ul class="known-repos__list"></ul>
                        </div>
                        <p class="section-hint">Repoet klones til <code>data/&lt;navn&gt;/</code>. Hvis det allerede finnes en <code>settings.json</code> i repoet brukes den.</p>
                    </div>
                    <div class="ctx-detail-actions">
                        <button type="submit" class="btn-primary">📥 Klon</button>
                        <span id="cloneCtxStatus" class="settings-status"></span>
                    </div>
                </form>
            </div>`;
        const emptyBanner = '';
        const body = `
            <h1>⚙️ Kontekster</h1>
            <p style="color:#718096;margin-bottom:18px">Hver kontekst har sine egne notater, oppgaver, personer, møter og resultater. Data er fullstendig isolert mellom kontekster.</p>
            ${emptyBanner}
            <div class="ctx-page">
                <aside class="ctx-rail">
                    ${all.map(railItem).join('')}
                    <button type="button" class="ctx-rail-item ctx-rail-new" data-target="__new">
                        <span class="ctx-rail-icon">➕</span>
                        <span class="ctx-rail-text"><span class="ctx-rail-name">Ny kontekst</span><span class="ctx-rail-id">opprett ny</span></span>
                    </button>
                    <button type="button" class="ctx-rail-item ctx-rail-new" data-target="__clone">
                        <span class="ctx-rail-icon">📥</span>
                        <span class="ctx-rail-text"><span class="ctx-rail-name">Klon fra remote</span><span class="ctx-rail-id">hent fra git</span></span>
                    </button>
                </aside>
                <section class="ctx-pane">
                    ${all.map(detailPane).join('')}
                    ${newPane}
                    ${clonePane}
                </section>
            </div>

            <style>
                body:has(.ctx-page) { max-width: none; }
                .ctx-page { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
                @media (max-width: 760px) { .ctx-page { grid-template-columns: 1fr; } }
                .ctx-rail { display: flex; flex-direction: column; gap: 4px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; position: sticky; top: 16px; }
                .ctx-rail-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: none; border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-family: inherit; text-align: left; color: var(--accent); }
                .ctx-rail-item:hover { background: var(--surface-head); }
                .ctx-rail-item.selected { background: #ebf2fa; border-color: #b9c8e0; }
                .ctx-rail-item.is-active.selected { background: #e6efff; border-color: var(--accent); }
                .ctx-rail-icon { font-size: 1.4em; flex-shrink: 0; }
                .ctx-rail-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
                .ctx-rail-name { font-weight: 600; font-size: 0.95em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ctx-rail-id { font-family: ui-monospace, monospace; font-size: 0.72em; color: var(--text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ctx-rail-badge { color: var(--accent); font-size: 1.2em; line-height: 1; }
                .ctx-rail-new { color: var(--text-muted); }
                .ctx-rail-new:first-of-type { border-top: 1px dashed var(--border); border-radius: 0; margin-top: 6px; padding-top: 12px; }
                .ctx-rail-new + .ctx-rail-new { margin-top: 0; padding-top: 10px; }
                .ctx-rail-new .ctx-rail-name { color: var(--text-muted); }

                .ctx-pane { min-width: 0; }
                .ctx-detail { display: none; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 22px 26px; }
                .ctx-detail.visible { display: block; }
                .ctx-detail-head { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--border-faint); }
                .ctx-detail-head .ctx-id { color: var(--text-subtle); font-family: ui-monospace, monospace; font-size: 0.8em; margin-top: 2px; }
                .ctx-detail-section { margin-bottom: 22px; }
                .ctx-detail-section:last-child { margin-bottom: 0; }
                .ctx-detail-section h3 { margin: 0 0 10px; font-size: 0.95em; color: var(--accent); font-weight: 600; }
                .ctx-tabs { display:flex; gap:4px; margin: 0 0 18px; border-bottom: 1px solid var(--border-faint); }
                .ctx-tab-btn { background:transparent; border:none; border-bottom:2px solid transparent; padding:8px 14px; font-size:0.92em; color:var(--text-muted-warm); cursor:pointer; margin-bottom:-1px; border-radius:0; transition:color 0.12s, border-color 0.12s, background 0.12s; }
                .ctx-tab-btn:hover { color:var(--text-strong); background:var(--surface-alt); }
                .ctx-tab-btn.is-active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
                .ctx-tab-panel { display:none; }
                .ctx-tab-panel.is-active { display:block; }
                .ctx-detail-section .section-hint { margin: -6px 0 10px; font-size: 0.85em; color: var(--text-muted-warm); }
                .ctx-detail-actions { display: flex; align-items: center; gap: 12px; padding-top: 14px; border-top: 1px solid var(--border-faint); }
                .ctx-form-grid { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
                .workhours-block { border:1px solid var(--border-faint); border-radius:8px; padding:14px 16px 16px; margin-top:6px; background:var(--surface); }
                .workhours-block legend { font-size:0.85em; color:var(--text-muted-warm); padding:0 6px; }
                .theme-block { border:1px solid var(--border-faint); border-radius:6px; padding:10px 14px 14px; margin-top:6px; background:var(--surface); }
                .theme-block legend { font-size:0.85em; color:var(--text-muted-warm); padding:0 6px; }
                .theme-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:10px; margin-top:6px; }
                .theme-swatch { display:flex; flex-direction:column; align-items:stretch; cursor:pointer; padding:6px; border:1px solid var(--border-faint); border-radius:6px; background:var(--bg); transition:border-color 0.12s, box-shadow 0.12s, transform 0.08s; }
                .theme-swatch input { position:absolute; opacity:0; pointer-events:none; }
                .theme-swatch:hover { border-color:var(--border); transform:translateY(-1px); }
                .theme-swatch.is-selected { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); }
                .theme-preview { display:flex; flex-direction:column; height:64px; border-radius:4px; overflow:hidden; border:1px solid rgba(0,0,0,0.08); }
                .theme-bar { height:14px; flex:0 0 14px; }
                .theme-body { flex:1; padding:6px 8px; display:flex; flex-direction:column; gap:4px; justify-content:flex-start; }
                .theme-line { display:block; height:4px; border-radius:2px; }
                .theme-line-1 { width:80%; }
                .theme-line-2 { width:60%; }
                .theme-line-3 { width:40%; }
                .theme-name { text-align:center; font-size:0.78em; color:var(--text-muted-warm); margin-top:6px; font-weight:600; text-transform:none; letter-spacing:0; }
                .theme-builder-link { margin: 10px 4px 0; font-size: 0.85em; }
                .theme-builder-link a { color: var(--accent); text-decoration: none; font-weight: 600; }
                .theme-builder-link a:hover { text-decoration: underline; }
                .ctx-version { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; margin: 12px 0 6px; border-radius: 6px; border: 1px solid var(--border-faint); background: var(--surface-head); font-size: 0.85em; }
                .ctx-version.match { border-color: #b6dec0; background: #f1faf3; }
                .ctx-version.mismatch { border-color: #f0d589; background: #fef8e8; }
                .ctx-version.missing { border-color: #f5b8b8; background: #fff5f5; }
                .ctx-version-icon { font-size: 1.2em; line-height: 1; padding-top: 2px; }
                .ctx-version-meta { display: flex; flex-direction: column; gap: 2px; flex: 1; }
                .ctx-version-row code { background: var(--surface-alt); padding: 1px 6px; border-radius: 3px; font-size: 0.95em; color: var(--accent); font-family: 'JetBrains Mono', 'Source Code Pro', Consolas, monospace; }
                .ctx-version-sub { color: var(--text-subtle); font-size: 0.92em; }
                /* Generic per-swatch preview palette using inline --p-* custom props.
                   Each swatch sets its own colors via inline style; built-ins and
                   custom themes share the same renderer. */
                .theme-swatch .theme-preview { background: var(--p-surface, var(--surface)); }
                .theme-swatch .theme-bar { background: var(--p-head, var(--p-surface, var(--surface-head))); border-bottom: 1px solid var(--p-border, var(--border-faint)); }
                .theme-swatch .theme-line-1 { background: var(--p-accent, var(--accent)); }
                .theme-swatch .theme-line-2 { background: var(--p-muted, var(--text-muted)); }
                .theme-swatch .theme-line-3 { background: var(--p-subtle, var(--text-subtle)); }
                .wh-week { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:8px; }
                .wh-day { display:flex; flex-direction:column; align-items:center; gap:8px; padding:10px 6px 12px; border-radius:8px; border:1px solid var(--border-faint); background:transparent; transition: background 0.12s, border-color 0.12s, opacity 0.12s; }
                .wh-day.on { background:var(--surface-alt); border-color:var(--border-soft); }
                .wh-day:not(.on) { opacity:0.7; }
                .wh-on { display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; margin:0; }
                .wh-on input { margin:0; accent-color:var(--accent); width:15px; height:15px; cursor:pointer; }
                .wh-day-name { font-size:0.85em; font-weight:600; color:var(--text); letter-spacing:0.04em; text-transform:uppercase; }
                .wh-day:not(.on) .wh-day-name { color:var(--text-subtle); }
                .wh-times { display:flex; flex-direction:column; align-items:center; gap:4px; }
                .wh-day:not(.on) .wh-times { display:none; }
                .wh-day.on .wh-off-label { display:none; }
                .wh-off-label { color:var(--text-subtle); font-size:0.85em; font-style:italic; letter-spacing:0.04em; }
                .wh-dash { color:var(--text-muted-warm); font-weight:500; line-height:1; }
                @media (max-width: 980px) { .wh-week { grid-template-columns:repeat(4, 1fr); } }
                @media (max-width: 560px) { .wh-week { grid-template-columns:repeat(2, 1fr); } }
                .ctx-active-badge { background: var(--accent); color: var(--surface); font-size: 0.75em; padding: 4px 10px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
                .ctx-icon-lg { font-size: 2em; line-height: 1; }
                .ctx-desc { margin-bottom: 16px; padding: 10px 14px; background: var(--surface-head); border-left: 3px solid var(--border); border-radius: 4px; color: var(--text-muted); font-size: 0.9em; font-style: italic; }
                .ctx-edit-form label { display: block; font-size: 0.8em; color: var(--text-muted); font-weight: 600; margin-bottom: 12px; }
                .ctx-edit-form input[type=text], .ctx-edit-form textarea { width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--border); border-radius: 4px; font-family: inherit; font-size: 0.93em; margin-top: 4px; background: var(--bg); color: var(--text-strong); }
                .ctx-edit-form .icon-input { width: 70px; font-size: 1.4em; text-align: center; }

                .git-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 0.85em; color: var(--text-muted); }
                .git-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 0.95em; border: 1px solid transparent; }
                .git-pill.clean { background: #e6f4ea; color: #1e6b3a; border-color: #b6dec0; }
                .git-pill.dirty { background: #fef0c7; color: #8a5a00; border-color: #f0d589; }
                .git-pill.remote { background: #e6efff; color: var(--accent); border-color: #b9c8e0; }
                .git-pill.no-remote { background: #f3eddc; color: #8a7a4a; border-color: var(--border); }
                .btn-push { background: var(--accent); color: var(--surface); border: none; padding: 2px 10px; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 0.78em; font-weight: 600; }
                .btn-push:hover:not(:disabled) { background: var(--accent-strong); }
                .btn-push:disabled { opacity: 0.6; cursor: wait; }
                .git-last { color: var(--text-muted); }
                .git-last.muted { color: var(--text-subtle); font-style: italic; }
                .git-last code { background: var(--surface-alt); padding: 1px 5px; border-radius: 3px; font-size: 0.95em; color: var(--accent); }
                .git-when { color: var(--text-subtle); font-weight: 400; }
                .git-dot.off { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #c8b88f; margin-right: 4px; }

                .mt-list { display: flex; flex-direction: column; gap: 6px; }
                .mt-row { display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 6px; border: 1px solid transparent; transition: background 0.12s, border-color 0.12s; }
                .mt-row.is-dragging { opacity: 0.4; }
                .mt-row.drag-over { border-color: var(--accent); background: var(--accent-soft); }
                .mt-row .mt-handle { cursor: grab; color: var(--text-subtle); font-size: 1.1em; line-height: 1; padding: 4px 2px; user-select: none; flex-shrink: 0; }
                .mt-row .mt-handle:active { cursor: grabbing; }
                .mt-row .mt-handle:hover { color: var(--text-muted-warm); }
                .mt-row .mt-icon { width: 38px; height: 38px; font-size: 1.3em; cursor: pointer; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }
                .mt-row .mt-icon:hover { background: var(--surface-alt); }
                .mt-row input[type=text] { flex: 1; padding: 7px 10px; margin: 0; }
                .mt-row input.mt-mins { width: 64px; padding: 7px 8px; margin: 0; text-align: right; font-variant-numeric: tabular-nums; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-strong); font-family: inherit; box-sizing: border-box; }
                .mt-row .mt-mins-suffix { font-size: 0.82em; color: var(--text-muted-warm); margin-left: -4px; }
                .mt-row .mt-del { background: #fff5f5; color: #c53030; border: 1px solid #fed7d7; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.85em; }
                .mt-row .mt-del:hover { background: #fed7d7; }
                .mt-icon-picker { display: none; position: fixed; inset: 0; background: rgba(26,32,44,0.55); z-index: 1100; align-items: center; justify-content: center; }
                .mt-icon-picker.open { display: flex; }
                .mt-icon-picker-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; }
                .mt-icon-picker-card h4 { margin: 0 0 10px; }
                .mt-icon-grid { display: grid; grid-template-columns: repeat(8, 42px); gap: 6px; max-height: 70vh; overflow-y: auto; }
                .mt-icon-grid button { width: 42px; height: 42px; font-size: 1.5em; background: var(--bg); border: 1px solid var(--border-faint); border-radius: 4px; cursor: pointer; padding: 0; line-height: 1; }
                .mt-icon-grid button:hover { background: var(--surface-alt); border-color: var(--accent); }
                .mt-icon-grid .mt-grp-label { grid-column: 1 / -1; font-size: 0.72em; font-weight: 600; color: var(--text-muted-warm); text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 2px 2px; border-bottom: 1px solid var(--border-faint); }
                .mt-icon-grid .mt-grp-label:first-child { padding-top: 0; }

                .btn-primary { background: var(--accent); color: var(--surface); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.95em; font-weight: 600; }
                .btn-primary:hover { background: var(--accent-strong); }
                .btn-cancel { background: none; border: 1px solid var(--border); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; color: var(--text-muted-warm); font-size: 0.9em; }
                .btn-cancel:hover { background: var(--surface-alt); }
                .btn-disconnect { background: none; border: 1px solid #f5b7b7; color: #c53030; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.9em; }
                .btn-disconnect:hover { background: #fff5f5; border-color: #e53e3e; }
                .git-remote-actions { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
                .btn-pull { background: var(--surface-alt); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.9em; }
                .btn-pull:hover:not(:disabled) { background: var(--surface-head); border-color: var(--accent); }
                .btn-pull:disabled { opacity: 0.6; cursor: wait; }
                .git-action-status { font-size: 0.85em; color: var(--text-subtle); }
                .git-action-status.is-ok { color: #2f855a; }
                .git-action-status.is-err { color: #c53030; }
                .ctx-detail-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
                .settings-status { font-size: 0.85em; color: #2f855a; }

                .known-repos { margin-top: 10px; padding: 10px 12px; background: var(--surface-alt); border: 1px solid var(--border-faint); border-radius: 6px; }
                .known-repos__label { font-size: 0.85em; color: var(--text-subtle); margin-bottom: 8px; font-weight: 600; }
                .known-repos__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
                .known-repos__list li { display: flex; align-items: stretch; gap: 4px; }
                .known-repos__pick { flex: 1; display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; font-family: inherit; text-align: left; }
                .known-repos__pick:hover { background: var(--bg); border-color: var(--accent); }
                .known-repos__icon { font-size: 1.2em; flex-shrink: 0; }
                .known-repos__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
                .known-repos__meta strong { font-size: 0.95em; color: var(--text); }
                .known-repos__meta span { font-family: ui-monospace, monospace; font-size: 0.8em; color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .known-repos__forget { background: none; border: 1px solid var(--border-faint); color: var(--text-subtle); border-radius: 5px; padding: 0 10px; cursor: pointer; font-family: inherit; }
                .known-repos__forget:hover { background: #fff5f5; border-color: #f5b7b7; color: #c53030; }

                .icon-picker { position: relative; display: inline-block; margin-top: 4px; }
                .icon-trigger { display: inline-flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; cursor: pointer; font-family: inherit; }
                .icon-trigger:hover { background: var(--surface-alt); }
                .icon-current { font-size: 1.5em; line-height: 1; }
                .icon-caret { font-size: 0.75em; color: var(--text-muted-warm); }
                .icon-grid { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 24px rgba(26,54,93,0.12); padding: 6px; z-index: 1000; grid-template-columns: repeat(5, 1fr); gap: 4px; width: 220px; }
                .icon-picker.open .icon-grid { display: grid; }
                .icon-option { background: none; border: 1px solid transparent; border-radius: 4px; padding: 4px; font-size: 1.4em; line-height: 1; cursor: pointer; }
                .icon-option:hover { background: var(--surface-alt); }
                .icon-option.selected { background: #ebf2fa; border-color: var(--accent); }
            </style>

            <div id="mtIconPicker" class="mt-icon-picker" onclick="if(event.target===this)this.classList.remove('open')">
                <div class="mt-icon-picker-card">
                    <h4>Velg ikon</h4>
                    <div id="mtIconGrid" class="mt-icon-grid"></div>
                </div>
            </div>

            <script>
                document.querySelectorAll('.ctx-rail-item').forEach(b => b.addEventListener('click', () => {
                    const target = b.getAttribute('data-target');
                    document.querySelectorAll('.ctx-rail-item.selected').forEach(x => x.classList.remove('selected'));
                    b.classList.add('selected');
                    document.querySelectorAll('.ctx-detail').forEach(d => d.classList.toggle('visible', d.getAttribute('data-detail') === target));
                }));
                document.querySelectorAll('.icon-picker').forEach(picker => {
                    const trigger = picker.querySelector('[data-icon-trigger]');
                    const hidden = picker.querySelector('input[type="hidden"]');
                    const currentSpan = picker.querySelector('.icon-current');
                    trigger.addEventListener('click', e => {
                        e.stopPropagation();
                        document.querySelectorAll('.icon-picker.open').forEach(p => { if (p !== picker) p.classList.remove('open'); });
                        picker.classList.toggle('open');
                    });
                    picker.querySelectorAll('.icon-option').forEach(btn => btn.addEventListener('click', () => {
                        const ic = btn.getAttribute('data-icon');
                        hidden.value = ic;
                        currentSpan.textContent = ic;
                        picker.querySelectorAll('.icon-option.selected').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        picker.classList.remove('open');
                    }));
                });
                document.addEventListener('click', e => {
                    document.querySelectorAll('.icon-picker.open').forEach(p => { if (!p.contains(e.target)) p.classList.remove('open'); });
                });
                document.querySelectorAll('[data-push]').forEach(b => b.addEventListener('click', () => {
                    const id = b.getAttribute('data-push');
                    const orig = b.textContent;
                    b.disabled = true;
                    b.textContent = '⏳ Pusher...';
                    fetch('/api/contexts/' + encodeURIComponent(id) + '/push', { method: 'POST' })
                        .then(r => r.json()).then(d => {
                            if (d.ok) {
                                b.textContent = '✓ Pushed';
                                setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                            } else {
                                b.textContent = '✗ Feilet';
                                alert('Push feilet:\\n\\n' + (d.error || 'Ukjent feil'));
                                setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                            }
                        }).catch(err => {
                            b.textContent = '✗ Feilet';
                            alert('Push feilet: ' + err);
                            setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                        });
                }));
                document.querySelectorAll('[data-pull]').forEach(b => b.addEventListener('click', () => {
                    const id = b.getAttribute('data-pull');
                    const status = document.querySelector('[data-pull-status="' + id + '"]');
                    const orig = b.textContent;
                    b.disabled = true;
                    b.textContent = '⏳ Puller...';
                    if (status) { status.textContent = ''; status.className = 'git-action-status'; }
                    fetch('/api/contexts/' + encodeURIComponent(id) + '/pull', { method: 'POST' })
                        .then(r => r.json()).then(d => {
                            if (d.ok) {
                                b.textContent = '✓ Pulled';
                                if (status) {
                                    status.className = 'git-action-status is-ok';
                                    const out = (d.output || '').trim();
                                    status.textContent = /already up.to.date/i.test(out) ? 'Allerede oppdatert' : 'Hentet endringer — last siden på nytt for å se dem';
                                }
                                setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                            } else {
                                b.textContent = '✗ Feilet';
                                if (status) { status.className = 'git-action-status is-err'; status.textContent = 'Pull feilet'; }
                                alert('Pull feilet:\\n\\n' + (d.error || 'Ukjent feil'));
                                setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                            }
                        }).catch(err => {
                            b.textContent = '✗ Feilet';
                            if (status) { status.className = 'git-action-status is-err'; status.textContent = String(err); }
                            alert('Pull feilet: ' + err);
                            setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1800);
                        });
                }));
                document.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', () => {
                    const id = b.getAttribute('data-switch');
                    fetch('/api/contexts/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
                        .then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert(d.error); });
                }));
                (function(){
                    const TAB_KEY = 'ctxSettingsTab';
                    const VALID = ['general','tags','meetings','git'];
                    function applyTab(tab) {
                        if (!VALID.includes(tab)) tab = 'general';
                        document.querySelectorAll('.ctx-detail').forEach(detail => {
                            detail.querySelectorAll('.ctx-tab-btn').forEach(b => b.classList.toggle('is-active', b.getAttribute('data-tab') === tab));
                            detail.querySelectorAll('.ctx-tab-panel').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-panel') === tab));
                        });
                    }
                    let saved = 'general';
                    try { saved = localStorage.getItem(TAB_KEY) || 'general'; } catch {}
                    applyTab(saved);
                    document.querySelectorAll('.ctx-detail').forEach(detail => {
                        detail.querySelectorAll('.ctx-tab-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const target = btn.getAttribute('data-tab');
                                try { localStorage.setItem(TAB_KEY, target); } catch {}
                                applyTab(target);
                            });
                        });
                    });
                })();
                document.querySelectorAll('.theme-grid').forEach(grid => {
                    grid.addEventListener('change', e => {
                        if (!e.target.matches('input[name="theme"]')) return;
                        grid.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('is-selected'));
                        e.target.closest('.theme-swatch').classList.add('is-selected');
                        // Live preview only on the active context's form (the
                        // page's stylesheet reflects whichever context is active)
                        const form = grid.closest('form[data-form]');
                        const detail = grid.closest('.ctx-detail');
                        const isActive = detail && detail.querySelector('.ctx-active-badge');
                        if (isActive) {
                            const link = document.getElementById('themeStylesheet');
                            if (link) link.href = '/themes/' + e.target.value + '.css';
                        }
                    });
                });
                document.querySelectorAll('form[data-form]').forEach(form => form.addEventListener('submit', e => {
                    e.preventDefault();
                    const id = form.getAttribute('data-form');
                    const fd = new FormData(form);
                    const data = {
                        name: fd.get('name'),
                        icon: fd.get('icon') || '📁',
                        description: fd.get('description'),
                        remote: fd.get('remote') || '',
                        theme: fd.get('theme') || 'paper',
                        availableThemes: (fd.get('availableThemes') || '').split(',').map(s => s.trim()).filter(Boolean),
                        workHours: Array.from({length:7},(_,i)=>{
                            if(!fd.get('wh-on-'+i)) return null;
                            const sH = fd.get('wh-sH-'+i)||'08';
                            const sM = fd.get('wh-sM-'+i)||'00';
                            const eH = fd.get('wh-eH-'+i)||'16';
                            const eM = fd.get('wh-eM-'+i)||'00';
                            return { start: sH+':'+sM, end: eH+':'+eM };
                        })
                    };
                    const status = document.querySelector('[data-status="' + id + '"]');
                    const types = (window.__mtState && window.__mtState[id]) || null;
                    function putSettings(force) {
                        const body = Object.assign({}, data, force ? { __force: true } : {});
                        return fetch('/api/contexts/' + encodeURIComponent(id) + '/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
                    }
                    const typesP = types
                        ? fetch('/api/contexts/' + encodeURIComponent(id) + '/meeting-types', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(types) }).then(r => r.json())
                        : Promise.resolve({ ok: true });
                    Promise.all([putSettings(false), typesP]).then(([s, t]) => {
                        if (s.ok && t.ok) { status.textContent = '✓ Lagret'; setTimeout(() => location.reload(), 600); return; }
                        if (s.needsConfirm && t.ok && confirm(s.error + '\\n\\nVil du opprette .week-notes-fil og fortsette?')) {
                            return putSettings(true).then(s2 => {
                                if (s2.ok) { status.textContent = '✓ Lagret'; setTimeout(() => location.reload(), 600); }
                                else { status.textContent = '✗ ' + s2.error; status.style.color = '#c53030'; }
                            });
                        }
                        status.textContent = '✗ ' + (s.error || t.error); status.style.color = '#c53030';
                    });
                }));
                document.querySelectorAll('button[data-disconnect]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-disconnect');
                        const name = btn.getAttribute('data-name') || id;
                        if (!confirm('Koble fra "' + name + '"?\\n\\nDette vil:\\n  • committe alle endringer\\n  • pushe til origin\\n  • slette den lokale mappen\\n\\nGit-URLen huskes lokalt så du kan klone den tilbake senere.')) return;
                        const status = document.querySelector('[data-status="' + id + '"]');
                        if (status) { status.textContent = '⏳ Kobler fra…'; status.style.color = ''; }
                        fetch('/api/contexts/' + encodeURIComponent(id) + '/disconnect', { method: 'POST' })
                            .then(r => r.json()).then(d => {
                                if (d.ok) { if (status) status.textContent = '✓ Koblet fra'; setTimeout(() => location.href = '/settings', 600); }
                                else if (status) { status.textContent = '✗ ' + d.error; status.style.color = '#c53030'; }
                            }).catch(err => { if (status) { status.textContent = '✗ ' + err; status.style.color = '#c53030'; } });
                    });
                });
                document.querySelectorAll('.wh-day .wh-on input').forEach(cb => {
                    cb.addEventListener('change', () => {
                        cb.closest('.wh-day').classList.toggle('on', cb.checked);
                    });
                });
                (function() {
                    const ICON_GROUPS = [
                        { label: 'Personer', icons: ['👥','🤝','👋','🙌','👀','🗣️','💬','🗨️'] },
                        { label: 'Kommunikasjon', icons: ['📞','☎️','📱','📧','📨','📤','📥','🔔'] },
                        { label: 'Dokumenter', icons: ['📋','📝','✏️','📎','📌','📍','📅','🗓️'] },
                        { label: 'Planlegging', icons: ['📊','📈','📉','🎯','🧠','💡','🔍','⚖️'] },
                        { label: 'Arbeid', icons: ['🖥️','💻','🛠️','🔧','⚙️','🧪','🔬','🚀'] },
                        { label: 'Tid & status', icons: ['⏰','⏳','⌛','🟢','🟡','🔴','🔵','⚡'] },
                        { label: 'Feiring', icons: ['🎉','🎊','🎁','🎈','🍰','🏆','🎖️','🥇'] },
                        { label: 'Media & læring', icons: ['🎬','📷','📹','🎤','🎵','🎓','📚','☕'] },
                        { label: 'Mat & drikke', icons: ['🍕','🍔','🍱','🍷','🍺','🥂','🍻','🥗'] },
                        { label: 'Sport', icons: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','⛳','🏌️','🏓','🏸','🥊','🏃','🚴','🏊','🧗'] },
                        { label: 'Annet', icons: ['✅','❌','❓','❗','⚠️','⭐','🌟','✨'] }
                    ];
                    window.__mtState = {};
                    let pickerCtx = null, pickerIdx = null;
                    function slugKey(label) {
                        const base = (label || 'type').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                        return base + '-' + Math.random().toString(36).slice(2, 6);
                    }
                    function renderList(ctxId) {
                        const list = document.querySelector('[data-mt-list="' + ctxId + '"]');
                        const types = window.__mtState[ctxId];
                        list.innerHTML = '';
                        types.forEach((t, i) => {
                            const row = document.createElement('div');
                            row.className = 'mt-row';
                            row.dataset.i = i;
                            const mins = (t.mins != null && t.mins !== '') ? t.mins : 60;
                            row.innerHTML = '<span class="mt-handle" title="Dra for å sortere" draggable="true">⋮⋮</span>'
                                + '<button type="button" class="mt-icon" data-i="' + i + '" title="Velg ikon">' + (t.icon || '·') + '</button>'
                                + '<input type="text" class="mt-label" data-i="' + i + '" value="' + (t.label || '').replace(/"/g, '&quot;') + '" placeholder="Navn">'
                                + '<input type="number" class="mt-mins" data-i="' + i + '" value="' + mins + '" min="5" max="600" step="5" title="Standard lengde i minutter">'
                                + '<span class="mt-mins-suffix">min</span>'
                                + '<button type="button" class="mt-del" data-i="' + i + '" title="Slett">🗑️</button>';
                            list.appendChild(row);
                        });
                        list.querySelectorAll('.mt-icon').forEach(b => b.onclick = () => openPicker(ctxId, parseInt(b.dataset.i, 10)));
                        list.querySelectorAll('input.mt-label').forEach(inp => inp.oninput = () => { types[parseInt(inp.dataset.i, 10)].label = inp.value; });
                        list.querySelectorAll('input.mt-mins').forEach(inp => inp.oninput = () => {
                            const v = parseInt(inp.value, 10);
                            types[parseInt(inp.dataset.i, 10)].mins = (v > 0 && v <= 600) ? v : 60;
                        });
                        list.querySelectorAll('.mt-del').forEach(b => b.onclick = () => { types.splice(parseInt(b.dataset.i, 10), 1); renderList(ctxId); });
                        // Drag-to-reorder via the handle
                        list.querySelectorAll('.mt-handle').forEach(h => {
                            const row = h.closest('.mt-row');
                            h.addEventListener('dragstart', e => {
                                row.classList.add('is-dragging');
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', String(row.dataset.i));
                                try { e.dataTransfer.setDragImage(row, 20, 20); } catch {}
                            });
                            h.addEventListener('dragend', () => {
                                row.classList.remove('is-dragging');
                                list.querySelectorAll('.mt-row.drag-over').forEach(r => r.classList.remove('drag-over'));
                            });
                        });
                        list.querySelectorAll('.mt-row').forEach(row => {
                            row.addEventListener('dragover', e => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                list.querySelectorAll('.mt-row.drag-over').forEach(r => { if (r !== row) r.classList.remove('drag-over'); });
                                row.classList.add('drag-over');
                            });
                            row.addEventListener('dragleave', e => {
                                if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
                            });
                            row.addEventListener('drop', e => {
                                e.preventDefault();
                                row.classList.remove('drag-over');
                                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                const toIdx = parseInt(row.dataset.i, 10);
                                if (Number.isNaN(fromIdx) || Number.isNaN(toIdx) || fromIdx === toIdx) return;
                                const rect = row.getBoundingClientRect();
                                const after = (e.clientY - rect.top) > rect.height / 2;
                                let target = after ? toIdx + 1 : toIdx;
                                const [moved] = types.splice(fromIdx, 1);
                                if (fromIdx < target) target -= 1;
                                types.splice(target, 0, moved);
                                renderList(ctxId);
                            });
                        });
                    }
                    function openPicker(ctxId, idx) {
                        pickerCtx = ctxId; pickerIdx = idx;
                        document.getElementById('mtIconPicker').classList.add('open');
                    }
                    function renderPickerGrid() {
                        const grid = document.getElementById('mtIconGrid');
                        grid.innerHTML = '';
                        ICON_GROUPS.forEach(grp => {
                            const h = document.createElement('div');
                            h.className = 'mt-grp-label';
                            h.textContent = grp.label;
                            grid.appendChild(h);
                            grp.icons.forEach(ic => {
                                const b = document.createElement('button');
                                b.type = 'button';
                                b.textContent = ic;
                                b.onclick = () => {
                                    if (pickerCtx != null && window.__mtState[pickerCtx] && window.__mtState[pickerCtx][pickerIdx]) {
                                        window.__mtState[pickerCtx][pickerIdx].icon = ic;
                                        renderList(pickerCtx);
                                    }
                                    document.getElementById('mtIconPicker').classList.remove('open');
                                };
                                grid.appendChild(b);
                            });
                        });
                    }
                    document.querySelectorAll('[data-mt-init]').forEach(s => {
                        const ctxId = s.getAttribute('data-mt-init');
                        try { window.__mtState[ctxId] = JSON.parse(s.textContent); }
                        catch { window.__mtState[ctxId] = []; }
                        renderList(ctxId);
                    });
                    document.querySelectorAll('[data-mt-add]').forEach(b => b.onclick = () => {
                        const ctxId = b.getAttribute('data-mt-add');
                        window.__mtState[ctxId].push({ key: slugKey('ny'), icon: '👥', label: 'Ny type', mins: 60 });
                        renderList(ctxId);
                    });
                    renderPickerGrid();
                    document.addEventListener('keydown', e => {
                        if (e.key === 'Escape') document.getElementById('mtIconPicker').classList.remove('open');
                    });
                })();
                document.getElementById('newCtxForm').addEventListener('submit', e => {
                    e.preventDefault();
                    const s = document.getElementById('newCtxStatus');
                    s.style.color = '';
                    function send(force) {
                        s.textContent = force ? '⏳ Oppretter (bekreftet)…' : '⏳ Oppretter…';
                        const data = {
                            name: document.getElementById('newName').value,
                            icon: document.getElementById('newIcon').value || '📁',
                            description: document.getElementById('newDescription').value,
                            remote: document.getElementById('newRemote').value,
                            force: !!force
                        };
                        return fetch('/api/contexts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
                    }
                    send(false).then(d => {
                        if (d.ok) { s.textContent = '✓ Opprettet'; setTimeout(() => location.reload(), 600); return; }
                        if (d.needsConfirm && confirm(d.error + '\\n\\nVil du opprette .week-notes-fil og fortsette?')) {
                            return send(true).then(d2 => {
                                if (d2.ok) { s.textContent = '✓ Opprettet'; setTimeout(() => location.reload(), 600); }
                                else { s.textContent = '✗ ' + d2.error; s.style.color = '#c53030'; }
                            });
                        }
                        s.textContent = '✗ ' + d.error; s.style.color = '#c53030';
                    });
                });
                document.getElementById('cloneCtxForm').addEventListener('submit', e => {
                    e.preventDefault();
                    const s = document.getElementById('cloneCtxStatus');
                    s.style.color = '';
                    function send(force) {
                        s.textContent = force ? '⏳ Kloner (bekreftet)…' : '⏳ Kloner…';
                        const data = {
                            remote: document.getElementById('cloneRemote').value,
                            name: document.getElementById('cloneName').value,
                            force: !!force
                        };
                        return fetch('/api/contexts/clone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
                    }
                    send(false).then(d => {
                        if (d.ok) { s.textContent = '✓ Klonet'; setTimeout(() => location.reload(), 600); return; }
                        if (d.needsConfirm && confirm(d.error + '\\n\\nVil du opprette .week-notes-fil og fortsette?')) {
                            return send(true).then(d2 => {
                                if (d2.ok) { s.textContent = '✓ Klonet'; setTimeout(() => location.reload(), 600); }
                                else { s.textContent = '✗ ' + d2.error; s.style.color = '#c53030'; }
                            });
                        }
                        s.textContent = '✗ ' + d.error; s.style.color = '#c53030';
                    }).catch(err => { s.textContent = '✗ ' + err; s.style.color = '#c53030'; });
                });
                (function () {
                    const box = document.getElementById('knownRepos');
                    if (!box) return;
                    const ul = box.querySelector('ul');
                    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
                    fetch('/api/contexts/disconnected').then(r => r.json()).then(list => {
                        if (!Array.isArray(list) || list.length === 0) return;
                        ul.innerHTML = list.map(d =>
                            '<li>'
                            + '<button type="button" class="known-repos__pick" data-remote="' + esc(d.remote) + '" data-name="' + esc(d.name || d.id) + '">'
                            + '<span class="known-repos__icon">' + esc(d.icon || '📁') + '</span>'
                            + '<span class="known-repos__meta"><strong>' + esc(d.name || d.id) + '</strong><span>' + esc(d.remote) + '</span></span>'
                            + '</button>'
                            + '<button type="button" class="known-repos__forget" data-forget="' + esc(d.id) + '" title="Glem denne">✕</button>'
                            + '</li>'
                        ).join('');
                        box.hidden = false;
                        ul.querySelectorAll('.known-repos__pick').forEach(b => {
                            b.addEventListener('click', () => {
                                document.getElementById('cloneRemote').value = b.getAttribute('data-remote');
                                document.getElementById('cloneName').value = b.getAttribute('data-name') || '';
                                document.getElementById('cloneRemote').focus();
                            });
                        });
                        ul.querySelectorAll('.known-repos__forget').forEach(b => {
                            b.addEventListener('click', () => {
                                const id = b.getAttribute('data-forget');
                                fetch('/api/contexts/disconnected/' + encodeURIComponent(id), { method: 'DELETE' })
                                    .then(() => { b.closest('li').remove(); if (!ul.children.length) box.hidden = true; });
                            });
                        });
                    });
                })();
            </script>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Innstillinger', body));
        return;
    }

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


    if (pathname === '/people') {
        const people = loadPeople().sort((a, b) => a.name.localeCompare(b.name, 'nb'));
        const companies = loadCompanies().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb'));
        const places = loadPlaces().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb'));
        const tasks = loadTasks();
        const meetings = loadMeetings();
        const results = loadResults();
        const weeks = getWeekDirs();

        // Pre-compute mentions per text body so we don't re-extract for every person.
        const taskRefs = tasks.map(t => ({ t, mentions: new Set([...extractMentions(t.text), ...extractMentions(t.note || '')]) }));
        const noteRefs = [];
        weeks.forEach(week => {
            getMdFiles(week).forEach(file => {
                try {
                    const content = fs.readFileSync(path.join(dataDir(), week, file), 'utf-8');
                    noteRefs.push({ week, file, mentions: new Set(extractMentions(content)) });
                } catch {}
            });
        });
        const meetingRefs = meetings.map(m => {
            const set = new Set([...(m.attendees || []).map(a => String(a).toLowerCase()), ...extractMentions(m.title || ''), ...extractMentions(m.notes || ''), ...extractMentions(m.location || '')]);
            return { m, mentions: set };
        });
        const resultRefs = results.map(r => {
            const set = new Set([...(r.people || []).map(p => String(p).toLowerCase()), ...extractMentions(r.text || '')]);
            return { r, mentions: set };
        });
        // Pre-compute company → people index for fast member listing
        const companyMembers = new Map(); // companyKey → [{person, primary}]
        people.forEach(p => {
            if (p.primaryCompanyKey) {
                const arr = companyMembers.get(p.primaryCompanyKey) || [];
                arr.push({ person: p, primary: true });
                companyMembers.set(p.primaryCompanyKey, arr);
            }
            (p.extraCompanyKeys || []).forEach(k => {
                if (k === p.primaryCompanyKey) return;
                const arr = companyMembers.get(k) || [];
                arr.push({ person: p, primary: false });
                companyMembers.set(k, arr);
            });
        });
        // Pre-compute place → meetings index
        const placeMeetings = new Map();
        meetings.forEach(m => {
            if (m.placeKey) {
                const arr = placeMeetings.get(m.placeKey) || [];
                arr.push(m);
                placeMeetings.set(m.placeKey, arr);
            }
        });
        const companiesByKey = Object.fromEntries(companies.map(c => [c.key, c]));

        let body = '<div class="people-page">';
        body += `<div class="people-head">
            <h1>👥 Personer og steder</h1>
        </div>`;

        // Tab nav
        body += `<div class="dir-tabs" role="tablist">
            <button class="dir-tab" data-tab="people" role="tab">👤 Personer <span class="dir-tab-c">${people.length}</span></button>
            <button class="dir-tab" data-tab="companies" role="tab">🏢 Selskaper <span class="dir-tab-c">${companies.length}</span></button>
            <button class="dir-tab" data-tab="places" role="tab">📍 Steder <span class="dir-tab-c">${places.length}</span></button>
        </div>`;

        // ===== PEOPLE TAB =====
        body += `<section class="dir-pane" data-pane="people">`;
        body += `<div class="people-toolbar">
            <input id="peopleFilter" type="text" placeholder="🔍 Filter på navn, tittel, e-post..." oninput="applyPeopleFilter()" />
            <select id="peopleSort" onchange="applyPeopleFilter()">
                <option value="name-asc">Navn A–Å</option>
                <option value="name-desc">Navn Å–A</option>
                <option value="refs-desc">Flest referanser</option>
                <option value="refs-asc">Færrest referanser</option>
            </select>
            <button class="btn-ghost" onclick="expandAllPeople(true)" title="Utvid alle">⇣ Utvid</button>
            <button class="btn-ghost" onclick="expandAllPeople(false)" title="Skjul alle">⇡ Skjul</button>
            <label class="show-inactive"><input id="showInactive" type="checkbox" onchange="applyPeopleFilter()" /> Vis inaktive</label>
            <span id="peopleCount" class="people-count"></span>
            <button class="btn-primary" id="newPersonBtn">➕ Ny person</button>
        </div>`;

        if (people.length === 0) {
            body += '<p class="empty-quiet" style="margin-top:20px">Ingen personer registrert ennå. Klikk <strong>➕ Ny person</strong> for å legge til, eller bruk <code>@navn</code> i et notat.</p>';
        } else {
            body += '<div id="peopleList">';
            people.forEach(person => {
                const key = (person.key || (person.name || '').toLowerCase()).toLowerCase();
                const matches = (m) => m.has(key);

                const mentionedTasks = taskRefs.filter(x => matches(x.mentions)).map(x => x.t);
                const mentionedNotes = noteRefs.filter(x => matches(x.mentions));
                const mentionedMeetings = meetingRefs.filter(x => matches(x.mentions)).map(x => x.m);
                const mentionedResults = resultRefs.filter(x => matches(x.mentions)).map(x => x.r);

                const total = mentionedTasks.length + mentionedNotes.length + mentionedMeetings.length + mentionedResults.length;
                const personJson = JSON.stringify(person).replace(/'/g, '&#39;');
                const displayName = person.firstName
                    ? (person.lastName ? `${person.firstName} ${person.lastName}` : person.firstName)
                    : person.name;
                const primaryCo = person.primaryCompanyKey ? companiesByKey[person.primaryCompanyKey] : null;
                const extraCos = (person.extraCompanyKeys || []).map(k => companiesByKey[k]).filter(Boolean);
                const searchBlob = [displayName, person.name, person.key, person.title, person.email, person.phone, person.notes, primaryCo && primaryCo.name, ...extraCos.map(c => c.name)].filter(Boolean).join(' ').toLowerCase();
                const inactiveCls = person.inactive ? ' inactive' : '';

                body += `<div class="person-card${inactiveCls}" id="p-${escapeHtml(key)}" data-name="${escapeHtml(displayName.toLowerCase())}" data-refs="${total}" data-inactive="${person.inactive ? '1' : '0'}" data-search="${escapeHtml(searchBlob)}">`;
                body += `<div class="person-header" onclick="togglePerson(this)">`;
                body += `<span class="person-chev">▶</span>`;
                body += `<span class="person-icon">${person.inactive ? '👻' : '👤'}</span>`;
                body += `<div class="person-name-wrap">`;
                body += `<span class="person-name">${escapeHtml(displayName)}</span>`;
                body += `<span class="person-handle">@${escapeHtml(person.key || person.name)}</span>`;
                if (person.inactive) body += `<span class="person-badge">inaktiv</span>`;
                if (person.title) body += `<span class="person-title">· ${escapeHtml(person.title)}</span>`;
                if (primaryCo) body += `<span class="person-company-pill" title="Hovedselskap">🏢 ${escapeHtml(primaryCo.name)}</span>`;
                body += `</div>`;
                body += `<span class="person-refs">${total} ref.</span>`;
                body += `<button class="person-edit-btn" onclick='event.stopPropagation();openEditPerson(${personJson})' title="Rediger person">✏️</button>`;
                body += `</div>`;
                body += `<div class="person-details">`;
                if (person.email || person.phone) {
                    body += `<div class="person-contact">`;
                    if (person.email) body += `<span>📧 <a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></span>`;
                    if (person.phone) body += `<span>📞 ${escapeHtml(person.phone)}</span>`;
                    body += `</div>`;
                }
                if (primaryCo || extraCos.length > 0) {
                    body += `<div class="person-companies">`;
                    if (primaryCo) body += `<a class="company-chip primary" href="/people#tab=companies&key=${encodeURIComponent(primaryCo.key)}" title="Hovedselskap">🏢 ${escapeHtml(primaryCo.name)} <span class="chip-tag">hoved</span></a>`;
                    extraCos.forEach(c => {
                        body += `<a class="company-chip" href="/people#tab=companies&key=${encodeURIComponent(c.key)}">🏢 ${escapeHtml(c.name)}</a>`;
                    });
                    body += `</div>`;
                }
                if (person.notes) {
                    body += `<div class="person-notes">${escapeHtml(person.notes)}</div>`;
                }

                const sectionH = (label, count) => `<div class="person-section-h">${label} <span class="c">${count}</span></div>`;

                if (mentionedTasks.length > 0) {
                    body += `<div class="person-section">${sectionH('Oppgaver', mentionedTasks.length)}`;
                    mentionedTasks.forEach(t => {
                        const icon = t.done ? '✅' : '☐';
                        const cls = t.done ? 'task-done' : '';
                        body += `<div class="person-ref"><a class="${cls}" href="/tasks">${icon} ${linkMentions(escapeHtml(t.text))}</a></div>`;
                    });
                    body += `</div>`;
                }

                if (mentionedMeetings.length > 0) {
                    body += `<div class="person-section">${sectionH('Møter', mentionedMeetings.length)}`;
                    mentionedMeetings
                        .slice()
                        .sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')))
                        .forEach(m => {
                            const icon = meetingTypeIcon(m.type) || '📅';
                            const wk = dateToIsoWeek(new Date(m.date + 'T00:00:00Z'));
                            body += `<div class="person-ref"><a href="/calendar/${escapeHtml(wk)}#m-${encodeURIComponent(m.id)}">${icon} ${linkMentions(escapeHtml(m.title))} <span class="ref-when">${escapeHtml(m.date)}${m.start ? ' ' + escapeHtml(m.start) : ''}</span></a></div>`;
                        });
                    body += `</div>`;
                }

                if (mentionedResults.length > 0) {
                    body += `<div class="person-section">${sectionH('Resultater', mentionedResults.length)}`;
                    mentionedResults
                        .slice()
                        .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
                        .forEach(r => {
                            body += `<div class="person-ref"><a href="/results">⚖️ ${linkMentions(escapeHtml(r.text))} <span class="ref-when">${escapeHtml(r.week || '')}</span></a></div>`;
                        });
                    body += `</div>`;
                }

                if (mentionedNotes.length > 0) {
                    body += `<div class="person-section">${sectionH('Notater', mentionedNotes.length)}`;
                    mentionedNotes.forEach(({ week, file }) => {
                        const name = file.replace('.md', '');
                        body += `<div class="person-ref"><a href="/editor/${escapeHtml(week)}/${encodeURIComponent(file)}">📝 ${escapeHtml(name)} <span class="ref-when">${escapeHtml(week)}</span></a></div>`;
                    });
                    body += `</div>`;
                }

                if (total === 0) {
                    body += `<div class="person-empty">Ingen referanser funnet.</div>`;
                }
                body += `</div>`; // person-details

                body += `</div>`; // person-card
            });
            body += `</div>`;
        }
        body += `</section>`; // people pane

        // ===== COMPANIES TAB =====
        body += `<section class="dir-pane" data-pane="companies">`;
        body += `<div class="people-toolbar">
            <input id="companyFilter" type="text" placeholder="🔍 Filter på navn, adresse, notat..." oninput="applyCompanyFilter()" />
            <button class="btn-ghost" onclick="expandAllCompanies(true)">⇣ Utvid</button>
            <button class="btn-ghost" onclick="expandAllCompanies(false)">⇡ Skjul</button>
            <span id="companyCount" class="people-count"></span>
            <button class="btn-primary" id="newCompanyBtn">➕ Nytt selskap</button>
        </div>`;
        if (companies.length === 0) {
            body += '<p class="empty-quiet" style="margin-top:20px">Ingen selskaper registrert ennå. Klikk <strong>➕ Nytt selskap</strong> for å opprette ett.</p>';
        } else {
            body += '<div id="companyList">';
            companies.forEach(company => {
                const ckey = company.key;
                const matchesK = (m) => m.has(ckey);
                const cTasks = taskRefs.filter(x => matchesK(x.mentions)).map(x => x.t);
                const cNotes = noteRefs.filter(x => matchesK(x.mentions));
                const cMeetings = meetingRefs.filter(x => matchesK(x.mentions)).map(x => x.m);
                const cResults = resultRefs.filter(x => matchesK(x.mentions)).map(x => x.r);
                const members = companyMembers.get(ckey) || [];
                const total = cTasks.length + cNotes.length + cMeetings.length + cResults.length + members.length;
                const companyJson = JSON.stringify(company).replace(/'/g, '&#39;');
                const searchBlob = [company.name, company.key, company.address, company.url, company.orgnr, company.notes].filter(Boolean).join(' ').toLowerCase();

                body += `<div class="person-card" id="c-${escapeHtml(ckey)}" data-name="${escapeHtml((company.name || '').toLowerCase())}" data-refs="${total}" data-search="${escapeHtml(searchBlob)}">`;
                body += `<div class="person-header" onclick="togglePerson(this)">`;
                body += `<span class="person-chev">▶</span>`;
                body += `<span class="person-icon">🏢</span>`;
                body += `<div class="person-name-wrap">`;
                body += `<span class="person-name">${escapeHtml(company.name)}</span>`;
                body += `<span class="person-handle">@${escapeHtml(company.key)}</span>`;
                if (company.url) body += `<span class="person-title">· ${escapeHtml(company.url)}</span>`;
                body += `</div>`;
                body += `<span class="person-refs">${members.length} ⛹ · ${total - members.length} ref.</span>`;
                body += `<button class="person-edit-btn" onclick='event.stopPropagation();openEditCompany(${companyJson})' title="Rediger">✏️</button>`;
                body += `</div>`;
                body += `<div class="person-details">`;
                if (company.address || company.orgnr || company.url) {
                    body += `<div class="person-contact">`;
                    if (company.address) body += `<span>📍 ${escapeHtml(company.address)}</span>`;
                    if (company.url) body += `<span>🔗 <a href="${escapeHtml(company.url)}" target="_blank" rel="noopener">${escapeHtml(company.url)}</a></span>`;
                    if (company.orgnr) body += `<span>Org.nr: ${escapeHtml(company.orgnr)}</span>`;
                    body += `</div>`;
                }
                if (company.notes) body += `<div class="person-notes">${escapeHtml(company.notes)}</div>`;

                const sectionH = (label, count) => `<div class="person-section-h">${label} <span class="c">${count}</span></div>`;
                if (members.length > 0) {
                    body += `<div class="person-section">${sectionH('Personer', members.length)}`;
                    members.sort((a, b) => (b.primary - a.primary) || a.person.name.localeCompare(b.person.name, 'nb')).forEach(({ person, primary }) => {
                        const dn = person.firstName ? (person.lastName ? `${person.firstName} ${person.lastName}` : person.firstName) : person.name;
                        body += `<div class="person-ref"><a href="/people#p-${encodeURIComponent(person.key)}">👤 ${escapeHtml(dn)}${primary ? ' <span class="chip-tag">hoved</span>' : ''}</a></div>`;
                    });
                    body += `</div>`;
                }
                if (cMeetings.length > 0) {
                    body += `<div class="person-section">${sectionH('Møter', cMeetings.length)}`;
                    cMeetings.slice().sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || ''))).forEach(m => {
                        const wk = dateToIsoWeek(new Date(m.date + 'T00:00:00Z'));
                        body += `<div class="person-ref"><a href="/calendar/${escapeHtml(wk)}#m-${encodeURIComponent(m.id)}">${meetingTypeIcon(m.type) || '📅'} ${linkMentions(escapeHtml(m.title))} <span class="ref-when">${escapeHtml(m.date)}</span></a></div>`;
                    });
                    body += `</div>`;
                }
                if (cResults.length > 0) {
                    body += `<div class="person-section">${sectionH('Resultater', cResults.length)}`;
                    cResults.slice().sort((a, b) => (b.created || '').localeCompare(a.created || '')).forEach(r => {
                        body += `<div class="person-ref"><a href="/results">⚖️ ${linkMentions(escapeHtml(r.text))} <span class="ref-when">${escapeHtml(r.week || '')}</span></a></div>`;
                    });
                    body += `</div>`;
                }
                if (cTasks.length > 0) {
                    body += `<div class="person-section">${sectionH('Oppgaver', cTasks.length)}`;
                    cTasks.forEach(t => {
                        body += `<div class="person-ref"><a class="${t.done ? 'task-done' : ''}" href="/tasks">${t.done ? '✅' : '☐'} ${linkMentions(escapeHtml(t.text))}</a></div>`;
                    });
                    body += `</div>`;
                }
                if (cNotes.length > 0) {
                    body += `<div class="person-section">${sectionH('Notater', cNotes.length)}`;
                    cNotes.forEach(({ week, file }) => {
                        const name = file.replace('.md', '');
                        body += `<div class="person-ref"><a href="/editor/${escapeHtml(week)}/${encodeURIComponent(file)}">📝 ${escapeHtml(name)} <span class="ref-when">${escapeHtml(week)}</span></a></div>`;
                    });
                    body += `</div>`;
                }
                if (total === 0) body += `<div class="person-empty">Ingen referanser funnet.</div>`;
                body += `</div>`; // details
                body += `</div>`; // card
            });
            body += `</div>`;
        }
        body += `</section>`;

        // ===== PLACES TAB =====
        body += `<section class="dir-pane" data-pane="places">`;
        body += `<div class="people-toolbar">
            <input id="placeFilter" type="text" placeholder="🔍 Filter på navn, adresse..." oninput="applyPlaceFilter()" />
            <button class="btn-ghost" onclick="expandAllPlaces(true)">⇣ Utvid</button>
            <button class="btn-ghost" onclick="expandAllPlaces(false)">⇡ Skjul</button>
            <span id="placeCount" class="people-count"></span>
            <button class="btn-primary" id="newPlaceBtn">➕ Nytt sted</button>
        </div>`;
        if (places.length === 0) {
            body += '<p class="empty-quiet" style="margin-top:20px">Ingen steder registrert ennå. Klikk <strong>➕ Nytt sted</strong> for å opprette ett.</p>';
        } else {
            body += '<div id="placeList">';
            places.forEach(place => {
                const ms = placeMeetings.get(place.key) || [];
                const placeJson = JSON.stringify(place).replace(/'/g, '&#39;');
                const searchBlob = [place.name, place.key, place.address, place.notes].filter(Boolean).join(' ').toLowerCase();
                const hasCoords = Number.isFinite(place.lat) && Number.isFinite(place.lng);
                body += `<div class="person-card" id="pl-${escapeHtml(place.key)}" data-name="${escapeHtml((place.name || '').toLowerCase())}" data-refs="${ms.length}" data-search="${escapeHtml(searchBlob)}">`;
                body += `<div class="person-header" onclick="togglePerson(this)">`;
                body += `<span class="person-chev">▶</span>`;
                body += `<span class="person-icon">📍</span>`;
                body += `<div class="person-name-wrap">`;
                body += `<span class="person-name">${escapeHtml(place.name)}</span>`;
                if (place.address) body += `<span class="person-title">· ${escapeHtml(place.address)}</span>`;
                if (hasCoords) body += `<span class="person-handle">${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}</span>`;
                body += `</div>`;
                body += `<span class="person-refs">${ms.length} møter</span>`;
                body += `<button class="person-edit-btn" onclick='event.stopPropagation();openEditPlace(${placeJson})' title="Rediger">✏️</button>`;
                body += `</div>`;
                body += `<div class="person-details">`;
                if (hasCoords) {
                    const osm = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=16/${place.lat}/${place.lng}`;
                    body += `<div class="person-contact"><span>📍 <a href="${escapeHtml(osm)}" target="_blank" rel="noopener">Vis på kart (OSM)</a></span></div>`;
                    body += `<div class="place-mini-map" data-lat="${place.lat}" data-lng="${place.lng}" data-name="${escapeHtml(place.name)}"></div>`;
                }
                if (place.notes) body += `<div class="person-notes">${escapeHtml(place.notes)}</div>`;
                if (ms.length > 0) {
                    body += `<div class="person-section"><div class="person-section-h">Møter <span class="c">${ms.length}</span></div>`;
                    ms.slice().sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || ''))).forEach(m => {
                        const wk = dateToIsoWeek(new Date(m.date + 'T00:00:00Z'));
                        body += `<div class="person-ref"><a href="/calendar/${escapeHtml(wk)}#m-${encodeURIComponent(m.id)}">${meetingTypeIcon(m.type) || '📅'} ${linkMentions(escapeHtml(m.title))} <span class="ref-when">${escapeHtml(m.date)}</span></a></div>`;
                    });
                    body += `</div>`;
                } else {
                    body += `<div class="person-empty">Ingen møter knyttet til dette stedet ennå.</div>`;
                }
                body += `</div></div>`;
            });
            body += `</div>`;
        }
        body += `</section>`;

        body += `</div>`; // .people-page

        body += `
<style>
.people-page { max-width: 1100px; }
.people-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.people-head h1 { margin: 0; }
.dir-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-soft); margin-bottom: 16px; }
.dir-tab { background: transparent; border: 1px solid transparent; border-bottom: none; padding: 8px 14px; cursor: pointer; font-size: 0.95em; color: var(--text-muted); border-radius: 8px 8px 0 0; font-family: inherit; }
.dir-tab:hover { color: var(--text); background: var(--surface); }
.dir-tab.active { background: var(--surface); color: var(--accent); border-color: var(--border-soft); border-bottom: 1px solid var(--surface); margin-bottom: -1px; font-weight: 600; }
.dir-tab-c { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; background: var(--surface-alt); color: var(--text-muted); border-radius: 9px; font-size: 0.8em; }
.dir-pane { display: none; }
.dir-pane.active { display: block; }

.people-toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.people-toolbar input[type=text] { flex: 1; min-width: 220px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95em; outline: none; background: var(--surface); color: var(--text); font-family: inherit; }
.people-toolbar input[type=text]:focus { border-color: var(--accent); }
.people-toolbar select { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95em; outline: none; background: var(--surface); color: var(--text); cursor: pointer; font-family: inherit; }
.people-toolbar .btn-ghost { padding: 8px 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; cursor: pointer; color: var(--text-muted); font-size: 0.9em; font-family: inherit; }
.people-toolbar .btn-ghost:hover { background: var(--surface-head); border-color: var(--accent); }
.people-toolbar .show-inactive { display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer; padding: 8px 6px; }
.people-count { font-size: 0.85em; color: var(--text-subtle); margin-left: auto; }

.person-card { margin-bottom: 8px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border-soft); overflow: hidden; }
.person-card.inactive { opacity: 0.55; }
.person-header { padding: 8px 14px; background: var(--surface-head); display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.person-chev { font-size: 0.7em; color: var(--text-subtle); transition: transform 0.15s; display: inline-block; width: 10px; }
.person-icon { font-size: 1.1em; }
.person-name-wrap { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.person-name { font-weight: 600; color: var(--accent); }
.person-card.inactive .person-name { text-decoration: line-through; }
.person-handle { font-size: 0.8em; color: var(--text-subtle); }
.person-badge { font-size: 0.75em; background: var(--surface-alt); color: var(--text-muted); padding: 1px 8px; border-radius: 10px; font-weight: 500; }
.person-title { font-size: 0.82em; color: var(--text-muted); }
.person-company-pill { font-size: 0.78em; background: var(--surface-alt); color: var(--text-muted); padding: 1px 8px; border-radius: 10px; }
.person-refs { font-size: 0.8em; color: var(--text-subtle); white-space: nowrap; }
.person-edit-btn { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 6px; border-radius: 4px; color: var(--text-muted); }
.person-edit-btn:hover { background: var(--border-soft); }
.person-details { display: none; }
.person-contact { padding: 8px 18px; background: var(--surface-alt); border-top: 1px solid var(--border-soft); display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.85em; color: var(--text-muted); }
.person-contact a { color: var(--accent); text-decoration: none; }
.person-contact a:hover { text-decoration: underline; }
.person-companies { padding: 8px 18px; border-top: 1px solid var(--border-soft); display: flex; gap: 6px; flex-wrap: wrap; }
.company-chip { font-size: 0.85em; padding: 3px 10px; background: var(--surface-alt); color: var(--text-muted); border-radius: 12px; text-decoration: none; border: 1px solid transparent; }
.company-chip:hover { border-color: var(--accent); color: var(--accent); }
.company-chip.primary { background: var(--accent-soft, var(--surface-head)); color: var(--accent); font-weight: 600; }
.chip-tag { font-size: 0.7em; opacity: 0.7; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.person-notes { padding: 8px 18px; background: var(--surface-head); border-top: 1px solid var(--border-soft); font-size: 0.85em; color: var(--text-muted); font-style: italic; white-space: pre-wrap; }
.person-section { padding: 10px 18px; border-top: 1px solid var(--border-faint); }
.person-section-h { font-size: 0.75em; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.person-section-h .c { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; background: var(--surface-alt); color: var(--text-muted); border-radius: 9px; font-size: 0.95em; text-align: center; }
.person-ref { padding: 3px 0; font-size: 0.88em; }
.person-ref a { color: var(--text); text-decoration: none; }
.person-ref a:hover { text-decoration: underline; color: var(--accent); }
.person-ref a.task-done { text-decoration: line-through; color: var(--text-subtle); }
.person-ref .ref-when { font-size: 0.85em; color: var(--text-subtle); margin-left: 6px; }
.person-empty { padding: 10px 18px; border-top: 1px solid var(--border-faint); font-size: 0.88em; color: var(--text-subtle); font-style: italic; }

.place-mini-map { height: 180px; border-top: 1px solid var(--border-soft); }
.leaflet-container { font-family: inherit; }
#placeMapPicker { height: 320px; border-radius: 6px; border: 1px solid var(--border); margin-top: 4px; }

#newPersonModal .np-form, #newCompanyModal .np-form, #newPlaceModal .np-form { display: flex; flex-direction: column; gap: 12px; }
#newPersonModal label, #newCompanyModal label, #newPlaceModal label { font-size: 0.85em; font-weight: 600; color: var(--text-muted); }
#newPersonModal input, #newPersonModal textarea, #newPersonModal select,
#newCompanyModal input, #newCompanyModal textarea, #newCompanyModal select,
#newPlaceModal input, #newPlaceModal textarea, #newPlaceModal select { display: block; width: 100%; margin-top: 4px; }
#newPersonModal .np-grid, #newPlaceModal .np-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cmpck-list { border: 1px solid var(--border); border-radius: 6px; padding: 6px; max-height: 120px; overflow-y: auto; background: var(--surface); margin-top: 4px; }
.cmpck-list label { display: flex !important; align-items: center; gap: 6px; font-weight: normal !important; padding: 3px 4px; font-size: 0.9em !important; cursor: pointer; }
.cmpck-list label:hover { background: var(--surface-head); border-radius: 4px; }
.cmpck-list input[type=checkbox] { width: auto; margin: 0; }
</style>`;

        body += `
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<div id="editPersonModal" class="page-modal" onclick="if(event.target===this)closeEditPerson()">
  <div class="page-modal-card" style="max-width:520px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h3 style="margin:0">✏️ Rediger person</h3>
      <button onclick="closeEditPerson()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
    </div>
    <input type="hidden" id="editPersonId" />
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Fornavn *
          <input id="editPersonFirstName" type="text" placeholder="Ole" style="display:block;margin-top:4px" />
        </label>
        <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Etternavn
          <input id="editPersonLastName" type="text" placeholder="Hansen" style="display:block;margin-top:4px" />
        </label>
      </div>
      <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Tittel
        <input id="editPersonTitle" type="text" style="display:block;margin-top:4px" />
      </label>
      <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Hovedselskap
        <select id="editPersonPrimaryCompany" style="display:block;margin-top:4px"></select>
      </label>
      <div style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Andre selskaper
        <div id="editPersonExtraCompanies" class="cmpck-list"></div>
      </div>
      <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">E-post
        <input id="editPersonEmail" type="email" style="display:block;margin-top:4px" />
      </label>
      <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Telefon
        <input id="editPersonPhone" type="tel" style="display:block;margin-top:4px" />
      </label>
      <label style="font-size:0.85em;font-weight:600;color:var(--text-muted)">Notat
        <textarea id="editPersonNotes" rows="3" style="display:block;margin-top:4px"></textarea>
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9em;color:var(--text-muted);cursor:pointer;padding:6px 0">
        <input id="editPersonInactive" type="checkbox" style="width:16px;height:16px;cursor:pointer" />
        <span>Inaktiv (skjules fra @-autofullføring)</span>
      </label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px;display:flex;align-items:center;gap:10px">
      <button class="page-modal-btn" onclick="deleteEditPerson()" style="background:#fff5f5;color:#c53030;border:1px solid #fed7d7;margin-right:auto">🗑️ Slett</button>
      <button class="page-modal-btn cancel" onclick="closeEditPerson()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveEditPerson()">💾 Lagre</button>
    </div>
  </div>
</div>

<div id="newPersonModal" class="page-modal" onclick="if(event.target===this)closeNewPerson()">
  <div class="page-modal-card" style="max-width:520px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h3 style="margin:0">➕ Ny person</h3>
      <button onclick="closeNewPerson()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
    </div>
    <div class="np-form">
      <div class="np-grid">
        <label>Fornavn *<input id="newPersonFirstName" type="text" placeholder="Ole" /></label>
        <label>Etternavn<input id="newPersonLastName" type="text" placeholder="Hansen" /></label>
      </div>
      <label>Tittel<input id="newPersonTitle" type="text" /></label>
      <label>Hovedselskap<select id="newPersonPrimaryCompany"></select></label>
      <label>E-post<input id="newPersonEmail" type="email" /></label>
      <label>Telefon<input id="newPersonPhone" type="tel" /></label>
      <label>Notat<textarea id="newPersonNotes" rows="3"></textarea></label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px">
      <button class="page-modal-btn cancel" onclick="closeNewPerson()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveNewPerson()">💾 Lagre</button>
    </div>
  </div>
</div>

<div id="companyModal" class="page-modal" onclick="if(event.target===this)closeCompany()">
  <div class="page-modal-card" style="max-width:520px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h3 id="companyModalTitle" style="margin:0">🏢 Selskap</h3>
      <button onclick="closeCompany()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
    </div>
    <input type="hidden" id="companyId" />
    <div class="np-form" id="newCompanyModal">
      <label>Navn *<input id="companyName" type="text" placeholder="Acme AS" /></label>
      <label>Org.nr<input id="companyOrgnr" type="text" /></label>
      <label>Web<input id="companyUrl" type="text" placeholder="https://" /></label>
      <label>Adresse<input id="companyAddress" type="text" /></label>
      <label>Notat<textarea id="companyNotes" rows="3"></textarea></label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px;display:flex;align-items:center;gap:10px">
      <button id="companyDeleteBtn" class="page-modal-btn" onclick="deleteCompany()" style="background:#fff5f5;color:#c53030;border:1px solid #fed7d7;margin-right:auto;display:none">🗑️ Slett</button>
      <button class="page-modal-btn cancel" onclick="closeCompany()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="saveCompany()">💾 Lagre</button>
    </div>
  </div>
</div>

<div id="placeModal" class="page-modal" onclick="if(event.target===this)closePlace()">
  <div class="page-modal-card" style="max-width:640px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h3 id="placeModalTitle" style="margin:0">📍 Sted</h3>
      <button onclick="closePlace()" style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-subtle)">✕</button>
    </div>
    <input type="hidden" id="placeId" />
    <div class="np-form" id="newPlaceModal">
      <label>Navn *<input id="placeName" type="text" placeholder="Hovedkontor" /></label>
      <label>Adresse<input id="placeAddress" type="text" /></label>
      <div class="np-grid">
        <label>Breddegrad (lat)<input id="placeLat" type="text" placeholder="59.9139" /></label>
        <label>Lengdegrad (lng)<input id="placeLng" type="text" placeholder="10.7522" /></label>
      </div>
      <div style="font-size:0.8em;color:var(--text-subtle);margin-top:-6px">Klikk på kartet for å plassere markøren. Dra for å justere.</div>
      <div id="placeMapPicker"></div>
      <label>Notat<textarea id="placeNotes" rows="2"></textarea></label>
    </div>
    <div class="page-modal-actions" style="margin-top:20px;display:flex;align-items:center;gap:10px">
      <button id="placeDeleteBtn" class="page-modal-btn" onclick="deletePlace()" style="background:#fff5f5;color:#c53030;border:1px solid #fed7d7;margin-right:auto;display:none">🗑️ Slett</button>
      <button class="page-modal-btn cancel" onclick="closePlace()">Avbryt</button>
      <button class="page-modal-btn blue" style="padding:8px 20px" onclick="savePlace()">💾 Lagre</button>
    </div>
  </div>
</div>

<script>
// Server-injected data
const ALL_COMPANIES = ${JSON.stringify(companies.map(c => ({ key: c.key, name: c.name }))).replace(/</g, '\\u003c')};

// ===== Tabs =====
function parseHashParams() {
    const h = (location.hash || '').replace(/^#/, '');
    const params = {};
    h.split('&').forEach(seg => {
        const i = seg.indexOf('=');
        if (i > 0) params[seg.slice(0, i)] = decodeURIComponent(seg.slice(i + 1));
        else if (seg) params[seg] = true;
    });
    return params;
}
function activateTab(name) {
    if (!['people','companies','places'].includes(name)) name = 'people';
    document.querySelectorAll('.dir-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.dir-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
    // Init mini-maps when places tab becomes visible
    if (name === 'places') initMiniMaps();
}
document.querySelectorAll('.dir-tab').forEach(t => {
    t.addEventListener('click', () => {
        const params = parseHashParams();
        params.tab = t.dataset.tab;
        delete params.key;
        const newHash = Object.entries(params).map(([k, v]) => v === true ? k : k + '=' + encodeURIComponent(v)).join('&');
        history.replaceState(null, '', '#' + newHash);
        activateTab(t.dataset.tab);
    });
});

// ===== Filtering / sort =====
function applyPeopleFilter() {
    const filterEl = document.getElementById('peopleFilter');
    const sortEl = document.getElementById('peopleSort');
    const list = document.getElementById('peopleList');
    if (!list) return;
    const q = (filterEl ? filterEl.value : '').trim().toLowerCase();
    const sort = sortEl ? sortEl.value : 'name-asc';
    const showInactive = document.getElementById('showInactive').checked;
    const cards = Array.from(list.querySelectorAll('.person-card'));
    let visible = 0;
    cards.forEach(c => {
        const inactive = c.dataset.inactive === '1';
        const match = (!q || (c.dataset.search || '').includes(q)) && (showInactive || !inactive);
        c.style.display = match ? '' : 'none';
        if (match) visible++;
    });
    cards.sort((a, b) => {
        const ai = a.dataset.inactive === '1' ? 1 : 0;
        const bi = b.dataset.inactive === '1' ? 1 : 0;
        if (ai !== bi) return ai - bi;
        if (sort === 'name-asc') return a.dataset.name.localeCompare(b.dataset.name, 'nb');
        if (sort === 'name-desc') return b.dataset.name.localeCompare(a.dataset.name, 'nb');
        const ra = parseInt(a.dataset.refs || '0', 10), rb = parseInt(b.dataset.refs || '0', 10);
        if (sort === 'refs-desc') return rb - ra || a.dataset.name.localeCompare(b.dataset.name, 'nb');
        if (sort === 'refs-asc') return ra - rb || a.dataset.name.localeCompare(b.dataset.name, 'nb');
        return 0;
    });
    cards.forEach(c => list.appendChild(c));
    document.getElementById('peopleCount').textContent = visible + ' av ' + cards.length;
}
function applyCompanyFilter() {
    const list = document.getElementById('companyList'); if (!list) return;
    const q = (document.getElementById('companyFilter').value || '').trim().toLowerCase();
    const cards = Array.from(list.querySelectorAll('.person-card'));
    let visible = 0;
    cards.forEach(c => { const m = !q || (c.dataset.search || '').includes(q); c.style.display = m ? '' : 'none'; if (m) visible++; });
    document.getElementById('companyCount').textContent = visible + ' av ' + cards.length;
}
function applyPlaceFilter() {
    const list = document.getElementById('placeList'); if (!list) return;
    const q = (document.getElementById('placeFilter').value || '').trim().toLowerCase();
    const cards = Array.from(list.querySelectorAll('.person-card'));
    let visible = 0;
    cards.forEach(c => { const m = !q || (c.dataset.search || '').includes(q); c.style.display = m ? '' : 'none'; if (m) visible++; });
    document.getElementById('placeCount').textContent = visible + ' av ' + cards.length;
}

function togglePerson(header) {
    const card = header.closest('.person-card');
    const details = card.querySelector('.person-details');
    const chev = header.querySelector('.person-chev');
    const open = details.style.display !== 'none' && details.style.display !== '';
    details.style.display = open ? 'none' : 'block';
    if (chev) chev.style.transform = open ? '' : 'rotate(90deg)';
    // initialize mini map if just opened
    if (!open) {
        const m = details.querySelector('.place-mini-map');
        if (m && !m.dataset.inited) initMiniMap(m);
    }
}
function expandAllPeople(expand) {
    document.querySelectorAll('#peopleList .person-card').forEach(card => {
        card.querySelector('.person-details').style.display = expand ? 'block' : 'none';
        const chev = card.querySelector('.person-chev'); if (chev) chev.style.transform = expand ? 'rotate(90deg)' : '';
    });
}
function expandAllCompanies(expand) {
    document.querySelectorAll('#companyList .person-card').forEach(card => {
        card.querySelector('.person-details').style.display = expand ? 'block' : 'none';
        const chev = card.querySelector('.person-chev'); if (chev) chev.style.transform = expand ? 'rotate(90deg)' : '';
    });
}
function expandAllPlaces(expand) {
    document.querySelectorAll('#placeList .person-card').forEach(card => {
        card.querySelector('.person-details').style.display = expand ? 'block' : 'none';
        const chev = card.querySelector('.person-chev'); if (chev) chev.style.transform = expand ? 'rotate(90deg)' : '';
        if (expand) {
            const m = card.querySelector('.place-mini-map');
            if (m && !m.dataset.inited) initMiniMap(m);
        }
    });
}

// ===== Person modal =====
function fillCompanySelect(selectId, currentKey) {
    const sel = document.getElementById(selectId);
    sel.innerHTML = '<option value="">— ingen —</option>' + ALL_COMPANIES.map(c => '<option value="' + c.key + '"' + (c.key === currentKey ? ' selected' : '') + '>' + c.name + '</option>').join('');
}
function fillExtraCompanyChecks(containerId, primaryKey, extraKeys) {
    const c = document.getElementById(containerId);
    const extras = new Set(extraKeys || []);
    if (ALL_COMPANIES.length === 0) {
        c.innerHTML = '<div style="color:var(--text-subtle);padding:6px;font-style:italic">Ingen selskaper opprettet ennå.</div>';
        return;
    }
    c.innerHTML = ALL_COMPANIES.filter(co => co.key !== primaryKey).map(co =>
        '<label><input type="checkbox" value="' + co.key + '"' + (extras.has(co.key) ? ' checked' : '') + ' /> ' + co.name + '</label>'
    ).join('');
}
function getCheckedExtras(containerId) {
    return Array.from(document.querySelectorAll('#' + containerId + ' input[type=checkbox]:checked')).map(b => b.value);
}
function openEditPerson(p) {
    document.getElementById('editPersonId').value = p.id;
    const firstName = p.firstName || (p.name && !p.lastName ? p.name.split(' ')[0] : p.name) || '';
    const lastName = p.lastName || (p.name && p.name.includes(' ') && !p.firstName ? p.name.split(' ').slice(1).join(' ') : '') || '';
    document.getElementById('editPersonFirstName').value = firstName;
    document.getElementById('editPersonLastName').value = lastName;
    document.getElementById('editPersonTitle').value = p.title || '';
    document.getElementById('editPersonEmail').value = p.email || '';
    document.getElementById('editPersonPhone').value = p.phone || '';
    document.getElementById('editPersonNotes').value = p.notes || '';
    document.getElementById('editPersonInactive').checked = !!p.inactive;
    fillCompanySelect('editPersonPrimaryCompany', p.primaryCompanyKey || '');
    fillExtraCompanyChecks('editPersonExtraCompanies', p.primaryCompanyKey || '', p.extraCompanyKeys || []);
    // When primary changes, refresh the extras list (excluding new primary)
    document.getElementById('editPersonPrimaryCompany').onchange = function() {
        const cur = getCheckedExtras('editPersonExtraCompanies');
        fillExtraCompanyChecks('editPersonExtraCompanies', this.value, cur);
    };
    document.getElementById('editPersonModal').style.display = 'flex';
    setTimeout(() => document.getElementById('editPersonFirstName').focus(), 50);
}
function closeEditPerson() { document.getElementById('editPersonModal').style.display = 'none'; }
function saveEditPerson() {
    const id = document.getElementById('editPersonId').value;
    const firstName = document.getElementById('editPersonFirstName').value.trim();
    if (!firstName) { alert('Fornavn er påkrevd'); return; }
    const data = {
        firstName,
        lastName: document.getElementById('editPersonLastName').value.trim(),
        title: document.getElementById('editPersonTitle').value.trim(),
        email: document.getElementById('editPersonEmail').value.trim(),
        phone: document.getElementById('editPersonPhone').value.trim(),
        notes: document.getElementById('editPersonNotes').value.trim(),
        inactive: document.getElementById('editPersonInactive').checked,
        primaryCompanyKey: document.getElementById('editPersonPrimaryCompany').value || '',
        extraCompanyKeys: getCheckedExtras('editPersonExtraCompanies')
    };
    fetch('/api/people/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil ved lagring'); });
}
function deleteEditPerson() {
    const id = document.getElementById('editPersonId').value;
    const name = (document.getElementById('editPersonFirstName').value + ' ' + document.getElementById('editPersonLastName').value).trim() || 'denne personen';
    if (!confirm('Slette ' + name + '?')) return;
    fetch('/api/people/' + id, { method: 'DELETE' }).then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil'); });
}
function openNewPerson() {
    ['newPersonFirstName','newPersonLastName','newPersonTitle','newPersonEmail','newPersonPhone','newPersonNotes'].forEach(id => { document.getElementById(id).value = ''; });
    fillCompanySelect('newPersonPrimaryCompany', '');
    document.getElementById('newPersonModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newPersonFirstName').focus(), 50);
}
function closeNewPerson() { document.getElementById('newPersonModal').style.display = 'none'; }
function saveNewPerson() {
    const firstName = document.getElementById('newPersonFirstName').value.trim();
    if (!firstName) { alert('Fornavn er påkrevd'); return; }
    const data = {
        firstName,
        lastName: document.getElementById('newPersonLastName').value.trim(),
        title: document.getElementById('newPersonTitle').value.trim(),
        email: document.getElementById('newPersonEmail').value.trim(),
        phone: document.getElementById('newPersonPhone').value.trim(),
        notes: document.getElementById('newPersonNotes').value.trim(),
        primaryCompanyKey: document.getElementById('newPersonPrimaryCompany').value || ''
    };
    fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil: ' + (r.error || 'ukjent')); });
}
document.getElementById('newPersonBtn').addEventListener('click', openNewPerson);

// ===== Company modal =====
function openCompany(c) {
    document.getElementById('companyId').value = c ? c.id : '';
    document.getElementById('companyModalTitle').textContent = c ? '✏️ Rediger selskap' : '➕ Nytt selskap';
    document.getElementById('companyName').value = c ? c.name : '';
    document.getElementById('companyOrgnr').value = c ? (c.orgnr || '') : '';
    document.getElementById('companyUrl').value = c ? (c.url || '') : '';
    document.getElementById('companyAddress').value = c ? (c.address || '') : '';
    document.getElementById('companyNotes').value = c ? (c.notes || '') : '';
    document.getElementById('companyDeleteBtn').style.display = c ? '' : 'none';
    document.getElementById('companyModal').style.display = 'flex';
    setTimeout(() => document.getElementById('companyName').focus(), 50);
}
function openEditCompany(c) { openCompany(c); }
function closeCompany() { document.getElementById('companyModal').style.display = 'none'; }
function saveCompany() {
    const id = document.getElementById('companyId').value;
    const name = document.getElementById('companyName').value.trim();
    if (!name) { alert('Navn er påkrevd'); return; }
    const data = {
        name,
        orgnr: document.getElementById('companyOrgnr').value.trim(),
        url: document.getElementById('companyUrl').value.trim(),
        address: document.getElementById('companyAddress').value.trim(),
        notes: document.getElementById('companyNotes').value.trim()
    };
    const url = id ? ('/api/companies/' + id) : '/api/companies';
    const method = id ? 'PUT' : 'POST';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil: ' + (r.error || 'ukjent')); });
}
function deleteCompany() {
    const id = document.getElementById('companyId').value; if (!id) return;
    if (!confirm('Slette dette selskapet? Personer med selskapet beholder referansen til nøkkelen.')) return;
    fetch('/api/companies/' + id, { method: 'DELETE' }).then(r => r.json()).then(r => { if (r.ok) location.reload(); });
}
document.getElementById('newCompanyBtn').addEventListener('click', () => openCompany(null));

// ===== Place modal + Leaflet =====
let placeMap = null, placeMarker = null;
function ensurePlaceMap() {
    const el = document.getElementById('placeMapPicker');
    if (placeMap) { setTimeout(() => placeMap.invalidateSize(), 50); return; }
    placeMap = L.map(el).setView([59.9139, 10.7522], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(placeMap);
    placeMap.on('click', e => setPlaceMarker(e.latlng.lat, e.latlng.lng));
    setTimeout(() => placeMap.invalidateSize(), 50);
}
function setPlaceMarker(lat, lng) {
    document.getElementById('placeLat').value = lat.toFixed(6);
    document.getElementById('placeLng').value = lng.toFixed(6);
    if (!placeMarker) {
        placeMarker = L.marker([lat, lng], { draggable: true }).addTo(placeMap);
        placeMarker.on('dragend', e => {
            const ll = e.target.getLatLng();
            document.getElementById('placeLat').value = ll.lat.toFixed(6);
            document.getElementById('placeLng').value = ll.lng.toFixed(6);
        });
    } else {
        placeMarker.setLatLng([lat, lng]);
    }
}
function openPlace(p) {
    document.getElementById('placeId').value = p ? p.id : '';
    document.getElementById('placeModalTitle').textContent = p ? '✏️ Rediger sted' : '➕ Nytt sted';
    document.getElementById('placeName').value = p ? p.name : '';
    document.getElementById('placeAddress').value = p ? (p.address || '') : '';
    document.getElementById('placeLat').value = p && p.lat != null ? p.lat : '';
    document.getElementById('placeLng').value = p && p.lng != null ? p.lng : '';
    document.getElementById('placeNotes').value = p ? (p.notes || '') : '';
    document.getElementById('placeDeleteBtn').style.display = p ? '' : 'none';
    document.getElementById('placeModal').style.display = 'flex';
    if (placeMarker) { placeMap.removeLayer(placeMarker); placeMarker = null; }
    setTimeout(() => {
        ensurePlaceMap();
        if (p && p.lat != null && p.lng != null) {
            placeMap.setView([p.lat, p.lng], 15);
            setPlaceMarker(p.lat, p.lng);
        } else {
            placeMap.setView([59.9139, 10.7522], 12);
        }
        document.getElementById('placeName').focus();
    }, 80);
}
function openEditPlace(p) { openPlace(p); }
function closePlace() { document.getElementById('placeModal').style.display = 'none'; }
function savePlace() {
    const id = document.getElementById('placeId').value;
    const name = document.getElementById('placeName').value.trim();
    if (!name) { alert('Navn er påkrevd'); return; }
    const lat = document.getElementById('placeLat').value.trim();
    const lng = document.getElementById('placeLng').value.trim();
    const data = {
        name,
        address: document.getElementById('placeAddress').value.trim(),
        lat: lat === '' ? null : parseFloat(lat),
        lng: lng === '' ? null : parseFloat(lng),
        notes: document.getElementById('placeNotes').value.trim()
    };
    const url = id ? ('/api/places/' + id) : '/api/places';
    const method = id ? 'PUT' : 'POST';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json()).then(r => { if (r.ok) location.reload(); else alert('Feil: ' + (r.error || 'ukjent')); });
}
function deletePlace() {
    const id = document.getElementById('placeId').value; if (!id) return;
    if (!confirm('Slette dette stedet? Møter beholder referansen til stedsnøkkelen.')) return;
    fetch('/api/places/' + id, { method: 'DELETE' }).then(r => r.json()).then(r => { if (r.ok) location.reload(); });
}
document.getElementById('newPlaceBtn').addEventListener('click', () => openPlace(null));

// Mini maps in places list
function initMiniMap(el) {
    if (!window.L || el.dataset.inited) return;
    const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    el.dataset.inited = '1';
    const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
    L.marker([lat, lng], { title: el.dataset.name || '' }).addTo(m);
}
function initMiniMaps() {
    document.querySelectorAll('#placeList .person-card').forEach(card => {
        if (card.querySelector('.person-details').style.display === 'block') {
            const m = card.querySelector('.place-mini-map');
            if (m && !m.dataset.inited) initMiniMap(m);
        }
    });
}

// ===== Keyboard =====
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        ['editPersonModal','newPersonModal','companyModal','placeModal'].forEach(id => {
            const m = document.getElementById(id); if (m) m.style.display = 'none';
        });
    }
});

// ===== Initial state =====
const initialParams = parseHashParams();
applyPeopleFilter();
applyCompanyFilter();
applyPlaceFilter();
activateTab(initialParams.tab || 'people');

// Deep-link to a specific entity within a tab
(function(){
    const params = initialParams;
    if (!params.key) return;
    const idMap = { people: 'p-', companies: 'c-', places: 'pl-' };
    const prefix = idMap[params.tab] || 'p-';
    const card = document.getElementById(prefix + params.key);
    if (card) {
        const details = card.querySelector('.person-details');
        const chev = card.querySelector('.person-chev');
        if (details) details.style.display = 'block';
        if (chev) chev.style.transform = 'rotate(90deg)';
        setTimeout(() => card.scrollIntoView({ block: 'center' }), 50);
        const m = card.querySelector('.place-mini-map');
        if (m && !m.dataset.inited) setTimeout(() => initMiniMap(m), 100);
    }
})();
// Also handle plain "#p-key" / "#c-key" / "#pl-key" links from elsewhere
(function(){
    const h = (location.hash || '').replace(/^#/, '');
    if (h.startsWith('p-')) activateTab('people');
    else if (h.startsWith('c-')) activateTab('companies');
    else if (h.startsWith('pl-')) activateTab('places');
    const card = h ? document.getElementById(h) : null;
    if (card) {
        const details = card.querySelector('.person-details');
        const chev = card.querySelector('.person-chev');
        if (details) details.style.display = 'block';
        if (chev) chev.style.transform = 'rotate(90deg)';
        setTimeout(() => card.scrollIntoView({ block: 'center' }), 50);
    }
})();
</script>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Personer og steder', body));
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
