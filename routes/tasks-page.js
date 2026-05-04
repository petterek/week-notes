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
    if (pathname === '/tasks') {
        const tasks = loadTasks();
        const tasksJson = JSON.stringify(tasks).replace(/</g, '\\u003c');
        const body = `
        <div class="breadcrumb"><a href="/">Ukenotater</a> / Oppgaver</div>
        <h1>☑️ Oppgaver</h1>
        <task-create id="taskCreate" tasks_service="week-note-services.tasks_service" autofocus-on-connect style="margin-bottom:20px;display:block"></task-create>
        <div style="margin-bottom:16px"><label style="cursor:pointer;font-size:0.9em;color:var(--text-muted);user-select:none"><input type="checkbox" id="showDone" onchange="localStorage.setItem('showDone',this.checked);renderTasks()" style="margin-right:6px" />Vis fullførte oppgaver</label></div>
        <div id="taskList"></div>
        ${commentModalHtml()}
        ${noteModalHtml()}
        <div id="mergeModal" class="page-modal dark" onclick="if(event.target===this)closeMergeModal()"><div class="page-modal-card"><h3 style="color:#c05621">⚠️ Slå sammen oppgaver</h3><p style="color:var(--text-muted);font-size:0.9em;margin-bottom:16px">Den første oppgaven beholdes. Den andre legges til som notat og slettes.</p><div style="background:#fff8f0;border:1px solid #fbd38d;border-radius:8px;padding:12px;margin-bottom:8px"><div style="font-size:0.75em;color:#c05621;font-weight:600;margin-bottom:4px">BEHOLDER</div><div id="mergeTgtText" style="font-weight:600;color:#2d3748"></div></div><div style="background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:12px;margin-bottom:20px"><div style="font-size:0.75em;color:#c53030;font-weight:600;margin-bottom:4px">SLETTES</div><div id="mergeSrcText" style="color:#2d3748"></div></div><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="closeMergeModal()">Avbryt</button><button class="page-modal-btn orange" style="padding:8px 20px" onclick="confirmMerge()">Slå sammen</button></div></div></div>
        <script>
        let tasks = ${tasksJson};

        document.getElementById('taskCreate').addEventListener('task:created', e => {
            if (Array.isArray(e.detail && e.detail.tasks)) {
                tasks = e.detail.tasks;
                renderTasks();
            }
        });

        function renderTasks() {
            const list = document.getElementById('taskList');
            if (tasks.length === 0) {
                list.innerHTML = '<p style="color:#718096;font-style:italic">Ingen oppgaver ennå.</p>';
                return;
            }

            // Group by week
            const byWeek = {};
            tasks.forEach(t => {
                const w = t.week || 'Uten uke';
                if (!byWeek[w]) byWeek[w] = [];
                byWeek[w].push(t);
            });

            // Sort weeks descending
            const sortedWeeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a));

            let html = '';
            const showDone = document.getElementById('showDone').checked;
            sortedWeeks.forEach(w => {
                const weekTasks = byWeek[w];
                const pending = weekTasks.filter(t => !t.done);
                const done = weekTasks.filter(t => t.done);
                const total = weekTasks.length;
                const doneCount = done.length;

                if (!showDone && pending.length === 0) return;

                html += '<div style="margin-bottom:24px">';
                html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
                html += '<span style="font-size:1.15em;font-weight:600;color:#2a4365">Uke ' + escapeHtml(w) + '</span>';
                html += '<span style="font-size:0.85em;color:#718096">' + doneCount + '/' + total + ' fullført</span>';
                html += '</div>';
                pending.forEach(t => { html += taskHtml(t); });
                if (showDone) { done.forEach(t => { html += taskHtml(t); }); }
                html += '</div>';
            });
            list.innerHTML = html;
        }

        function taskHtml(t) {
            const checked = t.done ? 'checked' : '';
            const textStyle = t.done ? 'text-decoration:line-through;color:#a0aec0' : '';
            const completedDate = t.done && t.completedAt ? '<span style="font-size:0.8em;color:#a0aec0;white-space:nowrap">' + t.completedAt.slice(0, 16).replace('T', ' ') + '</span>' : '';
            const commentLink = t.commentFile ? '<a href="/' + t.commentFile + '" style="color:#2b6cb0;font-size:0.85em;text-decoration:none" title="Se kommentar">📝</a>' : '';
            const hasNote = t.note && t.note.trim();
            const noteBtn = '<button onclick="openNoteModal(\\'' + t.id + '\\')" style="background:none;border:none;cursor:pointer;font-size:1em;opacity:' + (hasNote ? '1' : '0.35') + '" title="' + (hasNote ? 'Rediger notat' : 'Legg til notat') + '">📓</button>';
            const borderColor = t.done ? '#a0aec0' : '#2b6cb0';
            const noteHtml = hasNote ? '<div class="md-content" style="padding:4px 14px 8px 46px;font-size:0.85em;color:var(--text-muted);background:var(--surface);border-left:4px solid ' + borderColor + ';border-radius:0 0 8px 8px;margin-top:-4px">' + linkMentions(marked.parse(preTaskMarkers(t.note))) + '</div>' : '';
            const handle = t.done ? '' : '<span class="drag-handle" style="cursor:grab;color:var(--border);font-size:1.1em;padding:0 2px;user-select:none" title="Dra for å sortere">⠿</span>';
            return '<div data-id="' + t.id + '" draggable="' + (!t.done) + '" style="margin:4px 0" ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragend="onDragEnd(event)">'
                + '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border-radius:' + (hasNote ? '8px 8px 0 0' : '8px') + ';border-left:4px solid ' + borderColor + '">'
                + handle
                + '<input type="checkbox" ' + checked + ' onchange="toggleTask(\\'' + t.id + '\\')" style="width:18px;height:18px;cursor:pointer" />'
                + '<span style="flex:1;' + textStyle + '">' + linkMentions(escapeHtml(t.text)) + '</span>'
                + completedDate
                + commentLink
                + noteBtn
                + '<button onclick="editTask(\\'' + t.id + '\\')" style="background:none;border:none;cursor:pointer;color:#2b6cb0;font-size:1em" title="Rediger">✏️</button>'
                + '<button onclick="deleteTask(\\'' + t.id + '\\')" style="background:none;border:none;cursor:pointer;color:#e53e3e;font-size:1.1em" title="Slett">✕</button>'
                + '</div>'
                + noteHtml
                + '</div>';
        }

        function escapeHtml(s) {
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        let mentionPeople = [];
        fetch('/api/people').then(r => r.json()).then(p => { mentionPeople = p; renderTasks(); });
        function linkMentions(html) {
            if (!html) return html;
            return html.replace(/(^|[\\s\\n(\\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, function(m, pre, name) {
                let lc = name.toLowerCase();
                let display = name;
                if (lc === 'me') {
                    const mapped = window.mePersonKey || '';
                    if (!mapped) {
                        return pre + '<entity-mention kind="person" key="" label="@me"></entity-mention>';
                    }
                    lc = mapped;
                    display = mapped;
                }
                const p = mentionPeople.find(x => x.name === display || (x.key && x.key === lc));
                const finalDisplay = p ? (p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : p.name) : display;
                const key = p ? (p.key || (p.name || '').toLowerCase()) : lc;
                return pre + '<entity-mention kind="person" key="' + escapeHtml(key) + '" label="' + escapeHtml(finalDisplay) + '"></entity-mention>';
            });
        }

        let pendingToggleId = null;

        function toggleTask(id) {
            const task = tasks.find(t => t.id === id);
            if (task && !task.done) {
                pendingToggleId = id;
                document.getElementById('commentTaskText').textContent = task.text;
                document.getElementById('commentText').value = '';
                document.getElementById('commentModal').style.display = 'flex';
                setTimeout(() => document.getElementById('commentText').focus(), 100);
            } else {
                doToggle(id, '');
            }
        }

        function cancelComment() {
            document.getElementById('commentModal').style.display = 'none';
            pendingToggleId = null;
            renderTasks();
        }

        async function submitComment(withComment) {
            const comment = withComment ? document.getElementById('commentText').value.trim() : '';
            document.getElementById('commentModal').style.display = 'none';
            await doToggle(pendingToggleId, comment);
            pendingToggleId = null;
        }

        async function doToggle(id, comment) {
            const resp = await fetch('/api/tasks/' + id + '/toggle', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment })
            });
            tasks = await resp.json();
            renderTasks();
        }

        document.addEventListener('keydown', function(e) {
            if (document.getElementById('commentModal').style.display === 'flex') {
                if (e.key === 'Escape') cancelComment();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(true);
            }
        });

        async function deleteTask(id) {
            if (!confirm('Er du sikker på at du vil slette denne oppgaven?')) return;
            const resp = await fetch('/api/tasks/' + id, { method: 'DELETE' });
            tasks = await resp.json();
            renderTasks();
        }

        async function editTask(id) {
            var task = tasks.find(t => t.id === id);
            if (!task) return;
            var newText = prompt('Rediger oppgave:', task.text);
            if (newText === null || newText.trim() === '' || newText.trim() === task.text) return;
            var resp = await fetch('/api/tasks/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: newText.trim() })
            });
            tasks = await resp.json();
            renderTasks();
        }

        let dragSrcId = null;
        function onDragStart(e) {
            dragSrcId = e.currentTarget.dataset.id;
            e.currentTarget.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        }
        function dropZone(e) {
            const rect = e.currentTarget.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / rect.height;
            return relY < 0.3 ? 'before' : relY > 0.7 ? 'after' : 'merge';
        }
        function clearDragStyles() {
            document.querySelectorAll('[data-id]').forEach(el => {
                el.style.borderTop = '';
                el.style.borderBottom = '';
                el.style.outline = '';
            });
        }
        function onDragOver(e) {
            e.preventDefault();
            clearDragStyles();
            const target = e.currentTarget;
            if (target.dataset.id === dragSrcId) return;
            const zone = dropZone(e);
            if (zone === 'before') target.style.borderTop = '2px solid #2b6cb0';
            else if (zone === 'after') target.style.borderBottom = '2px solid #2b6cb0';
            else target.style.outline = '2px solid #ed8936';
        }
        function onDragEnd(e) {
            e.currentTarget.style.opacity = '';
            clearDragStyles();
        }
        async function onDrop(e) {
            e.preventDefault();
            clearDragStyles();
            const targetId = e.currentTarget.dataset.id;
            if (!dragSrcId || dragSrcId === targetId) return;
            const zone = dropZone(e);
            if (zone === 'merge') {
                const src = tasks.find(t => t.id === dragSrcId);
                const tgt = tasks.find(t => t.id === targetId);
                if (!src || !tgt) return;
                document.getElementById('mergeSrcText').textContent = src.text;
                document.getElementById('mergeTgtText').textContent = tgt.text;
                pendingMerge = { srcId: dragSrcId, tgtId: targetId };
                document.getElementById('mergeModal').style.display = 'flex';
            } else {
                const srcIdx = tasks.findIndex(t => t.id === dragSrcId);
                let tgtIdx = tasks.findIndex(t => t.id === targetId);
                const moved = tasks.splice(srcIdx, 1)[0];
                if (zone === 'after') tgtIdx = tasks.findIndex(t => t.id === targetId) + 1;
                else tgtIdx = tasks.findIndex(t => t.id === targetId);
                tasks.splice(tgtIdx, 0, moved);
                renderTasks();
                await fetch('/api/tasks/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: tasks.map(t => t.id) })
                });
            }
        }
        let pendingNoteId = null;
        let pendingMerge = null;
        function closeMergeModal() {
            document.getElementById('mergeModal').style.display = 'none';
            pendingMerge = null;
        }
        async function confirmMerge() {
            if (!pendingMerge) return;
            const resp = await fetch('/api/tasks/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pendingMerge)
            });
            tasks = await resp.json();
            closeMergeModal();
            renderTasks();
        }
        function openNoteModal(id) {
            const task = tasks.find(t => t.id === id);
            if (!task) return;
            pendingNoteId = id;
            document.getElementById('noteTaskText').textContent = task.text;
            document.getElementById('noteText').value = task.note || '';
            document.getElementById('noteModal').style.display = 'flex';
            setTimeout(() => document.getElementById('noteText').focus(), 100);
        }
        function closeNoteModal() {
            document.getElementById('noteModal').style.display = 'none';
            pendingNoteId = null;
        }
        async function saveNote() {
            if (!pendingNoteId) return;
            const note = document.getElementById('noteText').value.trim();
            const resp = await fetch('/api/tasks/' + pendingNoteId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            tasks = await resp.json();
            closeNoteModal();
            renderTasks();
        }
        document.addEventListener('keydown', function(e) {
            if (document.getElementById('noteModal').style.display === 'flex') {
                if (e.key === 'Escape') closeNoteModal();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote();
            }
            if (document.getElementById('mergeModal').style.display === 'flex') {
                if (e.key === 'Escape') closeMergeModal();
                if (e.key === 'Enter') confirmMerge();
            }
        });

        document.getElementById('showDone').checked = localStorage.getItem('showDone') === 'true';
        renderTasks();
        </script>
        <script src="/mention-autocomplete.js"></script>
        <script>
        initMentionAutocomplete(document.getElementById('taskInput'));
        // Init autocomplete on note modal textarea when it opens
        (function() {
            const orig = window.openNoteModal;
            window.openNoteModal = function(id) { orig(id); setTimeout(() => initMentionAutocomplete(document.getElementById('noteText')), 120); };
        })();
        // Init autocomplete on comment modal textarea when it opens
        (function() {
            const orig = window.showCommentModal;
            window.showCommentModal = function(el) { orig(el); setTimeout(() => initMentionAutocomplete(document.getElementById('commentText')), 120); };
        })();
        </script>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Oppgaver', body));
        return;
    }
    };
};
