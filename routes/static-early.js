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
    if (pathname === '/welcome.css') {
        try {
            const data = await fs.promises.readFile(path.join(__dirname, 'welcome.css'));
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
            res.end(data);
        } catch (e) { res.writeHead(404); res.end(); }
        return;
    }
    if (pathname === '/welcome') {
        const theme = 'paper';
        const html = `<!doctype html>
<html lang="nb"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Velkommen — Ukenotater</title>
<link rel="stylesheet" href="/themes/${theme}.css">
<link rel="stylesheet" href="/welcome.css">
</head><body>
<div class="welcome-shell">
    <header class="welcome-hero">
        <div class="welcome-hero__emoji">📒</div>
        <h1 class="welcome-hero__title">Velkommen til Ukenotater</h1>
        <p class="welcome-hero__tagline">Strukturerte ukentlige notater, oppgaver, personer, møter og resultater — i isolerte kontekster.</p>
    </header>

    <section class="welcome-features">
        <div class="welcome-features__item">
            <div class="welcome-features__icon">📅</div>
            <h3>Ukenotater</h3>
            <p>Frittflytende markdown-notater organisert per ISO-uke (YYYY-WNN).</p>
        </div>
        <div class="welcome-features__item">
            <div class="welcome-features__icon">✅</div>
            <h3>Oppgaver &amp; resultater</h3>
            <p>Oppgaver med ukekobling, og en resultatlogg som binder alt sammen.</p>
        </div>
        <div class="welcome-features__item">
            <div class="welcome-features__icon">👥</div>
            <h3>Personer &amp; møter</h3>
            <p>CRM-light og kalender med møtetyper per kontekst.</p>
        </div>
        <div class="welcome-features__item">
            <div class="welcome-features__icon">🔒</div>
            <h3>Isolerte kontekster</h3>
            <p>Hver kontekst er sitt eget git-repo under <code>data/&lt;navn&gt;/</code>.</p>
        </div>
    </section>

    <h2 class="welcome-section-heading">Kom i gang — opprett din første kontekst</h2>
    <p class="welcome-section-sub">Velg én av to måter:</p>

    <div class="welcome-cards">
        <article class="welcome-card">
            <header class="welcome-card__head">
                <span class="welcome-card__icon">➕</span>
                <div><h3>Ny tom kontekst</h3><p>Start fra blanke ark. Du kan koble til en git-remote senere.</p></div>
            </header>
            <form id="newCtxForm">
                <div class="welcome-card__grid">
                    <label>Navn<input type="text" id="newName" placeholder="f.eks. Privat" required></label>
                    <label>Ikon<span class="welcome-icon-pick"><input type="text" id="newIcon" value="📁" maxlength="4"></span></label>
                </div>
                <label>Beskrivelse<textarea id="newDescription" rows="2"></textarea></label>
                <label>Git-remote (valgfritt)<input type="text" id="newRemote" placeholder="git@github.com:bruker/repo.git" spellcheck="false"></label>
                <div class="welcome-card__actions">
                    <button type="submit">➕ Opprett</button>
                    <span id="newCtxStatus" class="welcome-status"></span>
                </div>
            </form>
        </article>

        <article class="welcome-card">
            <header class="welcome-card__head">
                <span class="welcome-card__icon">📥</span>
                <div><h3>Klon fra remote</h3><p>Hent en eksisterende kontekst fra et git-repo (f.eks. backup eller annen maskin).</p></div>
            </header>
            <form id="cloneCtxForm">
                <label>Git-remote<input type="text" id="cloneRemote" placeholder="git@github.com:bruker/repo.git" spellcheck="false" required></label>
                <label>Navn (valgfritt — utledes fra repo-URLen)<input type="text" id="cloneName" placeholder="overstyr utledet navn" spellcheck="false"></label>
                <div id="knownRepos" class="welcome-known" hidden>
                    <div class="welcome-known__label">Tidligere koblet fra:</div>
                    <ul class="welcome-known__list"></ul>
                </div>
                <div class="welcome-card__actions">
                    <button type="submit">📥 Klon</button>
                    <span id="cloneCtxStatus" class="welcome-status"></span>
                </div>
            </form>
        </article>
    </div>
</div>

<script>
(function () {
    function setStatus(el, text, isError) {
        el.textContent = text;
        el.classList.toggle('error', !!isError);
    }
    function goSettings(id) {
        var done = function () { location.href = '/settings'; };
        if (!id) { done(); return; }
        fetch('/api/contexts/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        }).then(done, done);
    }
    document.getElementById('newCtxForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var s = document.getElementById('newCtxStatus');
        function send(force) {
            setStatus(s, force ? '⏳ Oppretter (bekreftet)…' : '⏳ Oppretter…', false);
            return fetch('/api/contexts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: document.getElementById('newName').value,
                    icon: document.getElementById('newIcon').value || '📁',
                    description: document.getElementById('newDescription').value,
                    remote: document.getElementById('newRemote').value,
                    force: !!force
                })
            }).then(function (r) { return r.json(); });
        }
        send(false).then(function (d) {
            if (d.ok) { setStatus(s, '✓ Opprettet — åpner innstillinger…', false); setTimeout(function () { goSettings(d.id); }, 600); return; }
            if (d.needsConfirm && confirm(d.error + '\\n\\nVil du opprette .week-notes-fil og fortsette?')) {
                return send(true).then(function (d2) {
                    if (d2.ok) { setStatus(s, '✓ Opprettet — åpner innstillinger…', false); setTimeout(function () { goSettings(d2.id); }, 600); }
                    else setStatus(s, '✗ ' + d2.error, true);
                });
            }
            setStatus(s, '✗ ' + d.error, true);
        }).catch(function (err) { setStatus(s, '✗ ' + err, true); });
    });
    document.getElementById('cloneCtxForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var s = document.getElementById('cloneCtxStatus');
        function send(force) {
            setStatus(s, force ? '⏳ Kloner (bekreftet)…' : '⏳ Kloner…', false);
            return fetch('/api/contexts/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    remote: document.getElementById('cloneRemote').value,
                    name: document.getElementById('cloneName').value,
                    force: !!force
                })
            }).then(function (r) { return r.json(); });
        }
        send(false).then(function (d) {
            if (d.ok) { setStatus(s, '✓ Klonet — åpner innstillinger…', false); setTimeout(function () { goSettings(d.id); }, 600); return; }
            if (d.needsConfirm && confirm(d.error + '\\n\\nVil du opprette .week-notes-fil og fortsette?')) {
                return send(true).then(function (d2) {
                    if (d2.ok) { setStatus(s, '✓ Klonet — åpner innstillinger…', false); setTimeout(function () { goSettings(d2.id); }, 600); }
                    else setStatus(s, '✗ ' + d2.error, true);
                });
            }
            setStatus(s, '✗ ' + d.error, true);
        }).catch(function (err) { setStatus(s, '✗ ' + err, true); });
    });

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
    fetch('/api/contexts/disconnected').then(function (r) { return r.json(); }).then(function (list) {
        if (!Array.isArray(list) || list.length === 0) return;
        var box = document.getElementById('knownRepos');
        var ul = box.querySelector('ul');
        ul.innerHTML = list.map(function (d) {
            return '<li>'
                + '<button type="button" class="welcome-known__pick" data-remote="' + escapeHtml(d.remote) + '" data-name="' + escapeHtml(d.name || d.id) + '">'
                + '<span class="welcome-known__icon">' + escapeHtml(d.icon || '📁') + '</span>'
                + '<span class="welcome-known__meta"><strong>' + escapeHtml(d.name || d.id) + '</strong><span>' + escapeHtml(d.remote) + '</span></span>'
                + '</button>'
                + '<button type="button" class="welcome-known__forget" data-forget="' + escapeHtml(d.id) + '" title="Glem denne">✕</button>'
                + '</li>';
        }).join('');
        box.hidden = false;
        ul.querySelectorAll('.welcome-known__pick').forEach(function (b) {
            b.addEventListener('click', function () {
                document.getElementById('cloneRemote').value = b.getAttribute('data-remote');
                document.getElementById('cloneName').value = b.getAttribute('data-name') || '';
                document.getElementById('cloneRemote').focus();
            });
        });
        ul.querySelectorAll('.welcome-known__forget').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = b.getAttribute('data-forget');
                fetch('/api/contexts/disconnected/' + encodeURIComponent(id), { method: 'DELETE' })
                    .then(function () { b.closest('li').remove(); if (!ul.children.length) box.hidden = true; });
            });
        });
    });
})();
</script>
</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }

    // Theme stylesheets — built-ins from themes/, custom from data/_themes/
    if (pathname.startsWith('/themes/') && pathname.endsWith('.css')) {
        const slug = pathname.slice('/themes/'.length, -'.css'.length);
        if (!/^[a-z0-9_-]+$/.test(slug)) { res.writeHead(404); res.end('Bad theme'); return; }
        const builtin = path.join(__dirname, 'themes', slug + '.css');
        const custom = path.join(CUSTOM_THEMES_DIR, slug + '.css');
        const file = fs.existsSync(builtin) ? builtin : custom;
        try {
            const data = await fs.promises.readFile(file);
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) { res.writeHead(404); res.end('Theme not found'); }
        return;
    }

    // Layout mockups (design preview)
    if (pathname === '/_layouts' || pathname === '/_layouts.html') {
        try {
            const file = fs.readFileSync('/home/p/.copilot/session-state/46f37a99-6d5b-4ad2-b330-4e8127bb956b/files/layouts.html', 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(file);
        } catch (e) {
            res.writeHead(404); res.end('Layouts not found: ' + e.message);
        }
        return;
    }

    // Help content (rendered client-side via marked)
    if (pathname === '/help.md') {
        try {
            const file = fs.readFileSync(path.join(__dirname, 'help.md'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
            res.end(file);
        } catch (e) {
            res.writeHead(404); res.end('Help not found');
        }
        return;
    }

    // Static page fragments (loaded by the SPA router). Supports simple
    // {{KEY}} substitutions for per-context server-side values.
    if (pathname.startsWith('/pages/') && pathname.endsWith('.html')) {
        const slug = pathname.slice('/pages/'.length, -'.html'.length);
        if (!/^[a-z0-9_-]+$/.test(slug)) { res.writeHead(404); res.end('Bad page'); return; }
        const file = path.join(__dirname, 'pages', slug + '.html');
        try {
            const data = await fs.promises.readFile(file, 'utf-8');
            const subs = {
                UPCOMING_MEETINGS_DAYS: String(getUpcomingMeetingsDays())
            };
            const out = data.replace(/\{\{(\w+)\}\}/g, (m, k) =>
                Object.prototype.hasOwnProperty.call(subs, k) ? subs[k] : m
            );
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(out);
        } catch (e) { res.writeHead(404); res.end('Page not found'); }
        return;
    }

    };
};
