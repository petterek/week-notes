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
    function renderServicesDebug(req, res) {
        // Production services + their GET endpoints. Each entry's `methods`
        // describe how to invoke a method via the service object on `window`.
        // Each method has:
        //   name   : method name on the service
        //   http   : human-readable HTTP method + path
        //   desc   : what it returns
        //   params : [{ name, type:'text', placeholder?, optional?, default? }]
        //            For the `list` filter pattern, the params are merged into
        //            a single { ... } object passed as the first arg.
        //   shape  : 'positional' (default — pass each param as positional arg)
        //          | 'filter'     (single object: {name: value, ...})
        const SERVICES_RAW = [
            {
                key: 'context', global: 'ContextService',
                title: 'ContextService',
                desc: 'Workspace (context) management + per-context git status.',
                methods: [
                    { name: 'list',             http: 'GET /api/contexts',                       desc: 'All workspaces.', params: [] },
                    { name: 'listDisconnected', http: 'GET /api/contexts/disconnected',          desc: 'Workspaces removed but still on disk.', params: [] },
                    { name: 'gitStatus',        http: 'GET /api/contexts/:id/git',               desc: 'Git status for a workspace.', params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'create',           http: 'POST /api/contexts',                      desc: 'Create a new workspace.', params: [{ name: 'data', json: true, placeholder: '{"name":"new-ctx","icon":"📁"}' }] },
                    { name: 'clone',            http: 'POST /api/contexts/clone',                desc: 'Clone a workspace from a remote git repo.', params: [{ name: 'data', json: true, placeholder: '{"name":"new-ctx","remote":"git@…"}' }] },
                    { name: 'switchTo',         http: 'POST /api/contexts/switch',               desc: 'Switch the active workspace.', params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'commit',           http: 'POST /api/contexts/:id/commit',           desc: 'Commit pending changes in a workspace.', params: [{ name: 'id', placeholder: 'e.g. work' }, { name: 'body', json: true, placeholder: '{"message":"…"}' }] },
                    { name: 'push',             http: 'POST /api/contexts/:id/push',             desc: 'Push commits to remote.', params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'pull',             http: 'POST /api/contexts/:id/pull',             desc: 'Pull from remote.', params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'disconnect',       http: 'POST /api/contexts/:id/disconnect',       desc: 'Remove workspace from active list (keep on disk).', destructive: true, params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'forgetDisconnected', http: 'DELETE /api/contexts/disconnected/:id', desc: 'Permanently forget a disconnected workspace.', params: [{ name: 'id', placeholder: 'e.g. old-ctx' }] },
                ],
            },
            {
                key: 'meetings', global: 'MeetingsService',
                title: 'MeetingsService',
                desc: 'Meetings + meeting types.',
                methods: [
                    { name: 'list', http: 'GET /api/meetings[?week=&upcoming=]', desc: 'List meetings (optionally filtered).', shape: 'filter', params: [
                        { name: 'week', placeholder: 'YYYY-WNN', optional: true },
                        { name: 'upcoming', placeholder: 'days, e.g. 14', optional: true },
                    ] },
                    { name: 'listTypes', http: 'GET /api/meeting-types', desc: 'Meeting type catalogue.', params: [] },
                    { name: 'create',  http: 'POST /api/meetings',        desc: 'Create a meeting.', params: [{ name: 'data', json: true, placeholder: '{"title":"…","start":"YYYY-MM-DDTHH:MM"}' }] },
                    { name: 'update',  http: 'PUT /api/meetings/:id',     desc: 'Update a meeting.', params: [{ name: 'id', placeholder: 'meeting id' }, { name: 'patch', json: true, placeholder: '{"title":"…"}' }] },
                    { name: 'remove',  http: 'DELETE /api/meetings/:id',  desc: 'Delete a meeting.', params: [{ name: 'id', placeholder: 'meeting id' }] },
                    { name: 'saveTypes', http: 'PUT /api/meeting-types',  desc: 'Replace the meeting-type catalogue.', params: [{ name: 'types', json: true, placeholder: '[{"id":"1on1","label":"1:1","icon":"💬"}]' }] },
                ],
            },
            {
                key: 'notes', global: 'NotesService',
                title: 'NotesService',
                desc: 'Weekly notes + per-file metadata, raw + rendered content.',
                methods: [
                    { name: 'listWeeks', http: 'GET /api/weeks',                       desc: 'All known week ids.', params: [] },
                    { name: 'listAll',   http: 'GET /api/notes',                       desc: 'All notes across weeks (flat list).', params: [] },
                    { name: 'getWeek',   http: 'GET /api/week/:week',                  desc: 'Week metadata + notes index.', params: [{ name: 'week', placeholder: 'YYYY-WNN' }] },
                    { name: 'meta',      http: 'GET /api/notes/:week/:file/meta',      desc: 'Note metadata (frontmatter etc).', params: [{ name: 'week', placeholder: 'YYYY-WNN' }, { name: 'file', placeholder: 'mandag.md' }] },
                    { name: 'card',      http: 'GET /api/notes/:week/:file/card',      desc: 'Sidebar card payload (snippet, type, pin).', params: [{ name: 'week', placeholder: 'YYYY-WNN' }, { name: 'file', placeholder: 'mandag.md' }] },
                    { name: 'raw',       http: 'GET /api/notes/:week/:file/raw',       desc: 'Raw markdown.',  params: [{ name: 'week', placeholder: 'YYYY-WNN' }, { name: 'file', placeholder: 'mandag.md' }] },
                    { name: 'renderHtml',http: 'GET /api/notes/:week/:file/render',    desc: 'Server-rendered HTML.', params: [{ name: 'week', placeholder: 'YYYY-WNN' }, { name: 'file', placeholder: 'mandag.md' }] },
                    { name: 'save',      http: 'POST /api/save',                       desc: 'Create or overwrite a note.', params: [{ name: 'data', json: true, placeholder: '{"folder":"YYYY-WNN","file":"name.md","content":"…"}' }] },
                    { name: 'setPinned', http: 'PUT /api/notes/:week/:file/pin',       desc: 'Pin/unpin a note.', params: [{ name: 'week', placeholder: 'YYYY-WNN' }, { name: 'file', placeholder: 'mandag.md' }, { name: 'pinned', placeholder: 'true / false' }] },
                    { name: 'remove',    http: 'DELETE /api/notes/:week/:file',        desc: 'Delete a note.', params: [{ name: 'week', placeholder: 'YYYY-WNN' }, { name: 'file', placeholder: 'mandag.md' }] },
                ],
            },
            {
                key: 'people', global: 'PeopleService',
                title: 'PeopleService',
                desc: 'People directory.',
                methods: [
                    { name: 'list',   http: 'GET /api/people',         desc: 'All people.', params: [] },
                    { name: 'create', http: 'POST /api/people',        desc: 'Create a person.', params: [{ name: 'person', json: true, placeholder: '{"firstName":"…","lastName":"…"}' }] },
                    { name: 'update', http: 'PUT /api/people/:id',     desc: 'Update a person.', params: [{ name: 'id', placeholder: 'person id' }, { name: 'patch', json: true, placeholder: '{"firstName":"…"}' }] },
                    { name: 'remove', http: 'DELETE /api/people/:id',  desc: 'Delete a person.', params: [{ name: 'id', placeholder: 'person id' }] },
                ],
            },
            {
                key: 'people', global: 'CompaniesService',
                title: 'CompaniesService',
                desc: 'Companies directory (same module as PeopleService).',
                methods: [
                    { name: 'list',   http: 'GET /api/companies',         desc: 'All companies.', params: [] },
                    { name: 'create', http: 'POST /api/companies',        desc: 'Create a company.', params: [{ name: 'company', json: true, placeholder: '{"name":"…"}' }] },
                    { name: 'update', http: 'PUT /api/companies/:id',     desc: 'Update a company.', params: [{ name: 'id', placeholder: 'company id' }, { name: 'patch', json: true, placeholder: '{"name":"…"}' }] },
                    { name: 'remove', http: 'DELETE /api/companies/:id',  desc: 'Delete a company.', params: [{ name: 'id', placeholder: 'company id' }] },
                ],
            },
            {
                key: 'people', global: 'PlacesService',
                title: 'PlacesService',
                desc: 'Places used as meeting locations (same module as PeopleService).',
                methods: [
                    { name: 'list',   http: 'GET /api/places',         desc: 'All registered places.', params: [] },
                    { name: 'create', http: 'POST /api/places',        desc: 'Create a place.', params: [{ name: 'place', json: true, placeholder: '{"name":"…"}' }] },
                    { name: 'update', http: 'PUT /api/places/:id',     desc: 'Update a place.', params: [{ name: 'id', placeholder: 'place id' }, { name: 'patch', json: true, placeholder: '{"name":"…"}' }] },
                    { name: 'remove', http: 'DELETE /api/places/:id',  desc: 'Delete a place.', params: [{ name: 'id', placeholder: 'place id' }] },
                ],
            },
            {
                key: 'results', global: 'ResultsService',
                title: 'ResultsService',
                desc: 'Result/outcome log.',
                methods: [
                    { name: 'list', http: 'GET /api/results[?week=]', desc: 'Results, optionally filtered.', shape: 'filter', params: [
                        { name: 'week', placeholder: 'YYYY-WNN', optional: true },
                    ] },
                    { name: 'create', http: 'POST /api/results',        desc: 'Create a result.', params: [{ name: 'data', json: true, placeholder: '{"text":"…","week":"YYYY-WNN"}' }] },
                    { name: 'update', http: 'PUT /api/results/:id',     desc: 'Update a result.', params: [{ name: 'id', placeholder: 'result id' }, { name: 'patch', json: true, placeholder: '{"text":"…"}' }] },
                    { name: 'remove', http: 'DELETE /api/results/:id',  desc: 'Delete a result.', params: [{ name: 'id', placeholder: 'result id' }] },
                ],
            },
            {
                key: 'search', global: 'SearchService',
                title: 'SearchService',
                desc: 'Cross-cutting global search.',
                methods: [
                    { name: 'search', http: 'GET /api/search?q=', desc: 'Search across notes, tasks, results, meetings, people.', params: [
                        { name: 'q', placeholder: 'search text' },
                    ] },
                ],
            },
            {
                key: 'settings', global: 'SettingsService',
                title: 'SettingsService',
                desc: 'Per-context settings, meeting-type catalogue, theme catalogue.',
                methods: [
                    { name: 'getSettings',     http: 'GET /api/contexts/:id/settings',      desc: 'Per-context settings.', params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'getMeetingTypes', http: 'GET /api/contexts/:id/meeting-types', desc: 'Meeting types for a context.', params: [{ name: 'id', placeholder: 'e.g. work' }] },
                    { name: 'listThemes',      http: 'GET /api/themes',                     desc: 'All themes.', params: [] },
                    { name: 'saveSettings',    http: 'PUT /api/contexts/:id/settings',      desc: 'Replace per-context settings.', params: [{ name: 'id', placeholder: 'e.g. work' }, { name: 'body', json: true, placeholder: '{"theme":"paper", …}' }] },
                    { name: 'saveMeetingTypes',http: 'PUT /api/contexts/:id/meeting-types', desc: 'Replace meeting types for a context.', params: [{ name: 'id', placeholder: 'e.g. work' }, { name: 'types', json: true, placeholder: '[{"id":"1on1","label":"1:1"}]' }] },
                    { name: 'createTheme',     http: 'POST /api/themes',                    desc: 'Create a custom theme (clone or new).', params: [{ name: 'data', json: true, placeholder: '{"from":"paper","name":"my-theme"}' }] },
                    { name: 'updateTheme',     http: 'PUT /api/themes/:id',                 desc: 'Update a theme.', params: [{ name: 'id', placeholder: 'theme id' }, { name: 'body', json: true, placeholder: '{"vars":{…}}' }] },
                    { name: 'removeTheme',     http: 'DELETE /api/themes/:id',              desc: 'Delete a custom theme.', params: [{ name: 'id', placeholder: 'theme id' }] },
                ],
            },
            {
                key: 'tasks', global: 'TaskService',
                title: 'TaskService',
                desc: 'Open + completed tasks.',
                methods: [
                    { name: 'list',    http: 'GET /api/tasks',                   desc: 'All tasks (open + completed).', params: [] },
                    { name: 'create',  http: 'POST /api/tasks',                  desc: 'Create a new task.', params: [{ name: 'text', placeholder: 'task description' }] },
                    { name: 'update',  http: 'PUT /api/tasks/:id',               desc: 'Update a task.', params: [{ name: 'id', placeholder: 'task id' }, { name: 'patch', json: true, placeholder: '{"text":"…"}' }] },
                    { name: 'remove',  http: 'DELETE /api/tasks/:id',            desc: 'Delete a task.', params: [{ name: 'id', placeholder: 'task id' }] },
                    { name: 'toggle',  http: 'PUT /api/tasks/:id/toggle',        desc: 'Toggle done/open (with optional completion comment).', params: [{ name: 'id', placeholder: 'task id' }, { name: 'comment', placeholder: 'optional', optional: true }] },
                    { name: 'merge',   http: 'POST /api/tasks/merge',            desc: 'Merge one task into another.', params: [{ name: 'srcId', placeholder: 'source task id' }, { name: 'tgtId', placeholder: 'target task id' }] },
                    { name: 'reorder', http: 'POST /api/tasks/reorder',          desc: 'Reorder tasks by id list.', params: [{ name: 'ids', json: true, placeholder: '["id1","id2","id3"]' }] },
                ],
            },
        ];
        const SERVICES = SERVICES_RAW.slice().sort((a, b) => a.global.localeCompare(b.global));

        const html = `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <title>Debug · services</title>
    <link rel="stylesheet" href="/themes/paper.css">
${SERVICES.map(s => `    <link rel="modulepreload" href="/debug/services/${s.key}.js">`).filter((v, i, a) => a.indexOf(v) === i).join('\n')}
    <script type="module" src="/components/json-table.js"></script>
    <style>
        body { font-family: var(--font-family, -apple-system, sans-serif); font-size: var(--font-size, 16px); margin: 0; line-height: 1.55; color: var(--text-strong); background: var(--bg); }
        .dbg-page { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
        .dbg-side { background: var(--surface-head); border-right: 1px solid var(--border-faint); padding: 16px 14px; position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; }
        .dbg-side h2 { font-family: Georgia, serif; color: var(--accent); margin: 0 0 10px; font-size: 1.05em; }
        .dbg-nav { display: flex; flex-direction: column; gap: 2px; }
        .dbg-nav a { display: block; padding: 6px 10px; border-radius: 4px; color: var(--text); text-decoration: none; font-family: ui-monospace, monospace; font-size: 0.88em; }
        .dbg-nav a:hover { background: var(--surface-alt); }
        .dbg-nav a.active { background: var(--accent); color: var(--text-on-accent, white); }
        .dbg-group-label { font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 12px 8px 4px; }
        .dbg-group-label:first-of-type { margin-top: 0; }
        .dbg-main { padding: 20px 26px; max-width: 1100px; }
        .dbg-head h1 { font-family: Georgia, serif; color: var(--accent); font-size: 1.4em; margin: 0 0 4px; }
        .dbg-head .desc { color: var(--text-muted); font-size: 0.9em; margin-bottom: 14px; }
        .svc { background: var(--surface); border: 1px solid var(--border-faint); border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
        .svc > h2 { margin: 0 0 4px; font-family: Georgia, serif; color: var(--accent); font-size: 1.1em; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
        .svc > h2 .glob { font-family: ui-monospace, monospace; font-size: 0.8em; color: var(--text-subtle); margin-left: 8px; }
        .svc .view-code-btn { font-family: ui-monospace, monospace; cursor: pointer; background: var(--surface-head, transparent); border: 1px solid var(--border-faint); color: var(--text-muted); border-radius: 4px; padding: 2px 8px; }
        .svc .view-code-btn:hover { color: var(--accent); border-color: var(--accent); }
        .svc pre.src { background: var(--surface-head, #f5f5f5); border: 1px solid var(--border-faint); border-radius: 6px; padding: 10px 14px; font-family: ui-monospace, monospace; font-size: 0.82em; line-height: 1.45; max-height: 480px; overflow: auto; margin: 6px 0 12px; white-space: pre; }
        .code-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: none; align-items: center; justify-content: center; z-index: 9999; padding: 32px; }
        .code-modal.open { display: flex; }
        .code-modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; width: min(960px, 100%); max-height: 100%; display: flex; flex-direction: column; box-shadow: 0 18px 48px rgba(0,0,0,0.35); }
        .code-modal-head { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border-faint); }
        .code-modal-head h3 { margin: 0; font-family: Georgia, serif; color: var(--accent); font-size: 1.05em; }
        .code-modal-head .src-path { font-family: ui-monospace, monospace; font-size: 0.78em; color: var(--text-subtle); }
        .code-modal-head .spacer { flex: 1; }
        .code-modal-head button { cursor: pointer; background: transparent; border: 1px solid var(--border-faint); color: var(--text-muted); border-radius: 4px; padding: 4px 10px; font-family: ui-monospace, monospace; }
        .code-modal-head button:hover { color: var(--accent); border-color: var(--accent); }
        .code-modal-body { flex: 1 1 auto; overflow: auto; padding: 0; }
        .code-modal-body pre { margin: 0; padding: 14px 18px; font-family: ui-monospace, monospace; font-size: 0.82em; line-height: 1.45; white-space: pre; color: var(--text-strong); background: var(--surface-head, #f5f5f5); }
        .svc > .desc { color: var(--text-muted); font-size: 0.9em; margin-bottom: 10px; }
        .method { border-top: 1px solid var(--border-faint); padding: 10px 0; }
        .method:first-of-type { border-top: none; }
        .method .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .method .name { font-family: ui-monospace, monospace; font-size: 0.95em; font-weight: 600; min-width: 130px; }
        .method .http { font-family: ui-monospace, monospace; font-size: 0.78em; color: var(--text-subtle); background: var(--surface-alt); padding: 2px 6px; border-radius: 4px; font-weight: 600; }
        .method .http.verb-get    { background: #e6f0ff; color: #1d4ed8; }
        .method .http.verb-post   { background: #e6f7ec; color: #166534; }
        .method .http.verb-put    { background: #fff4d6; color: #92400e; }
        .method .http.verb-delete { background: #fde2e2; color: #b91c1c; }
        .method.destructive { background: rgba(220, 38, 38, 0.04); border-left: 3px solid #b91c1c; padding-left: 10px; }
        .method.destructive button[data-run] { background: #b91c1c; }
        .method .desc { color: var(--text-muted); font-size: 0.85em; flex: 1 1 100%; margin-top: 2px; }
        .method input, .method textarea { font-family: ui-monospace, monospace; font-size: 0.85em; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text-strong); }
        .method input.opt, .method textarea.opt { border-style: dashed; }
        .method textarea { min-width: 240px; resize: vertical; }
        .method label.json-arg { flex: 1 1 240px; }
        .method label.json-arg textarea { width: 100%; }
        .method label { font-size: 0.78em; color: var(--text-subtle); display: inline-flex; flex-direction: column; gap: 2px; }
        .method button { font-size: 0.85em; padding: 4px 12px; background: var(--accent); color: var(--text-on-accent, white); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
        .method button:disabled { opacity: 0.5; cursor: wait; }
        .out { margin-top: 8px; }
        .out pre { margin: 0; padding: 8px 10px; background: var(--surface-alt); border-radius: 6px; max-height: 320px; overflow: auto; font-family: ui-monospace, monospace; font-size: 0.8em; white-space: pre-wrap; word-break: break-word; }
        .out .meta { font-size: 0.75em; color: var(--text-subtle); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
        .out .meta > span { flex: 1; }
        .out .meta .close-out { background: transparent; border: 1px solid var(--border-faint); color: var(--text-subtle); border-radius: 4px; padding: 0 6px; font-size: 1em; line-height: 1.2; cursor: pointer; font-weight: 600; }
        .out .meta .close-out:hover { color: var(--accent); border-color: var(--accent); }
        .out .meta .toggle-view { background: transparent; border: 1px solid var(--border-faint); color: var(--text-subtle); border-radius: 4px; padding: 1px 8px; font-size: 0.95em; line-height: 1.2; cursor: pointer; font-family: ui-monospace, monospace; }
        .out .meta .toggle-view:hover { color: var(--accent); border-color: var(--accent); }
        .out json-table { display: block; margin-top: 4px; }
        .out json-table[hidden] { display: none; }
        .out.err pre { background: var(--danger-bg, #fee); color: var(--danger, #900); }
        .toolbar { margin-bottom: 14px; }
        .toolbar button { font-size: 0.85em; padding: 4px 12px; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text-strong); }
    </style>
</head>
<body>
    <div class="dbg-page">
        <aside class="dbg-side">
            <h2>Components</h2>
            <nav class="dbg-nav">
                <a href="/debug">← components</a>
            </nav>
            <h2 style="margin-top:18px">Services</h2>
            <nav class="dbg-nav">
                ${SERVICES.map(s => `<a href="#svc-${s.global.toLowerCase()}">${s.global}</a>`).join('')}
            </nav>
        </aside>
        <main class="dbg-main">
            <header class="dbg-head">
                <h1>Production services</h1>
                <p class="desc">All ${SERVICES.length} production services and their full method surface (GET / POST / PUT / DELETE), imported as ES modules from <code>domains/&lt;name&gt;/service.js</code> — no globals on <code>window</code>. Calls hit the live <code>/api/*</code> backend. Destructive methods (mutating writes / deletes) are highlighted and require confirmation before running. Use <strong>Run all</strong> to invoke every parameter-less GET in one go (writes are skipped).</p>
            </header>
            <div class="toolbar">
                <button id="btnRunAll" type="button">▶ Run all parameter-less GETs</button>
            </div>
            ${SERVICES.map(s => `
                <section class="svc" id="svc-${s.global.toLowerCase()}">
                    <h2>${s.title} <span class="glob">import { ${s.global} }</span>
                        <button type="button" class="view-code-btn" data-src="/debug/services/${s.key}.js" data-title="${escapeHtml(s.global)}" style="margin-left:auto;font-size:0.78em">&lt;/&gt; View code</button>
                    </h2>
                    <p class="desc">${s.desc} <span style="font-family:ui-monospace,monospace;font-size:0.78em;color:var(--text-subtle);margin-left:6px">· source: <a href="/debug/services/${s.key}.js" style="color:var(--text-subtle)">domains/${s.key}/service.js</a></span></p>
                    ${s.methods.map((m, i) => {
                        const id = `${s.global.toLowerCase()}-${m.name}`;
                        const inputs = m.params.map(p => {
                            if (p.json) {
                                return `
                            <label class="json-arg">${escapeHtml(p.name)} <span style="opacity:.6">(JSON${p.optional ? ', valgfri' : ''})</span>
                                <textarea data-param="${escapeHtml(p.name)}" data-json="1" rows="3" placeholder="${escapeHtml(p.placeholder || '{}')}"${p.optional ? ' class="opt"' : ''}></textarea>
                            </label>`;
                            }
                            return `
                            <label>${escapeHtml(p.name)}${p.optional ? ' <span style="opacity:.6">(valgfri)</span>' : ''}
                                <input type="text" data-param="${escapeHtml(p.name)}" placeholder="${escapeHtml(p.placeholder || '')}"${p.optional ? ' class="opt"' : ''}>
                            </label>`;
                        }).join('');
                        const verb = (m.http || '').split(' ')[0];
                        const verbClass = verb === 'POST' ? 'verb-post' : verb === 'PUT' ? 'verb-put' : verb === 'DELETE' ? 'verb-delete' : 'verb-get';
                        const destructive = m.destructive || verb === 'DELETE';
                        return `
                        <div class="method ${destructive ? 'destructive' : ''}" data-svc="${s.global}" data-method="${m.name}" data-shape="${m.shape || 'positional'}" data-destructive="${destructive ? '1' : ''}" data-params='${escapeHtml(JSON.stringify(m.params.map(p => ({ name: p.name, optional: !!p.optional, json: !!p.json }))))}'>
                            <div class="row">
                                <span class="name">${m.name}(${m.params.map(p => p.name).join(', ')})</span>
                                <span class="http ${verbClass}">${escapeHtml(m.http)}</span>
                                ${inputs}
                                <button type="button" data-run="${id}">▶ Run${destructive ? ' (destructive)' : ''}</button>
                            </div>
                            <div class="desc">${m.desc}</div>
                            <div class="out" id="out-${id}" hidden></div>
                        </div>`;
                    }).join('')}
                </section>
            `).join('')}
        </main>
    </div>
    <div class="code-modal" id="codeModal" role="dialog" aria-modal="true" aria-labelledby="codeModalTitle">
        <div class="code-modal-box">
            <div class="code-modal-head">
                <h3 id="codeModalTitle">Source</h3>
                <span class="src-path" id="codeModalPath"></span>
                <span class="spacer"></span>
                <button type="button" id="codeModalCopy">Copy</button>
                <button type="button" id="codeModalClose" aria-label="Close">×</button>
            </div>
            <div class="code-modal-body"><pre id="codeModalPre">Loading…</pre></div>
        </div>
    </div>
    <script type="module">
        // Import each service as an ES module — no globals on window.
${SERVICES.map(s => `        import { ${s.global} } from '/debug/services/${s.key}.js';`).join('\n')}
        const SERVICES = {
${SERVICES.map(s => `            ${JSON.stringify(s.global)}: ${s.global},`).join('\n')}
        };

        function fmt(v) {
            if (typeof v === 'string') {
                if (v.length > 4000) return v.slice(0, 4000) + '\\n… (' + (v.length - 4000) + ' more chars)';
                return v;
            }
            try { return JSON.stringify(v, null, 2); } catch (_) { return String(v); }
        }

        async function run(method) {
            const svc = SERVICES[method.dataset.svc];
            const fn = svc && svc[method.dataset.method];
            const out = method.querySelector('.out');
            const btn = method.querySelector('button[data-run]');
            if (!svc) {
                out.hidden = false; out.classList.add('err');
                out.innerHTML = '<div class="meta"><span>' + method.dataset.svc + ' is not imported.</span><button type="button" class="close-out" aria-label="Close result" title="Close">×</button></div><pre></pre>';
                return;
            }
            if (typeof fn !== 'function') {
                out.hidden = false; out.classList.add('err');
                out.innerHTML = '<div class="meta"><span>No such method: ' + method.dataset.method + '</span><button type="button" class="close-out" aria-label="Close result" title="Close">×</button></div><pre></pre>';
                return;
            }
            const declared = JSON.parse(method.dataset.params || '[]');
            const inputs = method.querySelectorAll('[data-param]');
            const values = {};
            try {
                inputs.forEach(i => {
                    const raw = i.value;
                    if (raw === '' || raw == null) return;
                    if (i.dataset.json === '1') {
                        values[i.dataset.param] = JSON.parse(raw);
                    } else {
                        values[i.dataset.param] = raw;
                    }
                });
            } catch (e) {
                out.hidden = false; out.classList.add('err');
                out.innerHTML = '<div class="meta"><span>Invalid JSON in input.</span><button type="button" class="close-out" aria-label="Close result" title="Close">×</button></div><pre>' + (e.message || String(e)) + '</pre>';
                return;
            }

            let args;
            if (method.dataset.shape === 'filter') {
                args = [values];
            } else {
                args = declared.map(p => values[p.name]);
                while (args.length && args[args.length - 1] === undefined) args.pop();
                if (declared.some((p, i) => !p.optional && args[i] === undefined)) {
                    out.hidden = false; out.classList.add('err');
                    out.innerHTML = '<div class="meta"><span>Missing required parameter(s).</span><button type="button" class="close-out" aria-label="Close result" title="Close">×</button></div><pre></pre>';
                    return;
                }
            }

            if (method.dataset.destructive === '1') {
                if (!confirm('This will mutate live data via ' + method.dataset.svc + '.' + method.dataset.method + '(). Continue?')) {
                    return;
                }
            }

            btn.disabled = true; out.classList.remove('err'); out.hidden = false;
            out.innerHTML = '<div class="meta">Running…</div><pre></pre>';
            const t0 = performance.now();
            const buildMeta = (text, opts) => {
                const meta = document.createElement('div'); meta.className = 'meta';
                const span = document.createElement('span'); span.textContent = text;
                meta.appendChild(span);
                if (opts && opts.tabular) {
                    const toggle = document.createElement('button');
                    toggle.type = 'button'; toggle.className = 'toggle-view';
                    toggle.dataset.mode = 'json';
                    toggle.title = 'Toggle table / JSON';
                    toggle.textContent = '▦ Table';
                    meta.appendChild(toggle);
                }
                const close = document.createElement('button');
                close.type = 'button'; close.className = 'close-out';
                close.setAttribute('aria-label', 'Close result'); close.title = 'Close';
                close.textContent = '×';
                meta.appendChild(close);
                return meta;
            };
            const isTabular = (v) => {
                if (Array.isArray(v)) return v.length > 0;
                if (v && typeof v === 'object') return Object.keys(v).length > 0;
                return false;
            };
            const toTabular = (v) => {
                if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' && !Array.isArray(x)) ? x : { value: x });
                if (v && typeof v === 'object') return Object.entries(v).map(([key, value]) => ({ key, value }));
                return [];
            };
            try {
                const result = await fn.apply(svc, args);
                const dt = (performance.now() - t0).toFixed(0);
                const text = fmt(result);
                const size = typeof result === 'string' ? result.length + ' chars' : (Array.isArray(result) ? result.length + ' items' : (result && typeof result === 'object' ? Object.keys(result).length + ' keys' : typeof result));
                const tabular = isTabular(result);
                out.innerHTML = '';
                const pre = document.createElement('pre'); pre.textContent = text;
                out.appendChild(buildMeta('✓ ' + dt + 'ms · ' + size, { tabular }));
                out.appendChild(pre);
                if (tabular) {
                    const tbl = document.createElement('json-table');
                    tbl.hidden = true;
                    tbl.data = toTabular(result);
                    out.appendChild(tbl);
                }
            } catch (e) {
                const dt = (performance.now() - t0).toFixed(0);
                out.classList.add('err');
                out.innerHTML = '';
                const pre = document.createElement('pre'); pre.textContent = (e && e.message) || String(e);
                out.appendChild(buildMeta('✗ ' + dt + 'ms'));
                out.appendChild(pre);
            } finally {
                btn.disabled = false;
            }
        }

        const codeCache = new Map();
        const codeModal = document.getElementById('codeModal');
        const codeModalTitle = document.getElementById('codeModalTitle');
        const codeModalPath = document.getElementById('codeModalPath');
        const codeModalPre = document.getElementById('codeModalPre');
        function closeCodeModal() { codeModal.classList.remove('open'); }
        function openCodeModal(title, src) {
            codeModalTitle.textContent = title;
            codeModalPath.textContent = src;
            codeModal.classList.add('open');
            if (codeCache.has(src)) {
                codeModalPre.textContent = codeCache.get(src);
                return;
            }
            codeModalPre.textContent = 'Loading…';
            fetch(src)
                .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
                .then(text => { codeCache.set(src, text); if (codeModal.classList.contains('open')) codeModalPre.textContent = text; })
                .catch(err => { codeModalPre.textContent = 'Failed to load: ' + err.message; });
        }
        document.getElementById('codeModalClose').addEventListener('click', closeCodeModal);
        codeModal.addEventListener('click', (e) => { if (e.target === codeModal) closeCodeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && codeModal.classList.contains('open')) closeCodeModal(); });
        document.getElementById('codeModalCopy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(codeModalPre.textContent); } catch (_) {}
        });

        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('button.close-out');
            if (closeBtn) {
                const out = closeBtn.closest('.out');
                if (out) { out.hidden = true; out.classList.remove('err'); out.innerHTML = ''; }
                return;
            }
            const toggleBtn = e.target.closest('button.toggle-view');
            if (toggleBtn) {
                const out = toggleBtn.closest('.out');
                if (!out) return;
                const pre = out.querySelector('pre');
                const tbl = out.querySelector('json-table');
                if (!pre || !tbl) return;
                const showTable = toggleBtn.dataset.mode === 'json';
                pre.hidden = showTable;
                tbl.hidden = !showTable;
                toggleBtn.dataset.mode = showTable ? 'table' : 'json';
                toggleBtn.textContent = showTable ? '{ } JSON' : '▦ Table';
                return;
            }
            const btn = e.target.closest('button[data-run]');
            if (btn) {
                const method = btn.closest('.method');
                if (method) run(method);
                return;
            }
            const codeBtn = e.target.closest('button.view-code-btn');
            if (codeBtn) openCodeModal(codeBtn.dataset.title || 'Source', codeBtn.dataset.src);
        });

        document.getElementById('btnRunAll').addEventListener('click', async () => {
            const methods = document.querySelectorAll('.method');
            for (const m of methods) {
                if (m.dataset.destructive === '1') continue;
                const declared = JSON.parse(m.dataset.params || '[]');
                const required = declared.filter(p => !p.optional);
                if (required.length === 0) await run(m);
            }
        });
    </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    function renderDataShapesDebug(req, res, selectedSlug) {
        // Schemas live as standalone JSON files under schemas/.
        // schemas/index.json maps each disk path → its schema file.
        let index;
        try {
            index = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'index.json'), 'utf8'));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Could not read schemas/index.json: ' + (e.message || e));
            return;
        }
        // Build slug → entry map. Slug = the file basename without .schema.json.
        const entries = index.map(e => Object.assign({ slug: e.file.replace(/\.schema\.json$/, '') }, e));
        if (!selectedSlug) {
            res.writeHead(302, { Location: `/debug/data-shapes/${entries[0].slug}` });
            res.end();
            return;
        }
        if (selectedSlug === '_er') {
            return renderDataShapesER(req, res, entries);
        }
        const current = entries.find(e => e.slug === selectedSlug);
        if (!current) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Unknown data shape: ' + selectedSlug);
            return;
        }
        let schema;
        try {
            schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', current.file), 'utf8'));
        } catch (e) {
            schema = { error: 'Could not read ' + current.file + ': ' + (e.message || e) };
        }

        // Render a JSON Schema as a friendly HTML tree. Recurses through
        // properties / items / oneOf / additionalProperties / definitions.
        function typeBadge(s) {
            if (!s || typeof s !== 'object') return '';
            if (Array.isArray(s.type)) return s.type.join(' | ');
            if (s.type) return s.type;
            if (s.enum) return 'enum';
            if (s.oneOf) return 'oneOf';
            if (s.anyOf) return 'anyOf';
            if (s.$ref) return s.$ref.replace(/^#\/definitions\//, '$');
            return 'any';
        }
        function constraints(s) {
            const c = [];
            if (s.format)   c.push('format: ' + s.format);
            if (s.pattern)  c.push('pattern: ' + s.pattern);
            if (s.minimum != null) c.push('≥ ' + s.minimum);
            if (s.maximum != null) c.push('≤ ' + s.maximum);
            if (s.minItems != null || s.maxItems != null) {
                c.push('items: ' + (s.minItems != null ? s.minItems : '*') + '..' + (s.maxItems != null ? s.maxItems : '*'));
            }
            if (s.default !== undefined) c.push('default: ' + JSON.stringify(s.default));
            if (s.enum) c.push('one of: ' + s.enum.map(v => JSON.stringify(v)).join(', '));
            if (s.contentMediaType) c.push('media: ' + s.contentMediaType);
            return c;
        }
        function renderSchema(s, opts) {
            opts = opts || {};
            if (!s || typeof s !== 'object') return '';
            const required = new Set(Array.isArray(s.required) ? s.required : []);
            const out = [];

            const desc = s.description ? `<div class="sd-desc">${escapeHtml(s.description)}</div>` : '';
            const cons = constraints(s);
            const consHtml = cons.length ? `<div class="sd-cons">${cons.map(c => `<span class="sd-con">${escapeHtml(c)}</span>`).join('')}</div>` : '';

            if (s.$ref) {
                out.push(`<div class="sd-ref">→ ${escapeHtml(s.$ref)}</div>`);
            }

            if (s.type === 'object' || s.properties || s.additionalProperties) {
                if (desc) out.push(desc);
                if (consHtml) out.push(consHtml);
                if (s.properties) {
                    out.push('<ul class="sd-props">');
                    for (const [k, v] of Object.entries(s.properties)) {
                        const isReq = required.has(k);
                        out.push(`<li class="sd-prop">
                            <div class="sd-row">
                                <span class="sd-key">${escapeHtml(k)}</span>
                                <span class="sd-type">${escapeHtml(typeBadge(v))}</span>
                                ${isReq ? '<span class="sd-req">required</span>' : ''}
                            </div>
                            ${renderSchema(v, { nested: true })}
                        </li>`);
                    }
                    out.push('</ul>');
                }
                if (s.additionalProperties && typeof s.additionalProperties === 'object') {
                    out.push(`<div class="sd-addl"><span class="sd-key">&lt;any key&gt;</span> <span class="sd-type">${escapeHtml(typeBadge(s.additionalProperties))}</span>${renderSchema(s.additionalProperties, { nested: true })}</div>`);
                }
            } else if (s.type === 'array' || s.items) {
                if (desc) out.push(desc);
                if (consHtml) out.push(consHtml);
                if (s.items) {
                    out.push(`<div class="sd-items"><span class="sd-key">items</span> <span class="sd-type">${escapeHtml(typeBadge(s.items))}</span>${renderSchema(s.items, { nested: true })}</div>`);
                }
            } else if (s.oneOf || s.anyOf) {
                if (desc) out.push(desc);
                if (consHtml) out.push(consHtml);
                const which = s.oneOf ? 'oneOf' : 'anyOf';
                out.push(`<div class="sd-oneof"><span class="sd-key">${which}</span><ol>`);
                for (const v of (s.oneOf || s.anyOf)) {
                    out.push(`<li><span class="sd-type">${escapeHtml(typeBadge(v))}</span>${renderSchema(v, { nested: true })}</li>`);
                }
                out.push('</ol></div>');
            } else {
                if (desc) out.push(desc);
                if (consHtml) out.push(consHtml);
            }

            // Definitions (only at the top level, but render if present)
            if (s.definitions && !opts.nested) {
                out.push('<div class="sd-defs"><h4>Definitions</h4>');
                for (const [k, v] of Object.entries(s.definitions)) {
                    out.push(`<div class="sd-def"><div class="sd-row"><span class="sd-key">$${escapeHtml(k)}</span> <span class="sd-type">${escapeHtml(typeBadge(v))}</span></div>${renderSchema(v, { nested: true })}</div>`);
                }
                out.push('</div>');
            }

            return out.join('');
        }

        const html = `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <title>Debug · data shapes</title>
    <link rel="stylesheet" href="/themes/paper.css">
    <script type="module" src="/components/json-table.js"></script>
    <style>
        body { font-family: var(--font-family, -apple-system, sans-serif); font-size: var(--font-size, 16px); margin: 0; line-height: 1.55; color: var(--text-strong); background: var(--bg); }
        .dbg-page { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
        .dbg-side { background: var(--surface-head); border-right: 1px solid var(--border-faint); padding: 16px 14px; position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; }
        .dbg-side h2 { font-family: Georgia, serif; color: var(--accent); margin: 0 0 10px; font-size: 1.05em; }
        .dbg-nav { display: flex; flex-direction: column; gap: 2px; }
        .dbg-nav a { display: block; padding: 6px 10px; border-radius: 4px; color: var(--text); text-decoration: none; font-family: ui-monospace, monospace; font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dbg-nav a:hover { background: var(--surface-alt); }
        .dbg-nav a.active { background: var(--accent); color: var(--text-on-accent, white); }
        .dbg-head h1 { font-family: Georgia, serif; color: var(--accent); font-size: 1.4em; margin: 0 0 4px; }
        .dbg-head .desc { color: var(--text-muted); font-size: 0.9em; margin-bottom: 14px; }

        .shape { background: var(--surface); border: 1px solid var(--border-faint); border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
        .shape h2 { margin: 0 0 4px; font-family: ui-monospace, monospace; color: var(--accent); font-size: 1em; word-break: break-all; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .shape h2 .raw-link { font-size: 0.78em; font-weight: normal; color: var(--text-subtle); text-decoration: none; border: 1px solid var(--border-faint); border-radius: 4px; padding: 2px 8px; }
        .shape h2 .raw-link:hover { color: var(--accent); border-color: var(--accent); }
        .shape .scope { display: inline-block; font-size: 0.74em; color: var(--text-muted); background: var(--surface-alt); padding: 2px 8px; border-radius: 10px; margin-bottom: 6px; }
        .shape .desc { color: var(--text-muted); font-size: 0.9em; margin: 4px 0 10px; }

        .shape-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border-faint); margin-bottom: 10px; }
        .shape-tab { background: transparent; border: 1px solid transparent; border-bottom: none; color: var(--text-muted); cursor: pointer; padding: 6px 14px; border-radius: 6px 6px 0 0; font: inherit; margin-bottom: -1px; }
        .shape-tab.active { background: var(--surface); border-color: var(--border-faint); color: var(--accent); font-weight: 600; }

        .shape-pane[hidden] { display: none; }
        .shape pre { margin: 0; padding: 12px 14px; background: var(--surface-head, #f6f6f6); border: 1px solid var(--border-faint); border-radius: 6px; font-family: ui-monospace, monospace; font-size: 0.82em; line-height: 1.45; white-space: pre-wrap; word-break: break-word; max-height: 540px; overflow: auto; }
        .shape-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .shape-save, .shape-save-table { background: var(--accent); color: var(--text-on-accent, white); border: 1px solid var(--accent); padding: 6px 14px; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.9em; }
        .shape-save:hover, .shape-save-table:hover { filter: brightness(1.08); }
        .shape-status { font-size: 0.85em; color: var(--text-muted); }
        .shape-status.ok { color: #2a8a3e; }
        .shape-status.err { color: #c0392b; }
        .shape-json[contenteditable="true"] { outline: none; cursor: text; }
        .shape-json[contenteditable="true"]:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(74,144,226,0.18); }

        /* Schema tree */
        .sd-props, .sd-oneof ol { list-style: none; padding-left: 18px; margin: 4px 0; border-left: 1px dashed var(--border-faint); }
        .sd-prop, .sd-def, .sd-items, .sd-addl, .sd-oneof > ol > li { padding: 4px 0 4px 8px; }
        .sd-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .sd-key { font-family: ui-monospace, monospace; font-weight: 600; color: var(--text-strong); }
        .sd-type { font-family: ui-monospace, monospace; font-size: 0.78em; color: #1d4ed8; background: #e6f0ff; padding: 1px 6px; border-radius: 4px; }
        .sd-req { font-size: 0.7em; font-weight: 700; color: #b91c1c; background: #fee2e2; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .sd-desc { color: var(--text-muted); font-size: 0.86em; margin: 2px 0 4px 0; }
        .sd-cons { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 4px 0; }
        .sd-con { font-family: ui-monospace, monospace; font-size: 0.74em; color: var(--text-subtle); background: var(--surface-alt); padding: 1px 6px; border-radius: 4px; }
        .sd-ref { font-family: ui-monospace, monospace; font-size: 0.82em; color: var(--accent); }
        .sd-defs { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-faint); }
        .sd-defs h4 { margin: 0 0 6px; font-family: Georgia, serif; color: var(--accent); font-size: 0.95em; }
    </style>
</head>
<body>
<div class="dbg-page">
    <aside class="dbg-side">
        <h2>Data shapes</h2>
        <nav class="dbg-nav">
            <a href="/debug/data-shapes/_er" class="${'_er' === current.slug ? 'active' : ''}">🗺 ER-diagram</a>
            ${entries.map(e => `<a href="/debug/data-shapes/${escapeHtml(e.slug)}" class="${e.slug === current.slug ? 'active' : ''}" title="${escapeHtml(e.path)}">${escapeHtml(e.slug)}</a>`).join('')}
        </nav>
        <h2 style="margin-top:18px">Other</h2>
        <nav class="dbg-nav">
            <a href="/debug">← components</a>
            <a href="/debug/services">services</a>
        </nav>
    </aside>
    <main class="dbg-main">
        <div class="dbg-head">
            <h1>Disk data shapes</h1>
            <p class="desc">Hand-written JSON Schema (draft-07) for every JSON file persisted under <code>data/</code>. Schemas live as standalone files in <code>schemas/</code> &mdash; edit them there.</p>
        </div>
        <section class="shape" id="${escapeHtml(current.path)}">
            <h2>${escapeHtml(current.path)} <a class="raw-link" href="/debug/schemas/${escapeHtml(current.file)}">schemas/${escapeHtml(current.file)}</a></h2>
            <span class="scope">${escapeHtml(current.scope)}</span>
            <p class="desc">${escapeHtml(current.desc)}</p>
            <div class="shape-tabs">
                <button type="button" class="shape-tab active" data-pane="tree">Felter</button>
                <button type="button" class="shape-tab" data-pane="table">Tabell</button>
                <button type="button" class="shape-tab" data-pane="raw">Rå JSON Schema</button>
            </div>
            <div class="shape-pane" data-pane="tree">${renderSchema(schema)}</div>
            <div class="shape-pane" data-pane="table" hidden>
                <div class="shape-toolbar">
                    <button type="button" class="shape-save-table" data-file="${escapeHtml(current.file)}">💾 Lagre</button>
                    <span class="shape-status" data-for="table-${escapeHtml(current.file)}"></span>
                </div>
                <div id="shape-table-host"></div>
            </div>
            <div class="shape-pane" data-pane="raw" hidden>
                <div class="shape-toolbar">
                    <button type="button" class="shape-save" data-file="${escapeHtml(current.file)}">💾 Lagre</button>
                    <span class="shape-status" data-for="${escapeHtml(current.file)}"></span>
                </div>
                <pre class="shape-json" contenteditable="true" spellcheck="false">${escapeHtml(JSON.stringify(schema, null, 2))}</pre>
            </div>
        </section>
    </main>
</div>
<script>
    document.querySelectorAll('.shape-tabs').forEach(function(group){
        group.addEventListener('click', function(ev){
            var btn = ev.target.closest('.shape-tab');
            if (!btn) return;
            var pane = btn.dataset.pane;
            group.querySelectorAll('.shape-tab').forEach(function(b){ b.classList.toggle('active', b === btn); });
            document.querySelectorAll('.shape-pane').forEach(function(p){
                p.hidden = p.dataset.pane !== pane;
            });
        });
    });
    document.querySelectorAll('.shape-save').forEach(function(btn){
        btn.addEventListener('click', async function(){
            var file = btn.dataset.file;
            var pre = btn.closest('.shape-pane').querySelector('.shape-json');
            var status = document.querySelector('.shape-status[data-for="' + file + '"]');
            var text = pre.innerText;
            try { JSON.parse(text); } catch (e) {
                status.textContent = '❌ Ugyldig JSON: ' + e.message;
                status.className = 'shape-status err';
                return;
            }
            status.textContent = '⏳ Lagrer…';
            status.className = 'shape-status';
            try {
                var r = await fetch('/debug/schemas/' + file, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: text
                });
                var data = await r.json();
                if (r.ok && data.ok) {
                    status.textContent = '✓ Lagret';
                    status.className = 'shape-status ok';
                } else {
                    status.textContent = '❌ ' + (data.error || ('HTTP ' + r.status));
                    status.className = 'shape-status err';
                }
            } catch (e) {
                status.textContent = '❌ ' + e.message;
                status.className = 'shape-status err';
            }
        });
    });

    // ---- Tabell tab: feed the raw schema directly into <json-table>.
    // Top-level scalar edits mutate SCHEMA in place; nested objects/arrays
    // render as nested tables (read-only).
    (function(){
        var SCHEMA = ${JSON.stringify(schema).replace(/</g, '\\u003c')};
        var FILE = ${JSON.stringify(current.file)};
        var host = document.getElementById('shape-table-host');
        if (!host) return;

        var table = document.createElement('json-table');
        table.setAttribute('editable', '');
        table.setAttribute('max-height', '540px');
        host.appendChild(table);
        customElements.whenDefined('json-table').then(function(){
            table.data = SCHEMA;
        });

        var statusKey = 'table-' + FILE;
        var status = document.querySelector('.shape-status[data-for="' + statusKey + '"]');
        var saveBtn = document.querySelector('.shape-save-table[data-file="' + FILE + '"]');

        if (saveBtn) {
            saveBtn.addEventListener('click', async function(){
                status.textContent = '⏳ Lagrer…';
                status.className = 'shape-status';
                try {
                    var r = await fetch('/debug/schemas/' + FILE, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(SCHEMA, null, 2),
                    });
                    var data = await r.json();
                    if (r.ok && data.ok) {
                        status.textContent = '✓ Lagret';
                        status.className = 'shape-status ok';
                    } else {
                        status.textContent = '❌ ' + (data.error || ('HTTP ' + r.status));
                        status.className = 'shape-status err';
                    }
                } catch (e) {
                    status.textContent = '❌ ' + e.message;
                    status.className = 'shape-status err';
                }
            });
        }
    })();
</script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    function renderDataShapesER(req, res, entries) {
        let diagram;
        try {
            diagram = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'diagram.json'), 'utf8'));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Could not read schemas/diagram.json: ' + (e.message || e));
            return;
        }
        const vb = diagram.viewBox || [0, 0, 1200, 800];
        const ents = diagram.entities || [];
        const edges = diagram.edges || [];
        const byKey = {};
        ents.forEach(e => { byKey[e.slug] = e; });

        // For each edge, pick the closest pair of box edges as endpoints.
        function endpoints(a, b) {
            const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
            const bx = b.x + b.w / 2, by = b.y + b.h / 2;
            // Pick a side based on dominant direction.
            const dx = bx - ax, dy = by - ay;
            let p1, p2;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) { p1 = { x: a.x + a.w, y: ay }; p2 = { x: b.x,        y: by }; }
                else        { p1 = { x: a.x,       y: ay }; p2 = { x: b.x + b.w, y: by }; }
            } else {
                if (dy > 0) { p1 = { x: ax, y: a.y + a.h }; p2 = { x: bx, y: b.y        }; }
                else        { p1 = { x: ax, y: a.y       }; p2 = { x: bx, y: b.y + b.h  }; }
            }
            return { p1, p2 };
        }

        // SVG row height for entity field rows.
        const HEAD_H = 26;
        const ROW_H = 18;

        function entitySvg(e) {
            const slug = e.slug;
            const labelY = e.y + 18;
            const fields = (e.fields || []).slice(0, Math.max(0, Math.floor((e.h - HEAD_H - 6) / ROW_H)));
            const rows = fields.map((f, i) => {
                const isPk = (e.pk && (f === e.pk || (e.pk === 'key' && f === 'key') || (e.pk === 'id' && f === 'id')));
                const cls = isPk ? 'er-field er-pk' : 'er-field';
                return `<text class="${cls}" x="${e.x + 10}" y="${e.y + HEAD_H + i * ROW_H + 13}">${escapeHtml(f)}${isPk ? ' 🔑' : ''}</text>`;
            }).join('');
            const linkSlug = entries.find(en => en.slug === slug || en.slug === slug + 's' || (en.path || '').endsWith(slug + '.json'));
            const href = linkSlug ? `/debug/data-shapes/${linkSlug.slug}` : null;
            const open = href ? `<a href="${escapeHtml(href)}">` : '';
            const close = href ? '</a>' : '';
            return `<g class="er-entity">
                ${open}
                <rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="6" ry="6" class="er-box"></rect>
                <line x1="${e.x}" y1="${e.y + HEAD_H}" x2="${e.x + e.w}" y2="${e.y + HEAD_H}" class="er-divider"/>
                <text class="er-label" x="${e.x + 10}" y="${labelY}">${escapeHtml(e.label || slug)}</text>
                ${rows}
                ${close}
            </g>`;
        }

        const edgeSvg = edges.map((ed, i) => {
            const a = byKey[ed.from], b = byKey[ed.to];
            if (!a || !b) return '';
            const { p1, p2 } = endpoints(a, b);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            return `<g class="er-edge">
                <path d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}" class="er-line" marker-end="url(#er-arrow)"/>
                <text class="er-edge-label" x="${mx}" y="${my - 4}" text-anchor="middle">${escapeHtml(ed.label || '')}</text>
            </g>`;
        }).join('');

        const sidebar = `<aside class="dbg-side">
            <h2>Data shapes</h2>
            <nav class="dbg-nav">
                <a href="/debug/data-shapes/_er" class="active">🗺 ER-diagram</a>
                ${entries.map(e => `<a href="/debug/data-shapes/${escapeHtml(e.slug)}" title="${escapeHtml(e.path)}">${escapeHtml(e.slug)}</a>`).join('')}
            </nav>
            <h2 style="margin-top:18px">Other</h2>
            <nav class="dbg-nav">
                <a href="/debug">← components</a>
                <a href="/debug/services">services</a>
            </nav>
        </aside>`;

        const html = `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <title>Debug · ER diagram</title>
    <link rel="stylesheet" href="/themes/paper.css">
    <style>
        body { font-family: var(--font-family, -apple-system, sans-serif); font-size: var(--font-size, 16px); margin: 0; line-height: 1.55; color: var(--text-strong); background: var(--bg); }
        .dbg-page { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
        .dbg-side { background: var(--surface-head); border-right: 1px solid var(--border-faint); padding: 16px 14px; position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; }
        .dbg-side h2 { font-family: Georgia, serif; color: var(--accent); margin: 0 0 10px; font-size: 1.05em; }
        .dbg-nav { display: flex; flex-direction: column; gap: 2px; }
        .dbg-nav a { display: block; padding: 6px 10px; border-radius: 4px; color: var(--text); text-decoration: none; font-family: ui-monospace, monospace; font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dbg-nav a:hover { background: var(--surface-alt); }
        .dbg-nav a.active { background: var(--accent); color: var(--text-on-accent, white); }
        .dbg-main { padding: 20px 26px; }
        .dbg-head h1 { font-family: Georgia, serif; color: var(--accent); font-size: 1.4em; margin: 0 0 4px; }
        .dbg-head .desc { color: var(--text-muted); font-size: 0.9em; margin-bottom: 14px; }
        .er-wrap { background: var(--surface); border: 1px solid var(--border-faint); border-radius: 8px; padding: 8px; overflow: auto; }
        svg.er { display: block; min-width: 100%; height: auto; background: var(--surface-alt, #fafafa); border-radius: 6px; }
        .er-box { fill: var(--surface, white); stroke: var(--accent, #4a90e2); stroke-width: 1.4; }
        .er-divider { stroke: var(--border-faint, #ddd); stroke-width: 1; }
        .er-label { font-family: Georgia, serif; font-size: 14px; font-weight: 700; fill: var(--accent); }
        .er-field { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; fill: var(--text-strong); }
        .er-pk { font-weight: 700; }
        .er-line { fill: none; stroke: var(--text-muted, #888); stroke-width: 1.2; }
        .er-edge:hover .er-line { stroke: var(--accent); stroke-width: 2; }
        .er-edge-label { font-family: ui-monospace, monospace; font-size: 10px; fill: var(--text-muted); paint-order: stroke; stroke: var(--surface-alt, #fafafa); stroke-width: 3; }
        .er-edge:hover .er-edge-label { fill: var(--accent); }
        .er-entity a { cursor: pointer; }
        .er-entity:hover .er-box { stroke-width: 2.4; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12)); }
        .legend { margin-top: 10px; color: var(--text-muted); font-size: 0.84em; }
    </style>
</head>
<body>
<div class="dbg-page">
    ${sidebar}
    <main class="dbg-main">
        <div class="dbg-head">
            <h1>ER-diagram · disk data</h1>
            <p class="desc">Entiteter og relasjoner mellom JSON-filene under <code>data/</code>. Layout og kanter ligger i <code>schemas/diagram.json</code>. Klikk på en boks for å åpne det aktuelle skjemaet.</p>
        </div>
        <div class="er-wrap">
            <svg class="er" viewBox="${vb.join(' ')}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <marker id="er-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #888)"/>
                    </marker>
                </defs>
                ${edgeSvg}
                ${ents.map(entitySvg).join('')}
            </svg>
        </div>
        <p class="legend">🔑 = primær-/lookup-nøkkel · piler peker fra refererende felt mot målentitetens nøkkel.</p>
    </main>
</div>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    // Raw schema files: /debug/schemas/<file>.schema.json (GET + PUT)
    if (pathname.startsWith('/debug/schemas/') && pathname.endsWith('.schema.json')) {
        const slug = pathname.slice('/debug/schemas/'.length);
        if (slug.includes('/') || slug.includes('..')) { res.writeHead(400); res.end('Bad'); return; }
        const filePath = path.join(__dirname, 'schemas', slug);
        if (req.method === 'PUT') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body || '{}');
                    const pretty = JSON.stringify(parsed, null, 2) + '\n';
                    fs.writeFileSync(filePath, pretty);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
                }
            });
            return;
        }
        try {
            const data = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': 'application/schema+json; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        }
        return;
    }

    if (pathname === '/debug/tests/scenarios.js') {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'tests', 'scenarios.js'));
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) {
            res.writeHead(404); res.end('Not found');
        }
        return;
    }
    if (pathname === '/debug/tests/last-run.json') {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'tests', '.last-run.json'));
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'no last run found' }));
        }
        return;
    }

    function renderTestsDebug(req, res) {
        const html = `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <title>Debug · tests</title>
    <link rel="stylesheet" href="/themes/paper.css">
    <link rel="stylesheet" href="/style.css">
    <style>
        .dbg-shell { display: grid; grid-template-columns: 240px 1fr; gap: 18px; padding: 18px; max-width: 1400px; margin: 0 auto; }
        .dbg-side { border-right: 1px solid var(--border-faint); padding-right: 14px; }
        .dbg-side h2 { font-family: Georgia, serif; color: var(--accent); font-size: 1em; margin: 8px 0 6px; }
        .dbg-group-label { font-size: 0.78em; color: var(--text-muted); margin: 12px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .dbg-nav { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
        .dbg-nav a { color: var(--text); text-decoration: none; padding: 3px 6px; border-radius: 4px; font-size: 0.92em; }
        .dbg-nav a:hover { background: var(--surface-alt); color: var(--accent); }
        .dbg-nav a.active { background: var(--accent); color: var(--text-on-accent); }
        .dbg-main { min-width: 0; }
        h1 { font-family: Georgia, serif; color: var(--accent); margin: 0 0 4px; }
        .lede { color: var(--text-muted); margin: 0 0 16px; }
        .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
        .toolbar button { font: inherit; padding: 6px 14px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); border-radius: 6px; cursor: pointer; }
        .toolbar button.primary { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
        .toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
        .summary { font-size: 0.92em; color: var(--text-muted); margin-left: auto; }
        .summary .pass { color: #1a7f37; font-weight: 600; }
        .summary .fail { color: #c0392b; font-weight: 600; }
        .summary .pending { color: var(--text-muted); }
        .scenarios { display: flex; flex-direction: column; gap: 14px; }
        .sc-group { display: flex; flex-direction: column; gap: 4px; }
        .sc-group-head { display: flex; align-items: baseline; gap: 8px; padding: 4px 2px; border-bottom: 1px solid var(--border-faint); margin-bottom: 4px; }
        .sc-group-name { font-family: ui-monospace, monospace; font-size: 0.92em; color: var(--accent); font-weight: 600; }
        .sc-group-count { font-size: 0.78em; color: var(--text-muted); }
        .sc-group-link { margin-left: auto; font-size: 0.78em; color: var(--text-muted); text-decoration: none; }
        .sc-group-link:hover { color: var(--accent); text-decoration: underline; }
        .sc { display: grid; grid-template-columns: 80px 1fr 80px 160px; gap: 10px; align-items: start; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border-faint); border-radius: 6px; }
        .sc.idle .sc-status { color: var(--text-muted); }
        .sc.running .sc-status { color: #b8860b; }
        .sc.pass { border-left: 3px solid #1a7f37; }
        .sc.pass .sc-status { color: #1a7f37; font-weight: 600; }
        .sc.fail { border-left: 3px solid #c0392b; }
        .sc.fail .sc-status { color: #c0392b; font-weight: 600; }
        .sc-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .sc-meta .sc-name { font-weight: 500; color: var(--text-strong); }
        .sc-meta .sc-id { font-family: ui-monospace, monospace; font-size: 0.8em; color: var(--text-muted); }
        .sc-meta .sc-url { font-family: ui-monospace, monospace; font-size: 0.78em; color: var(--text-muted); }
        .sc-meta .sc-error { font-family: ui-monospace, monospace; font-size: 0.8em; color: #c0392b; background: #fef0ed; padding: 6px 8px; border-radius: 4px; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
        .sc-time { font-family: ui-monospace, monospace; font-size: 0.85em; color: var(--text-muted); text-align: right; }
        .sc-action { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
        .sc-action button { font: inherit; font-size: 0.85em; padding: 4px 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); border-radius: 4px; cursor: pointer; }
        .sc-action button:hover { background: var(--surface-alt); }
        .sc-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none; align-items: center; justify-content: center; z-index: 1000; }
        .sc-modal-backdrop.open { display: flex; }
        .sc-modal { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; width: min(960px, 94vw); max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
        .sc-modal-head { padding: 12px 16px; border-bottom: 1px solid var(--border-faint); display: flex; align-items: baseline; gap: 10px; }
        .sc-modal-head h3 { margin: 0; font-family: Georgia, serif; color: var(--accent); font-size: 1.1em; }
        .sc-modal-head .sc-modal-id { font-family: ui-monospace, monospace; font-size: 0.85em; color: var(--text-muted); }
        .sc-modal-head .sc-modal-close { margin-left: auto; font: inherit; font-size: 1.2em; padding: 0 8px; background: transparent; border: 0; cursor: pointer; color: var(--text-muted); }
        .sc-modal-body { padding: 12px 16px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
        .sc-modal-body label { font-size: 0.82em; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; }
        .sc-modal-body input, .sc-modal-body textarea { font: inherit; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-alt); color: var(--text); }
        .sc-modal-body textarea { font-family: ui-monospace, monospace; font-size: 0.86em; min-height: 320px; resize: vertical; tab-size: 4; }
        .sc-modal-foot { padding: 10px 16px; border-top: 1px solid var(--border-faint); display: flex; gap: 8px; align-items: center; }
        .sc-modal-foot .spacer { flex: 1; }
        .sc-modal-foot button { font: inherit; padding: 6px 14px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); border-radius: 6px; cursor: pointer; }
        .sc-modal-foot button.primary { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
        .sc-modal-foot .sc-modal-msg { font-size: 0.85em; color: var(--text-muted); }
        .sc-modal-foot .sc-modal-msg.err { color: #c0392b; }
        .sc-modal-foot .sc-modal-msg.ok { color: #1a7f37; }
        .sc-modal-note { font-size: 0.78em; color: var(--text-muted); font-style: italic; }
        #runner-iframe { position: fixed; left: -9999px; top: 0; width: 1200px; height: 800px; border: 0; }
        .pw-card { margin-top: 24px; background: var(--surface); border: 1px solid var(--border-faint); border-radius: 6px; padding: 12px 14px; }
        .pw-card h3 { margin: 0 0 6px; color: var(--accent); font-family: Georgia, serif; font-size: 1.05em; }
        .pw-meta { font-size: 0.88em; color: var(--text-muted); margin-bottom: 8px; }
        .pw-list { display: flex; flex-direction: column; gap: 4px; font-family: ui-monospace, monospace; font-size: 0.84em; }
        .pw-pass { color: #1a7f37; }
        .pw-fail { color: #c0392b; }
        .pw-skip { color: var(--text-muted); }
        .pw-note { color: var(--text-muted); font-style: italic; }
    </style>
    <script defer src="/debug/_mock-services.js"></script>
    <script defer src="/debug/tests/scenarios.js"></script>
</head>
<body>
    <div class="dbg-shell">
        <aside class="dbg-side">
            <h2>Other</h2>
            <nav class="dbg-nav">
                <a href="/debug/services">services</a>
                <a href="/debug/data-shapes">data shapes</a>
                <a href="/debug/tests" class="active">tests</a>
            </nav>
            <p style="font-size:0.82em;color:var(--text-muted);margin-top:14px">
                Scenarios are defined in
                <code style="font-family:ui-monospace,monospace">tests/scenarios.js</code>
                and run both here (in iframes) and via Playwright.
            </p>
        </aside>
        <main class="dbg-main">
            <h1>UI test scenarios</h1>
            <p class="lede">Component-level scenarios that drive the <code>/debug/&lt;component&gt;</code> playground pages with mock services. Click <strong>Run all</strong> to execute every scenario in a hidden iframe; the same scenarios run via <code>npm test</code> under Playwright.</p>

            <div class="toolbar">
                <button id="run-all" class="primary" type="button">▶ Run all</button>
                <button id="run-failed" type="button" disabled>Run failed only</button>
                <span class="summary" id="summary"></span>
            </div>

            <div class="scenarios" id="scenarios"></div>

            <div class="pw-card" id="pw-card">
                <h3>Last Playwright run</h3>
                <div class="pw-meta" id="pw-meta">Loading…</div>
                <div class="pw-list" id="pw-list"></div>
            </div>
        </main>
    </div>

    <iframe id="runner-iframe" src="about:blank" sandbox="allow-scripts allow-same-origin"></iframe>

    <div class="sc-modal-backdrop" id="sc-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sc-modal-title">
        <div class="sc-modal">
            <div class="sc-modal-head">
                <h3 id="sc-modal-title">Scenario details</h3>
                <span class="sc-modal-id" id="sc-modal-id"></span>
                <button type="button" class="sc-modal-close" id="sc-modal-close" title="Lukk (Esc)">✕</button>
            </div>
            <div class="sc-modal-body">
                <label>Name <input type="text" id="sc-modal-name" readonly></label>
                <label>URL <input type="text" id="sc-modal-url" readonly></label>
                <label>run(ctx) — edit and Apply to swap in-memory; reload page to revert
                    <textarea id="sc-modal-src" spellcheck="false"></textarea>
                </label>
                <p class="sc-modal-note">Edits live only in this browser tab. To persist, copy the source back into <code>tests/scenarios.js</code>.</p>
            </div>
            <div class="sc-modal-foot">
                <button type="button" id="sc-modal-apply">Apply</button>
                <button type="button" id="sc-modal-run" class="primary">Apply &amp; Run</button>
                <span class="sc-modal-msg" id="sc-modal-msg"></span>
                <span class="spacer"></span>
                <button type="button" id="sc-modal-cancel">Close</button>
            </div>
        </div>
    </div>

    <script>
    (function () {
        function $(id) { return document.getElementById(id); }
        function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
        function fmtMs(ms) { return ms == null ? '' : (ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(2) + ' s'); }

        function ready(fn) {
            if (window.WN_TEST_SCENARIOS) return fn();
            var poll = setInterval(function () {
                if (window.WN_TEST_SCENARIOS) { clearInterval(poll); fn(); }
            }, 30);
        }

        var iframe = $('runner-iframe');
        var resultsByID = Object.create(null);

        function groupOf(s) {
            // Derive group name from the scenario URL: "/debug/<slug>" → "<slug>".
            var m = /^\\/debug\\/([^/?#]+)/.exec(s.url || '');
            return m ? m[1] : 'other';
        }

        function renderScenarios() {
            var host = $('scenarios');
            host.textContent = '';
            // Group scenarios by URL slug, preserving first-seen order.
            var order = [];
            var byGroup = Object.create(null);
            window.WN_TEST_SCENARIOS.forEach(function (s) {
                var g = groupOf(s);
                if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
                byGroup[g].push(s);
            });

            order.forEach(function (g) {
                var groupEl = el('div', 'sc-group');
                groupEl.dataset.group = g;
                var head = el('div', 'sc-group-head');
                head.appendChild(el('span', 'sc-group-name', g));
                head.appendChild(el('span', 'sc-group-count', byGroup[g].length + (byGroup[g].length === 1 ? ' scenario' : ' scenarios')));
                var link = el('a', 'sc-group-link', '/debug/' + g + ' ↗');
                link.href = '/debug/' + g;
                link.target = '_blank';
                link.rel = 'noopener';
                head.appendChild(link);
                groupEl.appendChild(head);

                byGroup[g].forEach(function (s) {
                    var prev = resultsByID[s.id] || { status: 'idle' };
                    var row = el('div', 'sc ' + prev.status);
                    row.dataset.id = s.id;

                    var status = el('div', 'sc-status', prev.status === 'idle' ? '— idle' : prev.status);
                    row.appendChild(status);

                    var meta = el('div', 'sc-meta');
                    meta.appendChild(el('div', 'sc-name', s.name));
                    meta.appendChild(el('div', 'sc-id', s.id));
                    meta.appendChild(el('div', 'sc-url', s.url));
                    if (prev.error) {
                        meta.appendChild(el('div', 'sc-error', prev.error));
                    }
                    row.appendChild(meta);

                    row.appendChild(el('div', 'sc-time', fmtMs(prev.ms)));

                    var actCell = el('div', 'sc-action');
                    var btn = el('button', null, 'Run');
                    btn.type = 'button';
                    btn.addEventListener('click', function () { runOne(s); });
                    actCell.appendChild(btn);

                    var dbtn = el('button', null, 'Details');
                    dbtn.type = 'button';
                    dbtn.addEventListener('click', function () { openDetails(s); });
                    actCell.appendChild(dbtn);

                    row.appendChild(actCell);

                    groupEl.appendChild(row);
                });

                host.appendChild(groupEl);
            });
            updateSummary();
        }

        function updateSummary() {
            var total = window.WN_TEST_SCENARIOS.length;
            var passed = 0, failed = 0, pending = 0;
            window.WN_TEST_SCENARIOS.forEach(function (s) {
                var r = resultsByID[s.id];
                if (!r || r.status === 'idle') pending++;
                else if (r.status === 'pass') passed++;
                else if (r.status === 'fail') failed++;
            });
            var sm = $('summary');
            sm.innerHTML = '';
            sm.appendChild(el('span', 'pass', passed + ' passed'));
            sm.appendChild(document.createTextNode(' · '));
            sm.appendChild(el('span', 'fail', failed + ' failed'));
            sm.appendChild(document.createTextNode(' · '));
            sm.appendChild(el('span', 'pending', pending + ' pending'));
            sm.appendChild(document.createTextNode(' / ' + total));
            $('run-failed').disabled = failed === 0;
        }

        function setRowStatus(id, status, extra) {
            var r = document.querySelector('.sc[data-id="' + id + '"]');
            if (!r) return;
            r.classList.remove('idle','running','pass','fail');
            r.classList.add(status);
            r.querySelector('.sc-status').textContent = status === 'idle' ? '— idle' : status;
            r.querySelector('.sc-time').textContent = fmtMs(extra && extra.ms);
            var meta = r.querySelector('.sc-meta');
            var oldErr = meta.querySelector('.sc-error');
            if (oldErr) oldErr.remove();
            if (extra && extra.error) {
                meta.appendChild(el('div', 'sc-error', extra.error));
            }
        }

        function loadIframe(url) {
            return new Promise(function (resolve) {
                function done() {
                    iframe.removeEventListener('load', done);
                    resolve(iframe);
                }
                iframe.addEventListener('load', done);
                iframe.src = url;
            });
        }

        function waitForMocks(win, timeout) {
            timeout = timeout || 5000;
            return new Promise(function (resolve, reject) {
                var start = Date.now();
                (function tick() {
                    if (win.MockServices) return resolve();
                    if (Date.now() - start > timeout) return reject(new Error('MockServices not loaded in iframe'));
                    setTimeout(tick, 30);
                })();
            });
        }

        async function runOne(s) {
            setRowStatus(s.id, 'running');
            var t0 = performance.now();
            try {
                await loadIframe(s.url);
                await waitForMocks(iframe.contentWindow);
                var ctx = {
                    doc: iframe.contentDocument,
                    win: iframe.contentWindow,
                    sleep: window.WN_TEST_HELPERS.sleep,
                    waitFor: window.WN_TEST_HELPERS.waitFor,
                    assert: window.WN_TEST_HELPERS.assert,
                };
                await s.run(ctx);
                var ms = Math.round(performance.now() - t0);
                resultsByID[s.id] = { status: 'pass', ms: ms };
                setRowStatus(s.id, 'pass', { ms: ms });
            } catch (e) {
                var ms2 = Math.round(performance.now() - t0);
                resultsByID[s.id] = { status: 'fail', ms: ms2, error: String(e && e.message || e) };
                setRowStatus(s.id, 'fail', { ms: ms2, error: String(e && e.message || e) });
            }
            updateSummary();
        }

        async function runAll(filter) {
            var btn = $('run-all'), btn2 = $('run-failed');
            btn.disabled = true; btn2.disabled = true;
            for (var i = 0; i < window.WN_TEST_SCENARIOS.length; i++) {
                var s = window.WN_TEST_SCENARIOS[i];
                if (filter && !filter(s)) continue;
                await runOne(s);
            }
            btn.disabled = false;
            updateSummary();
        }

        function loadLastPlaywrightRun() {
            fetch('/debug/tests/last-run.json').then(function (r) {
                if (!r.ok) return null;
                return r.json();
            }).then(function (data) {
                var meta = $('pw-meta'), list = $('pw-list');
                if (!data || data.error) {
                    meta.textContent = 'No Playwright run found. Run \`npm test\` to generate.';
                    return;
                }
                var stats = data.stats || {};
                var startedAt = stats.startTime ? new Date(stats.startTime).toLocaleString() : 'unknown';
                var duration = stats.duration ? (stats.duration / 1000).toFixed(2) + 's' : '?';
                meta.innerHTML = '';
                meta.appendChild(document.createTextNode('Run started ' + startedAt + ' · duration ' + duration + ' · '));
                meta.appendChild(el('span', 'pw-pass', (stats.expected || 0) + ' passed'));
                meta.appendChild(document.createTextNode(' · '));
                meta.appendChild(el('span', 'pw-fail', (stats.unexpected || 0) + ' failed'));
                if (stats.flaky) {
                    meta.appendChild(document.createTextNode(' · '));
                    meta.appendChild(el('span', 'pw-skip', stats.flaky + ' flaky'));
                }
                if (stats.skipped) {
                    meta.appendChild(document.createTextNode(' · '));
                    meta.appendChild(el('span', 'pw-skip', stats.skipped + ' skipped'));
                }
                list.textContent = '';
                walkSuites(data.suites || [], function (test) {
                    var status = test.outcome || (test.results && test.results[0] && test.results[0].status) || 'unknown';
                    var cls = status === 'expected' || status === 'passed' ? 'pw-pass'
                            : status === 'unexpected' || status === 'failed' ? 'pw-fail' : 'pw-skip';
                    var icon = cls === 'pw-pass' ? '✓' : cls === 'pw-fail' ? '✗' : '○';
                    var line = el('div', cls);
                    line.textContent = icon + ' ' + test.title;
                    list.appendChild(line);
                });
            }).catch(function () {
                $('pw-meta').textContent = 'Could not load last run.';
            });
        }

        function walkSuites(suites, visit) {
            suites.forEach(function (s) {
                (s.specs || []).forEach(function (spec) {
                    (spec.tests || []).forEach(function (t) {
                        visit({ title: spec.title, outcome: t.status === 'expected' ? 'expected' : (t.status === 'unexpected' ? 'unexpected' : t.status), results: t.results });
                    });
                });
                if (s.suites) walkSuites(s.suites, visit);
            });
        }

        $('run-all').addEventListener('click', function () { runAll(); });
        $('run-failed').addEventListener('click', function () {
            runAll(function (s) {
                var r = resultsByID[s.id];
                return r && r.status === 'fail';
            });
        });

        // ───── Details modal ─────
        var modalCurrent = null;

        function setModalMsg(text, kind) {
            var m = $('sc-modal-msg');
            m.textContent = text || '';
            m.className = 'sc-modal-msg' + (kind ? ' ' + kind : '');
        }

        function openDetails(s) {
            modalCurrent = s;
            $('sc-modal-id').textContent = s.id;
            $('sc-modal-name').value = s.name || '';
            $('sc-modal-url').value = s.url || '';
            $('sc-modal-src').value = s.run ? s.run.toString() : '';
            setModalMsg('');
            $('sc-modal-backdrop').classList.add('open');
        }

        function closeDetails() {
            $('sc-modal-backdrop').classList.remove('open');
            modalCurrent = null;
        }

        function applyEdit() {
            if (!modalCurrent) return false;
            var src = $('sc-modal-src').value;
            try {
                // Wrap in parens so a leading "function" / "async function" / arrow is parsed as expression.
                // eslint-disable-next-line no-eval
                var fn = (0, eval)('(' + src + ')');
                if (typeof fn !== 'function') throw new Error('Source did not evaluate to a function.');
                modalCurrent.run = fn;
                setModalMsg('Applied (in-memory only).', 'ok');
                return true;
            } catch (e) {
                setModalMsg('Parse error: ' + (e && e.message || e), 'err');
                return false;
            }
        }

        $('sc-modal-close').addEventListener('click', closeDetails);
        $('sc-modal-cancel').addEventListener('click', closeDetails);
        $('sc-modal-backdrop').addEventListener('click', function (e) {
            if (e.target === $('sc-modal-backdrop')) closeDetails();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && $('sc-modal-backdrop').classList.contains('open')) closeDetails();
        });
        $('sc-modal-apply').addEventListener('click', applyEdit);
        $('sc-modal-run').addEventListener('click', function () {
            var s = modalCurrent;
            if (!applyEdit()) return;
            closeDetails();
            runOne(s);
        });

        ready(function () {
            renderScenarios();
            loadLastPlaywrightRun();
        });
    })();
    </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    if (pathname === '/debug' || pathname.startsWith('/debug/')) {
        const COMPONENT_GROUPS = [
            ['Shared',    ['help-modal', 'icon-picker', 'json-table', 'modal-container', 'nav-button', 'nav-meta', 'time-picker', 'date-time-picker', 'week-calendar', 'week-pill']],
            ['Context',   ['ctx-switcher']],
            ['Search',    ['global-search']],
            ['Notes',     ['markdown-preview', 'note-card', 'note-editor', 'note-meta-view', 'note-meta-panel', 'note-view']],
            ['Tasks',     ['task-add-modal', 'task-complete-modal', 'task-note', 'task-note-modal', 'task-open-list', 'task-completed', 'task-create', 'task-view']],
            ['Meetings',  ['meeting-create', 'meeting-create-modal', 'upcoming-meetings', 'today-calendar', 'week-notes-calendar']],
            ['People',    ['company-card', 'entity-callout', 'entity-mention', 'people-page', 'person-card', 'place-card']],
            ['Results',   ['results-page', 'week-results']],
            ['Settings',  ['settings-page']],
            ['Composit',  ['week-list', 'week-section']],
        ];
        const COMPONENTS = COMPONENT_GROUPS.flatMap(([, items]) => items);

        // List all weeks for week-* demos.
        // Use the mock-services seed: the current ISO week and the two prior.
        const mockToday = new Date();
        const mockThisWeek = dateToIsoWeek(mockToday);
        const mockLastWeek = (() => { const d = new Date(mockToday); d.setDate(d.getDate() - 7); return dateToIsoWeek(d); })();
        const mockTwoWeeksAgo = (() => { const d = new Date(mockToday); d.setDate(d.getDate() - 14); return dateToIsoWeek(d); })();
        const weeks = [mockThisWeek, mockLastWeek, mockTwoWeeksAgo];

        // Mock notes seeded by domains/_mock-services.js
        const allNotes = [
            `${mockThisWeek}/mandag.md`,
            `${mockThisWeek}/tirsdag.md`,
            `${mockLastWeek}/oppsummering.md`,
            `${mockTwoWeeksAgo}/reise.md`,
        ];
        const firstNote = allNotes[0] || '';

        // Default page when no component picked: redirect to first
        const current = pathname === '/debug' ? '' : pathname.slice('/debug/'.length);
        if (!current) {
            res.writeHead(302, { Location: `/debug/${COMPONENTS[0]}` });
            res.end();
            return;
        }
        if (current === 'services') {
            return renderServicesDebug(req, res);
        }
        if (current === 'data-shapes' || current.startsWith('data-shapes/')) {
            const sub = current === 'data-shapes' ? '' : current.slice('data-shapes/'.length);
            return renderDataShapesDebug(req, res, sub);
        }
        if (current === 'tests') {
            return renderTestsDebug(req, res);
        }
        if (!COMPONENTS.includes(current)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Unknown component: ${current}`);
            return;
        }

        // ---- per-component demo declaration ----
        // tag       : custom element name (a single live instance is rendered)
        // attrs     : [{ name, type:'text'|'select'|'bool', options?, default }]
        // wrap      : optional surrounding HTML string with %HOST% placeholder
        // rawHtml   : for components that need bespoke markup (no attribute editor)
        // extraStyle: per-demo CSS additions
        let notesMetaSample = null;
        try {
            notesMetaSample = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'notes-meta.schema.json'), 'utf8'));
        } catch (_) { notesMetaSample = null; }
        const notesMetaJson = JSON.stringify(notesMetaSample, null, 2).replace(/</g, '\\u003c');

        const DEMOS = {
            'nav-meta': {
                desc: `<p><strong>&lt;nav-meta&gt;</strong> is a small read-only navbar widget that shows the current weekday, date, ISO week badge and a live clock. It updates once per second and uses the Norwegian locale (<code>nb-NO</code>) for date and time formatting.</p>
                    <p><strong>Domain:</strong> none &mdash; presentational only, no service required.</p>
                    <p><strong>Attributes:</strong> none. The widget is fully self-driven.</p>
                    <p><strong>Lifecycle.</strong> Starts a 1&nbsp;Hz <code>setTimeout</code> loop on connect; clears it on disconnect. The render() output is just three empty spans (date, week badge, clock); the timer fills them in to avoid re-rendering the whole shadow tree every second.</p>
                    <p><strong>Boundary events</strong> (composed/bubbles, fire on the next tick after a wall-clock crossing &mdash; <em>not</em> on initial mount):</p>
                    <ul>
                        <li><code>nav-meta:newMinute</code> &mdash; <code>{ minute: 'YYYY-MM-DDTHH:MM', now: Date }</code></li>
                        <li><code>nav-meta:newHour</code> &mdash; <code>{ hour: 'YYYY-MM-DDTHH', now: Date }</code></li>
                        <li><code>nav-meta:newDay</code> &mdash; <code>{ date: 'YYYY-MM-DD', now: Date }</code></li>
                        <li><code>nav-meta:newWeek</code> &mdash; <code>{ week: 'YYYY-WNN', now: Date }</code></li>
                        <li><code>nav-meta:newMonth</code> &mdash; <code>{ month: 'YYYY-MM', now: Date }</code></li>
                        <li><code>nav-meta:newYear</code> &mdash; <code>{ year: NNNN, now: Date }</code></li>
                    </ul>
                    <p>Pages typically listen on <code>document</code> to refresh "today / this week" derived UI without polling. <code>newMinute</code> fires every wall-clock minute (~once per minute, on the :00 second), so use it sparingly &mdash; for things like a "last edited 2 min ago" timestamp. Try the buttons below to simulate a transition (they overwrite the recorded baseline so the next tick fires the corresponding event):</p>`,
                rawHtml: `<div style="background:var(--surface);padding:10px;border-radius:6px;display:inline-block"><nav-meta id="dbg-nm"></nav-meta></div>
                    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
                        <button type="button" class="btn" data-dbg-nm="minute" style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;font-weight:600;cursor:pointer">Simulate newMinute</button>
                        <button type="button" class="btn" data-dbg-nm="hour"   style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;font-weight:600;cursor:pointer">Simulate newHour</button>
                        <button type="button" class="btn" data-dbg-nm="day"    style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;font-weight:600;cursor:pointer">Simulate newDay</button>
                        <button type="button" class="btn" data-dbg-nm="week"   style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;font-weight:600;cursor:pointer">Simulate newWeek</button>
                        <button type="button" class="btn" data-dbg-nm="month"  style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;font-weight:600;cursor:pointer">Simulate newMonth</button>
                        <button type="button" class="btn" data-dbg-nm="year"   style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;font-weight:600;cursor:pointer">Simulate newYear</button>
                    </div>
                    <pre id="dbg-nm-out" style="margin-top:10px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;min-height:42px;white-space:pre-wrap"></pre>
                    <script>
                        customElements.whenDefined('nav-meta').then(function(){
                            var nm = document.getElementById('dbg-nm');
                            var out = document.getElementById('dbg-nm-out');
                            ['newMinute','newHour','newDay','newWeek','newMonth','newYear'].forEach(function(n){
                                document.addEventListener('nav-meta:' + n, function(e){
                                    var line = '[' + new Date().toLocaleTimeString('nb-NO') + '] nav-meta:' + n + ' → ' + JSON.stringify(e.detail, function(k,v){ return v instanceof Date ? v.toISOString() : v; });
                                    out.textContent = line + '\\n' + out.textContent;
                                });
                            });
                            document.querySelectorAll('[data-dbg-nm]').forEach(function(btn){
                                btn.addEventListener('click', function(){
                                    if (!nm._last) return;
                                    var which = btn.getAttribute('data-dbg-nm');
                                    if (which === 'minute') nm._last.minute = '1999-01-01T00:00';
                                    if (which === 'hour')   nm._last.hour   = '1999-01-01T00';
                                    if (which === 'day')    nm._last.day    = '1999-01-01';
                                    if (which === 'week')   nm._last.week   = '1999-W01';
                                    if (which === 'month')  nm._last.month  = '1999-01';
                                    if (which === 'year')   nm._last.year   = 1999;
                                });
                            });
                        });
                    <\/script>`,
            },
            'nav-button': {
                desc: `<p><strong>&lt;nav-button&gt;</strong> is the unified navigation link element used in the top navbar &mdash; both for the &ldquo;Ukenotater&rdquo; brand link and for each menu item. Renders as a single anchor in shadow DOM with the app accent color and heading font.</p>
                    <p><strong>Attributes:</strong></p>
                    <ul>
                        <li><code>href</code> &mdash; link target (default <code>/</code>)</li>
                        <li><code>text</code> &mdash; link label (default <code>Ukenotater</code>)</li>
                        <li><code>icon</code> &mdash; optional emoji/glyph rendered before the text</li>
                        <li><code>size</code> &mdash; <code>1</code> (smallest) … <code>5</code> (largest); default <code>3</code>. Drives <code>--nb-size</code>.</li>
                    </ul>
                    <p><strong>Lifecycle.</strong> Stateless. Click is intercepted in shadow DOM and converted into the <code>nav-clicked</code> event &mdash; the host page's listener is responsible for actual navigation (SPA router-aware in the app).</p>
                    <p><strong>Events.</strong> Cancelable bubbling/composed <code>nav-clicked</code> with <code>{ href }</code>. <code>preventDefault()</code> blocks the host's navigation.</p>`,
                tag: 'nav-button',
                attrs: [
                    { name: 'href', type: 'text', default: '/' },
                    { name: 'text', type: 'text', default: 'Ukenotater' },
                    { name: 'icon', type: 'select', default: '', options: ['', '📓', '🏠', '📅', '✅', '👥', '⭐', '🔍', '⚙️', '📝', '💡', '🚀'] },
                    { name: 'size', type: 'text', default: '3' },
                ],
                wrap: `<div style="background:var(--surface);padding:10px;border-radius:6px;display:inline-block">%HOST%</div>`,
            },
            'app-navbar': {
                desc: 'REMOVED — the navbar is now plain HTML rendered by navbarHtml() in server.js.',
                rawHtml: `<p style="color:var(--text-muted);font-style:italic">This component has been removed.</p>`,
            },
            'ctx-switcher': {
                desc: `<p><strong>&lt;ctx-switcher&gt;</strong> is the workspace/context dropdown shown next to the brand. Each context is its own data folder and git repo, and switching contexts triggers a server-side cookie change followed by a full page reload.</p>
                    <p><strong>Domain:</strong> <code>context</code> &mdash; reads its primary service from <code>context_service</code>. Calls <code>list()</code>, <code>switchTo(id)</code>, and <code>commit(id, { message })</code>.</p>
                    <p><strong>Self-contained shadow DOM.</strong> The component renders its own trigger button and menu inside its shadow root and fetches the context list via <code>service.list()</code> on connect. No light-DOM children are read; the host just emits <code>&lt;ctx-switcher context_service="…"&gt;&lt;/ctx-switcher&gt;</code>.</p>
                    <p><strong>Lifecycle.</strong> States: &ldquo;Laster…&rdquo; while loading, the trigger + menu when ready, &ldquo;Ingen kontekst&rdquo; on error/empty. Toggles the host class <code>open</code> on trigger click. Closes on outside click and Esc.</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>context-selected</code> with <code>{ id, result }</code> &mdash; <code>preventDefault()</code> aborts the page reload</li>
                        <li><code>context-commit</code> with <code>{ id, result }</code></li>
                    </ul>`,
                tag: 'ctx-switcher',
                attrs: [
                    { name: 'context_service', type: 'text', default: 'MockContextService' },
                ],
            },
            'icon-picker': {
                desc: `<p><strong>&lt;icon-picker&gt;</strong> is a generic emoji / icon picker. Renders a grid of icon buttons; clicking one selects it. Pure presentation &mdash; no service.</p>
                    <p><strong>Attributes:</strong></p>
                    <ul>
                        <li><code>value</code> &mdash; the selected icon string.</li>
                        <li><code>icons</code> &mdash; JSON array. Items can be plain strings (<code>"📁"</code>) or objects (<code>{icon, name}</code>). When omitted, a built-in default set is used.</li>
                        <li><code>groups</code> &mdash; JSON array for sectioned mode: <code>[{name, icons}]</code>. Each group's name renders as a small heading above its grid. Takes precedence over <code>icons</code>.</li>
                        <li><code>columns</code> &mdash; integer, grid columns (default <code>8</code>).</li>
                        <li><code>size</code> &mdash; pixel cell size (default <code>36</code>).</li>
                        <li><code>name</code> &mdash; if set, a hidden <code>&lt;input&gt;</code> with that name is rendered, reflecting <code>value</code> for form submission.</li>
                        <li><code>readonly</code> &mdash; ignore clicks.</li>
                    </ul>
                    <p><strong>Property:</strong> <code>el.value</code> (get/set, reflects to attribute).</p>
                    <p><strong>Event:</strong> <code>valueChanged</code> with <code>{ value }</code> when a cell is clicked.</p>`,
                rawHtml: `<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
                        <div>
                            <div style="font-size:0.85em;color:var(--text-muted);margin-bottom:4px">Default icons</div>
                            <icon-picker id="ip1" value="📁"></icon-picker>
                        </div>
                        <div>
                            <div style="font-size:0.85em;color:var(--text-muted);margin-bottom:4px">Custom set, 6 cols, named</div>
                            <icon-picker id="ip2" columns="6" icons='[{"icon":"💼","name":"Jobb"},{"icon":"🏠","name":"Hjem"},{"icon":"🎮","name":"Spill"},{"icon":"📚","name":"Bok"},{"icon":"🏃","name":"Trening"},{"icon":"☕","name":"Kaffe"}]'></icon-picker>
                        </div>
                        <div>
                            <div style="font-size:0.85em;color:var(--text-muted);margin-bottom:4px">Grouped</div>
                            <icon-picker id="ip3" columns="6" groups='[{"name":"Faces","icons":["😀","😎","🤔","😴","🥳","🤩"]},{"name":"Travel","icons":["✈️","🚗","🚄","🚲","🛳️","🛵"]}]'></icon-picker>
                        </div>
                    </div>
                    <pre id="ip-out" style="margin-top:14px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;min-height:32px;white-space:pre-wrap"></pre>
                    <script>
                        (function(){
                            var out = document.getElementById('ip-out');
                            function log(id, ev){
                                out.textContent = '[' + new Date().toLocaleTimeString('nb-NO') + '] ' + id + ' → valueChanged ' + JSON.stringify(ev.detail) + '\\n' + out.textContent;
                            }
                            ['ip1','ip2','ip3'].forEach(function(id){
                                document.getElementById(id).addEventListener('valueChanged', function(e){ log(id, e); });
                            });
                        })();
                    <\/script>`,
            },
            'json-table': {
                desc: `<p><strong>&lt;json-table&gt;</strong> renders an array of objects as a sortable, scrollable HTML table. Used heavily on the <a href="/debug/services">services</a> page to display API responses.</p>
                    <p><strong>Domain:</strong> none &mdash; presentational only.</p>
                    <p><strong>Properties.</strong> Set <code>el.data = [{…},…]</code> for an array, or <code>el.data = {…}</code> for a single object &mdash; in object mode it renders one row using the object's property names as column headers. Primitives render with <code>String()</code>; nested objects render as JSON in a muted cell.</p>
                    <p><strong>Attributes.</strong> <code>columns</code> (comma-separated list, default = union of keys), <code>max-height</code> (CSS, default <code>320px</code>), <code>empty-text</code>, <code>editable</code> (turn cells into <code>contenteditable</code>; commits on blur, Esc to revert, fires <code>cell-edit</code> events).</p>
                    <p><strong>Sorting.</strong> Click a column header to sort ascending; click again for descending; a third click clears the sort.</p>`,
                rawHtml: `<h4 style="margin:0 0 6px;font-size:0.9em;color:var(--text-muted)">Array of objects</h4>
                    <json-table id="dbg-jt" max-height="220px"></json-table>
                    <h4 style="margin:14px 0 6px;font-size:0.9em;color:var(--text-muted)">Single plain object (props become column headers)</h4>
                    <json-table id="dbg-jt-obj" max-height="220px"></json-table>
                    <h4 style="margin:14px 0 6px;font-size:0.9em;color:var(--text-muted)">Schema sample: <code>schemas/notes-meta.schema.json</code> (single object)</h4>
                    <json-table id="dbg-jt-nm" max-height="320px"></json-table>
                    <script>
                        var NOTES_META_SAMPLE = ${notesMetaJson};
                        customElements.whenDefined('json-table').then(function(){
                            var t = document.getElementById('dbg-jt');
                            if (t) t.data = [
                                { id: 1, name: 'Anna',    role: 'PM',       active: true,  hours: 37.5, tags: ['lead','planlegging'] },
                                { id: 2, name: 'Bjørn',   role: 'TechLead', active: true,  hours: 40,   tags: ['arkitektur'] },
                                { id: 3, name: 'Cecilie', role: 'Dev',      active: false, hours: 32,   tags: [] },
                                { id: 4, name: 'David',   role: 'Dev',      active: true,  hours: 38,   tags: ['onboarding'] },
                            ];
                            var o = document.getElementById('dbg-jt-obj');
                            if (o) o.data = {
                                version: '1.4.0',
                                releasedAt: '2026-04-30',
                                stable: true,
                                downloads: 12480,
                                authors: ['Petter', 'Copilot'],
                                config: { theme: 'paper', autosave: true },
                                notes: null,
                            };
                            var n = document.getElementById('dbg-jt-nm');
                            if (n) {
                                if (NOTES_META_SAMPLE && typeof NOTES_META_SAMPLE === 'object') {
                                    n.data = NOTES_META_SAMPLE;
                                } else {
                                    n.setAttribute('empty-text', 'schemas/notes-meta.schema.json mangler');
                                    n.data = [];
                                }
                            }
                        });
                    <\/script>`,
            },
            'modal-container': {
                desc: `<p><strong>&lt;modal-container&gt;</strong> is the generic modal shell. All app modals (help, task-create, task-complete, task-note, results, note-view, …) wrap their content in a <code>&lt;modal-container&gt;</code> instead of duplicating backdrop / Escape / close-button plumbing.</p>
                    <p><strong>Slots:</strong></p>
                    <ul>
                        <li><code>title</code> — header text</li>
                        <li>default — body content</li>
                        <li><code>footer</code> — custom footer markup (alternative to button API)</li>
                    </ul>
                    <p><strong>Attributes:</strong> <code>open</code>, <code>size</code> (<code>sm</code>|<code>md</code>|<code>lg</code>|<code>xl</code>|<code>full</code>), <code>no-close</code>, <code>no-backdrop-close</code>, <code>no-escape-close</code>.</p>
                    <p><strong>Methods:</strong> <code>open()</code>, <code>close(reason?)</code>, <code>toggle(force?)</code>, <code>setButtons([{label, action, primary, dismiss, variant}])</code>, <code>setContent(htmlOrNode)</code>, <code>setTitle(text)</code>, <code>setup({title, content, init, actions, size})</code>.</p>
                    <p><strong>Setup API.</strong> The <code>setup({...})</code> convenience method bundles content injection, event wiring and button configuration into one call:</p>
                    <pre style="margin:6px 0;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;font-size:0.85em;overflow:auto">modal.setup({
    title: '🛠 Eksempel',
    content: '&lt;input data-el="name"&gt;&lt;button data-el="hello"&gt;Hei&lt;/button&gt;',
    init: (m) =&gt; {
        m.querySelector('[data-el="hello"]').addEventListener('click', () =&gt; {
            console.log(m.querySelector('[data-el="name"]').value);
        });
    },
    actions: [
        { label: 'Avbryt', variant: 'ghost' },
        { label: 'Lagre', primary: true, action: (m) =&gt; save(m) },
    ],
});
modal.open();</pre>
                    <p><strong>Events:</strong> <code>modal-open</code>, <code>modal-close</code> (<code>detail.reason</code> ∈ <code>'escape'|'backdrop'|'button'|'programmatic'</code>).</p>
                    <p><strong>Buttons API.</strong> <code>setButtons([…])</code> renders an action row in the footer. Each button has a <code>label</code>, optional <code>action(modal, btnEl)</code> callback, <code>primary</code> styling, <code>variant</code> (<code>'danger'</code>|<code>'ghost'</code>) and <code>dismiss</code> (default <code>true</code>: close after action; return <code>false</code> from action to prevent closing). Async actions disable the button while the promise is pending.</p>`,
                rawHtml: `<div style="display:flex;gap:10px;flex-wrap:wrap">
                        <button class="btn-summarize" data-mc="basic">Basic modal</button>
                        <button class="btn-summarize" data-mc="buttons" style="background:var(--text-muted)">With buttons</button>
                        <button class="btn-summarize" data-mc="danger" style="background:#c0392b">Confirm delete</button>
                        <button class="btn-summarize" data-mc="async" style="background:#2a8a3e">Async action</button>
                        <button class="btn-summarize" data-mc="setup" style="background:#7c3aed">setup() API</button>
                    </div>
                    <pre id="dbg-mc-log" style="margin-top:14px;padding:8px;background:var(--surface-head);border:1px solid var(--border-faint);border-radius:6px;font-size:0.85em;max-height:140px;overflow:auto"></pre>

                    <script>
                        customElements.whenDefined('modal-container').then(function(){
                            var log = document.getElementById('dbg-mc-log');
                            function append(line){ if (log) { log.textContent += line + '\\n'; log.scrollTop = log.scrollHeight; } }
                            function makeModal(opts){
                                opts = opts || {};
                                var m = document.createElement('modal-container');
                                if (opts.size) m.setAttribute('size', opts.size);
                                document.body.appendChild(m);
                                m.addEventListener('modal-close', function onClose(){
                                    m.removeEventListener('modal-close', onClose);
                                    setTimeout(function(){ if (m.parentNode) m.parentNode.removeChild(m); }, 0);
                                });
                                return m;
                            }
                            function wireLogging(m, label){
                                m.addEventListener('modal-open', function(){ append('[' + label + '] open'); });
                                m.addEventListener('modal-close', function(e){ append('[' + label + '] close (' + e.detail.reason + ')'); });
                            }
                            var openers = {
                                basic: function(){
                                    var m = makeModal();
                                    wireLogging(m, 'basic');
                                    m.setup({
                                        title: 'Basic modal',
                                        content: '<p>Lukk via ✕, Esc eller klikk på bakgrunnen.</p>',
                                    });
                                    m.open();
                                },
                                buttons: function(){
                                    var m = makeModal();
                                    wireLogging(m, 'buttons');
                                    m.setup({
                                        title: 'Bekreft handling',
                                        content: '<p>Vil du lagre endringene?</p>',
                                        actions: [
                                            { label: 'Avbryt', variant: 'ghost', action: function(){ append('  → Avbryt'); } },
                                            { label: 'Lagre',  primary: true,    action: function(){ append('  → Lagre'); } },
                                        ],
                                    });
                                    m.open();
                                },
                                danger: function(){
                                    var m = makeModal();
                                    wireLogging(m, 'danger');
                                    m.setup({
                                        title: 'Slette element?',
                                        content: '<p>Dette kan ikke angres.</p>',
                                        actions: [
                                            { label: 'Avbryt', variant: 'ghost' },
                                            { label: 'Slett',  variant: 'danger', action: function(){ append('  → Slettet (mock)'); } },
                                        ],
                                    });
                                    m.open();
                                },
                                async: function(){
                                    var m = makeModal();
                                    wireLogging(m, 'async');
                                    m.setup({
                                        title: 'Lagre med forsinkelse',
                                        content: '<p>Knappen disables i 1.2s mens den «lagrer».</p>',
                                        actions: [
                                            { label: 'Avbryt', variant: 'ghost' },
                                            { label: 'Lagre', primary: true, action: function(){
                                                append('  → starter lagring…');
                                                return new Promise(function(res){ setTimeout(function(){ append('  → ferdig'); res(); }, 1200); });
                                            }},
                                        ],
                                    });
                                    m.open();
                                },
                                setup: function(){
                                    var m = makeModal({ size: 'md' });
                                    wireLogging(m, 'setup');
                                    m.setup({
                                        title: '🛠 setup() API',
                                        content:
                                            '<p>Dette innholdet er injisert via <code>setContent</code> som en HTML-streng.</p>' +
                                            '<label style="display:block;margin-top:8px">Navn: <input type="text" data-el="name" value="Per" style="margin-left:6px;padding:4px 8px;border:1px solid var(--border);border-radius:4px"></label>' +
                                            '<button type="button" data-el="hello" style="margin-top:10px;padding:4px 10px">Si hei</button>' +
                                            '<pre data-el="out" style="margin-top:8px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:4px;min-height:1.4em"></pre>',
                                        init: function(modal){
                                            var helloBtn = modal.querySelector('[data-el="hello"]');
                                            var nameIn   = modal.querySelector('[data-el="name"]');
                                            var out      = modal.querySelector('[data-el="out"]');
                                            helloBtn.addEventListener('click', function(){
                                                out.textContent = 'Hei, ' + (nameIn.value || 'verden') + '!';
                                            });
                                            append('  → init() wired');
                                        },
                                        actions: [
                                            { label: 'Avbryt', variant: 'ghost' },
                                            { label: 'Bekreft', primary: true, action: function(mm){
                                                var name = mm.querySelector('[data-el="name"]').value;
                                                append('  → bekreftet med navn=' + JSON.stringify(name));
                                            }},
                                        ],
                                    });
                                    m.open();
                                },
                            };
                            document.querySelectorAll('button[data-mc]').forEach(function(b){
                                b.addEventListener('click', function(){
                                    var fn = openers[b.dataset.mc];
                                    if (typeof fn === 'function') fn();
                                });
                            });
                        });
                    <\/script>`,
            },
            'help-modal': {
                desc: `<p><strong>&lt;help-modal&gt;</strong> is a singleton lazy-loaded modal that displays the project's <code>help.md</code>. The markdown is fetched and rendered through <code>window.marked</code> on first open and cached for subsequent opens.</p>
                    <p><strong>Domain:</strong> none.</p>
                    <p><strong>Triggers.</strong> Click on any element with <code>id="helpBtn"</code> (the navbar's <kbd>?</kbd> button) calls <code>open()</code>. Programmatic openers should call <code>document.querySelector('help-modal').open()</code> directly. Closes on Esc, backdrop click, or the modal's close button.</p>
                    <p><strong>API:</strong> <code>open()</code>, <code>close()</code>. The <code>open</code> attribute reflects state.</p>
                    <p><strong>Lifecycle.</strong> Renders an empty placeholder until first opened; then fetches <code>/help.md</code> and renders the modal. Subsequent opens reuse the cached HTML.</p>`,
                rawHtml: `<button id="helpBtn" class="btn-summarize">❓ Open help (via #helpBtn)</button>
                    <button class="btn-summarize" onclick="document.querySelector('help-modal').open()" style="background:var(--text-muted)">Call open() directly</button>
                    <help-modal></help-modal>`,
            },
            'entity-callout': {
                desc: `<p><strong>&lt;entity-callout&gt;</strong> is a dumb floating tooltip that shows a read-only summary of a person, company or place. It does <strong>not</strong> listen to any events and does not load data &mdash; the host owns hover detection, entity resolution and positioning, then drives the callout via two methods.</p>
                    <p><strong>API:</strong></p>
                    <ul>
                        <li><code>setData({ kind, entity, key, x, y })</code> &mdash; show. <code>kind</code> is <code>'person'</code>, <code>'company'</code> or <code>'place'</code>. <code>entity</code> is the resolved object, or <code>null</code> to render a "missing" message based on <code>key</code>. <code>x</code>/<code>y</code> are viewport coordinates.</li>
                        <li><code>hide()</code> &mdash; remove the <code>visible</code> attribute.</li>
                    </ul>
                    <p>Cards (<code>&lt;person-card&gt;</code>, <code>&lt;company-card&gt;</code>, <code>&lt;place-card&gt;</code>) emit <code>hover-person</code>/<code>hover-company</code>/<code>hover-place</code> with <code>{ key, entering, x, y }</code>. The host (e.g. <code>&lt;people-page&gt;</code>) listens, resolves the entity from its in-memory data and calls <code>setData(...)</code> on hover-in, <code>hide()</code> on hover-out.</p>
                    <p><strong>Below:</strong> the three rendering variants &mdash; person, company and place &mdash; each shown by calling <code>setData()</code> directly. The fixed-position styling is overridden for the demo so all three are visible at once.</p>`,
                rawHtml: `<style>
                        .ec-demo { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
                        .ec-demo entity-callout { position: static !important; opacity: 1 !important; transition: none !important; display: block; }
                    </style>
                    <div class="ec-demo">
                        <entity-callout id="dbg-ec-person"></entity-callout>
                        <entity-callout id="dbg-ec-company"></entity-callout>
                        <entity-callout id="dbg-ec-place"></entity-callout>
                        <entity-callout id="dbg-ec-missing"></entity-callout>
                    </div>
                    <script>
                        customElements.whenDefined('entity-callout').then(function(){
                            return Promise.all([
                                Promise.resolve(window.MockPeopleService    ? window.MockPeopleService.list()    : []),
                                Promise.resolve(window.MockCompaniesService ? window.MockCompaniesService.list() : []),
                                Promise.resolve(window.MockPlacesService    ? window.MockPlacesService.list()    : []),
                            ]);
                        }).then(function(arr){
                            var people = arr[0] || [], companies = arr[1] || [], places = arr[2] || [];
                            var person = people[0] || null;
                            if (person && person.primaryCompanyKey) {
                                var co = companies.find(function(c){ return c.key === person.primaryCompanyKey; });
                                if (co) person = Object.assign({}, person, { company: co });
                            }
                            document.getElementById('dbg-ec-person')  .setData({ kind: 'person',  key: person && person.key, entity: person });
                            document.getElementById('dbg-ec-company') .setData({ kind: 'company', key: companies[0] && companies[0].key, entity: companies[0] || null });
                            document.getElementById('dbg-ec-place')   .setData({ kind: 'place',   key: places[0]    && places[0].key,    entity: places[0]    || null });
                            document.getElementById('dbg-ec-missing') .setData({ kind: 'person',  key: 'ukjent', entity: null });
                        });
                    <\/script>`,
            },
            'entity-mention': {
                desc: `<p><strong>&lt;entity-mention&gt;</strong> is a reusable inline chip representing a reference to a person, company or place. Given a <code>key</code> it auto-resolves the entity from the global services (<code>window['week-note-services']</code>, falling back to <code>window.MockServices</code>) and shows a friendly display name (<code>FirstName LastName</code> for people, <code>name</code> for companies and places). The lookup is shared and cached across all chips on the page. The component still emits hover and select events for the global callout / SPA navigation hooks.</p>
                    <p><strong>Attributes:</strong></p>
                    <ul>
                        <li><code>kind</code> &mdash; <code>'person'</code> | <code>'company'</code> | <code>'place'</code> (default <code>person</code>)</li>
                        <li><code>key</code> &mdash; entity key. Required.</li>
                        <li><code>label</code> &mdash; optional explicit display text. If set, lookup is skipped. Useful when the renderer already knows the name (avoids the async re-render flicker).</li>
                    </ul>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>hover-person</code> / <code>hover-company</code> / <code>hover-place</code> with <code>{ key, entering, x, y }</code></li>
                        <li><code>select-person</code> / <code>select-company</code> / <code>select-place</code> with <code>{ key }</code></li>
                    </ul>
                    <p>Below: chips that auto-resolve from <code>MockServices</code>, plus chips with explicit labels (lookup skipped) and an unresolvable key (falls back to the key).</p>`,
                rawHtml: `<p style="font-size:1.05em; line-height:1.7;">
                        Auto-resolved (no <code>label</code>):
                        Møte med <entity-mention kind="person" key="petter"></entity-mention>
                        og <entity-mention kind="person" key="astrid"></entity-mention>
                        fra <entity-mention kind="company" key="acmeas"></entity-mention>
                        på <entity-mention kind="place" key="mathallen"></entity-mention>.
                        Ukjent: <entity-mention kind="person" key="ukjent"></entity-mention>.
                    </p>
                    <p style="font-size:1.05em; line-height:1.7;">
                        Explicit <code>label</code> (lookup skipped):
                        <entity-mention kind="person" key="petter" label="Petter E."></entity-mention>,
                        <entity-mention kind="company" key="acmeas" label="Acme"></entity-mention>.
                    </p>`,
            },
            'company-card': {
                desc: `<p><strong>&lt;company-card&gt;</strong> is a dumb presentation card for a single company. It is used by <code>&lt;people-page&gt;</code> on the Selskaper tab, but is reusable anywhere a company's members and cross-references should be displayed inline.</p>
                    <p><strong>Domain:</strong> <code>people</code> &mdash; no service is read directly. The host is responsible for assembling the data and passing it via <code>setData(d)</code>.</p>
                    <p><strong>Data shape:</strong></p>
                    <ul>
                        <li><code>company</code> &mdash; <code>{ id, key, name, url, address, orgnr, notes, deleted? }</code></li>
                        <li><code>members</code> &mdash; <code>[{ person, primary }]</code></li>
                        <li><code>tasks</code> &mdash; <code>[{ id, text, done }]</code> (already filtered to references of this company)</li>
                        <li><code>meetings</code> &mdash; <code>[{ id, title, date, start, week }]</code></li>
                        <li><code>results</code> &mdash; <code>[{ id, text, week }]</code></li>
                        <li><code>people</code>, <code>companies</code> &mdash; full lists for <code>@mention</code> link resolution</li>
                        <li><code>open</code> &mdash; expanded state (controlled by host)</li>
                    </ul>
                    <p><strong>Lifecycle.</strong> <code>setData(d)</code> may be called before or after the element is connected. Until set, the card renders &ldquo;Ingen data.&rdquo;.</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>toggle</code> with <code>{ key }</code> &mdash; header click. The card does not toggle itself; the host should flip its expanded set and call <code>setData(...)</code> again with the new <code>open</code> value.</li>
                        <li><code>edit</code> with <code>{ id, key }</code> &mdash; pencil button.</li>
                        <li><code>select-person</code> / <code>select-meeting</code> / <code>select-result</code> / <code>select-task</code> &mdash; click on a member chip or a ref row. Detail carries <code>{ key }</code> for person, <code>{ id, week }</code> for meeting/result, <code>{ id }</code> for task.</li>
                        <li><code>hover-person</code> / <code>hover-meeting</code> / <code>hover-result</code> / <code>hover-task</code> &mdash; same items on pointerenter/leave. Detail adds <code>{ entering: true|false }</code>.</li>
                    </ul>
                    <p>Refs are non-link <code>&lt;span&gt;</code>s &mdash; the card does not navigate; the host owns routing.</p>`,
                rawHtml: `<company-card id="dbg-company-card"></company-card>
                    <script>
                        customElements.whenDefined('company-card').then(function(){
                            var el = document.getElementById('dbg-company-card');
                            if (!el || !el.setData) return;
                            var people = [
                                { id:'p1', key:'anna',  firstName:'Anna',  lastName:'Berg',  name:'Anna Berg',  title:'Produkteier' },
                                { id:'p2', key:'bjorn', firstName:'Bjørn', lastName:'Dahl',  name:'Bjørn Dahl', title:'Tech Lead'  },
                                { id:'p3', key:'cecilie', firstName:'Cecilie', lastName:'Eng', name:'Cecilie Eng', title:'Designer' },
                            ];
                            var companies = [
                                { id:'c1', key:'acmeas', name:'Acme AS', url:'https://acme.example', address:'Storgata 1, Oslo', orgnr:'923 456 789', notes:'Hovedleverandør av widgets.' },
                                { id:'c2', key:'globex', name:'Globex',  url:'https://globex.example' },
                            ];
                            var setOpen = true;
                            function refresh(){
                                el.setData({
                                    company: companies[0],
                                    members: [
                                        { person: people[0], primary: true  },
                                        { person: people[1], primary: false },
                                        { person: people[2], primary: false },
                                    ],
                                    tasks: [
                                        { id:'t1', text:'Følge opp @anna om widget v2',         done:false },
                                        { id:'t2', text:'Ferdigstille kontrakt med @acmeas',    done:true  },
                                    ],
                                    meetings: [
                                        { id:'m1', title:'Statusmøte med @acmeas', date:'2026-04-28', start:'10:00', week:'2026-W18' },
                                        { id:'m2', title:'Kickoff @globex',        date:'2026-04-22', start:'13:00', week:'2026-W17' },
                                    ],
                                    results: [
                                        { id:'r1', text:'Signert avtale med @acmeas', week:'2026-W17' },
                                    ],
                                    people: people, companies: companies,
                                    open: setOpen,
                                });
                            }
                            // Host-controlled toggle pattern.
                            el.addEventListener('toggle', function(){ setOpen = !setOpen; refresh(); });
                            refresh();
                        });
                    <\/script>`,
            },
            'person-card': {
                desc: `<p><strong>&lt;person-card&gt;</strong> is a dumb presentation card for a single person. Used by <code>&lt;people-page&gt;</code> on the Personer tab; reusable elsewhere.</p>
                    <p><strong>Domain:</strong> <code>people</code>. The host assembles <code>person</code>, related <code>tasks/meetings/results</code> and the <code>primaryCompany</code>/<code>extraCompanies</code> lookups, then calls <code>setData(d)</code>.</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>toggle</code> with <code>{ key }</code> &mdash; header click. Card does not toggle itself; host owns expanded state.</li>
                        <li><code>edit</code> with <code>{ id, key }</code> &mdash; pencil button.</li>
                        <li><code>select-company</code> / <code>select-meeting</code> / <code>select-result</code> / <code>select-task</code> &mdash; click on a company-pill or a ref row. Detail carries <code>{ key }</code> for company, <code>{ id, week }</code> for meeting/result, <code>{ id }</code> for task.</li>
                        <li><code>hover-company</code> / <code>hover-meeting</code> / <code>hover-result</code> / <code>hover-task</code> &mdash; same items on pointerenter/leave. Detail adds <code>{ entering: true|false }</code>.</li>
                    </ul>
                    <p>Refs are non-link <code>&lt;span&gt;</code>s &mdash; the host owns navigation.</p>`,
                rawHtml: `<person-card id="dbg-person-card"></person-card>
                    <entity-callout id="dbg-pc-callout"></entity-callout>
                    <script>
                        Promise.all([
                            customElements.whenDefined('person-card'),
                            customElements.whenDefined('entity-callout'),
                        ]).then(function(){
                            var el  = document.getElementById('dbg-person-card');
                            var cal = document.getElementById('dbg-pc-callout');
                            if (!el || !el.setData) return;
                            var people = [
                                { id:'p1', key:'anna',  firstName:'Anna',  lastName:'Berg', name:'Anna Berg', title:'Produkteier', email:'anna@example.no', phone:'+47 900 11 222', notes:'Kontakt for widget v2.', primaryCompanyKey:'acmeas', extraCompanyKeys:['globex'] },
                                { id:'p2', key:'bjorn', firstName:'Bjørn', lastName:'Dahl', name:'Bjørn Dahl' },
                            ];
                            var companies = [
                                { id:'c1', key:'acmeas', name:'Acme AS', url:'https://acme.example', notes:'Hovedkunde.' },
                                { id:'c2', key:'globex', name:'Globex',  notes:'Avstemming kvartalsvis.' },
                            ];
                            var setOpen = true;
                            function refresh(){
                                el.setData({
                                    person: people[0],
                                    primaryCompany: companies[0],
                                    extraCompanies: [companies[1]],
                                    tasks: [
                                        { id:'t1', text:'Følge opp @anna om widget v2', done:false },
                                        { id:'t2', text:'Avstemme tall med @globex',    done:true  },
                                    ],
                                    meetings: [
                                        { id:'m1', title:'1:1 med @anna',           date:'2026-04-28', start:'09:00', week:'2026-W18' },
                                    ],
                                    results: [
                                        { id:'r1', text:'Avtale signert med @acmeas', week:'2026-W17' },
                                    ],
                                    people: people, companies: companies,
                                    open: setOpen,
                                });
                            }
                            el.addEventListener('toggle', function(){ setOpen = !setOpen; refresh(); });
                            // Demo host wiring: listen for hover-company on the card and drive
                            // the <entity-callout>. The card itself stays dumb.
                            el.addEventListener('hover-company', function(e){
                                var d = e.detail || {};
                                if (!d.entering) { cal.hide(); return; }
                                var co = companies.find(function(c){ return c.key === d.key; }) || null;
                                cal.setData({ kind:'company', key:d.key, entity:co, x:d.x, y:d.y });
                            });
                            refresh();
                        });
                    <\/script>`,
            },
            'place-card': {
                desc: `<p><strong>&lt;place-card&gt;</strong> is a dumb presentation card for a single place. Used by <code>&lt;people-page&gt;</code> on the Steder tab.</p>
                    <p><strong>Domain:</strong> <code>people</code>. The host passes the <code>place</code> object plus <code>meetings</code> already filtered to that place. When <code>lat</code>/<code>lng</code> are finite numbers, a Leaflet mini-map renders inside the card&rsquo;s own shadow root (Leaflet is loaded lazily on first need).</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>toggle</code> with <code>{ key }</code> &mdash; header click. Host owns expanded state.</li>
                        <li><code>edit</code> with <code>{ id, key }</code> &mdash; pencil button.</li>
                        <li><code>select-meeting</code> with <code>{ id, week }</code> &mdash; meeting ref click.</li>
                        <li><code>hover-meeting</code> with <code>{ id, week, entering }</code> &mdash; meeting ref pointerenter/leave.</li>
                    </ul>`,
                rawHtml: `<place-card id="dbg-place-card"></place-card>
                    <script>
                        customElements.whenDefined('place-card').then(function(){
                            var el = document.getElementById('dbg-place-card');
                            if (!el || !el.setData) return;
                            var setOpen = true;
                            function refresh(){
                                el.setData({
                                    place: { id:'pl1', key:'osloctr', name:'Oslo Sentrum', address:'Karl Johans gate 1, Oslo', lat: 59.9139, lng: 10.7522, notes:'Kaffe-spot for nye møter.' },
                                    meetings: [
                                        { id:'m1', title:'Statusmøte med @acmeas', date:'2026-04-28', start:'10:00', week:'2026-W18' },
                                        { id:'m2', title:'Kickoff @globex',        date:'2026-04-22', start:'13:00', week:'2026-W17' },
                                    ],
                                    people: [], companies: [],
                                    open: setOpen,
                                });
                            }
                            el.addEventListener('toggle', function(){ setOpen = !setOpen; refresh(); });
                            refresh();
                        });
                    <\/script>`,
            },
            'note-card': {
                desc: `<p><strong>&lt;note-card&gt;</strong> is a dumb presentation card for a single note. It does not load anything itself &mdash; the host (typically <code>&lt;week-section&gt;</code>) calls <code>el.setData(d)</code> to populate it.</p>
                    <p><strong>Data shape:</strong> <code>{ week, file, name, type, pinned, snippet, themes, presentationStyle? }</code>. <code>type</code> drives the icon (📝 note, 🤝 meeting, 🎯 task, 🎤 presentation, 📌 other); <code>themes</code> render as <code>#tag</code> pills under the snippet; <code>pinned</code> shows a 📌 prefix.</p>
                    <p><strong>Lifecycle.</strong> <code>setData(d)</code> may be called before or after the element is connected. Until set, the card shows &ldquo;Laster…&rdquo;. Setting data also writes a <code>data-note-card="&lt;week&gt;/&lt;file&gt;"</code> attribute on the host so the legacy delete-handler selector keeps working.</p>
                    <p><strong>Actions.</strong> All header buttons emit cancelable bubbling/composed events: <code>view</code>, <code>present</code> (only for <code>type=presentation</code>), <code>edit</code> and <code>delete</code>. Each carries <code>{ week, file }</code> (raw filename, not URI-encoded). The card itself never navigates &mdash; hosts decide what to do with the events.</p>`,
                rawHtml: `<note-card id="dbg-note-card"></note-card>
                    <script>
                        customElements.whenDefined('note-card').then(function(){
                            var el = document.getElementById('dbg-note-card');
                            if (el && el.setData) el.setData({
                                week: '2026-W18',
                                file: 'demo.md',
                                name: 'Demonstrasjon',
                                type: 'note',
                                pinned: false,
                                themes: ['demo', 'planning'],
                                snippet: '<p>Dette er et <em>kort</em> utdrag fra notatet \u2014 brukes som forhåndsvisning i kortet.</p>',
                            });
                        });
                    <\/script>`,
            },
            'note-meta-view': {
                desc: `<p><strong>&lt;note-meta-view&gt;</strong> is a service-less display card for a note's sidecar metadata. The host calls <code>el.meta = {…}</code> with the meta object; the component renders title, type chip, themes, key dates and emits <code>note-meta:view</code>, <code>note-meta:edit</code> and (for presentations) <code>note-meta:present</code> on its action buttons.</p>
                    <p><strong>Data shape:</strong> <code>{ week, file, name?, type?, pinned?, themes?: string[], created?, modified?, createdBy?, lastSavedBy?, presentationStyle? }</code>.</p>`,
                rawHtml: `<note-meta-view id="dbg-nmv"></note-meta-view>
                    <script>
                        customElements.whenDefined('note-meta-view').then(function(){
                            var el = document.getElementById('dbg-nmv');
                            if (!el) return;
                            el.meta = {
                                week: '2026-W18', file: 'demo.md', name: 'Demonstrasjon',
                                type: 'note', pinned: true, themes: ['demo','planning'],
                                created: '2026-04-27T08:30:00Z',
                                modified: '2026-04-29T14:12:00Z',
                                createdBy: 'me', lastSavedBy: 'sjur',
                            };
                        });
                    <\/script>`,
            },
            'note-meta-panel': {
                desc: `<p><strong>&lt;note-meta-panel&gt;</strong> is a self-loading wrapper around <code>&lt;note-meta-view&gt;</code> with two tabs: <em>Strukturert</em> (renders the structured meta card) and <em>Rå JSON</em> (pretty-printed sidecar JSON). Useful for debugging the sidecar shape directly.</p>
                    <p><strong>Domain:</strong> <code>notes</code> &mdash; primary service from <code>notes_service</code>. The service must implement <code>meta(week, file)</code>.</p>
                    <p><strong>Attributes.</strong> <code>path="YYYY-WNN/file.md"</code> (or <code>week</code> + <code>file</code>), and <code>tab</code> (<code>structured</code>|<code>raw</code>, default <code>structured</code>).</p>
                    <p><strong>Public API.</strong> <code>el.reload()</code> re-fetches the sidecar.</p>`,
                tag: 'note-meta-panel',
                attrs: [
                    { name: 'notes_service', type: 'text', default: 'MockNotesService' },
                    { name: 'path', type: 'text', default: firstNote },
                    { name: 'tab', type: 'text', default: 'structured' },
                ],
            },
            'note-view': {
                desc: `<p><strong>&lt;note-view&gt;</strong> is a modal overlay that loads and renders a note via <code>NotesService.renderHtml(week, file)</code>. Used by global-search to open note hits inline without leaving the current page.</p>
                    <p><strong>Domain:</strong> <code>notes</code> &mdash; primary service from <code>notes_service</code>. The service must implement <code>renderHtml(week, file)</code> returning the rendered HTML string.</p>
                    <p><strong>Public API.</strong> <code>el.open('YYYY-WNN/file.md')</code> shows the overlay and triggers a fetch. Setting the <code>open</code> attribute (declarative) does the same when <code>path</code> is set. <code>el.close()</code> hides the overlay.</p>
                    <p><strong>Lifecycle.</strong> Listens for <code>Esc</code> at the document level while open. Closing emits <code>note-view:close</code> (cancelable, bubbling, composed) with <code>{ path }</code>. Switching <code>path</code> while open re-fetches.</p>
                    <p><strong>Demo.</strong> Click the button below to open the modal against a mock note &mdash; same component as in production, just wired to <code>MockNotesService</code>.</p>`,
                rawHtml: `<button id="dbg-nv-open" type="button" style="font:inherit;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);cursor:pointer">Åpne note-view modal</button>
                    <note-view id="dbg-nv" notes_service="MockNotesService"></note-view>
                    <script>
                        (function(){
                            var btn = document.getElementById('dbg-nv-open');
                            var nv  = document.getElementById('dbg-nv');
                            if (!btn || !nv) return;
                            btn.addEventListener('click', function(){
                                customElements.whenDefined('note-view').then(function(){
                                    if (typeof nv.open === 'function') nv.open('${firstNote}');
                                });
                            });
                        })();
                    <\/script>`,
            },
            'task-open-list': {
                desc: `<p><strong>&lt;task-open-list&gt;</strong> is the &ldquo;Åpne oppgaver&rdquo; sidebar list shown on the home page. It loads all tasks via the tasks service, filters out completed ones, and renders each as a checkbox row with linked <code>@mentions</code> and a small note button.</p>
                    <p><strong>Domain:</strong> <code>tasks</code> &mdash; primary service from <code>tasks_service</code>. Also reads <code>people_service</code> and <code>companies_service</code> so mention text can be resolved to display names.</p>
                    <p><strong>Lifecycle.</strong> <code>_load()</code> fetches tasks, people and companies in parallel. Renders &ldquo;Laster…&rdquo; → list / &ldquo;Ingen åpne oppgaver&rdquo; / &ldquo;Kunne ikke laste oppgaver&rdquo;. The header shows the open-task count. Use <code>&lt;task-add-modal&gt;</code> alongside the list to add new tasks.</p>
                    <p><strong>Interactions.</strong> Toggling a checkbox opens the embedded <code>&lt;task-complete-modal&gt;</code>; on confirm the component calls <code>service.toggle(id, comment)</code> and then re-loads. The 📓 note button opens a <code>&lt;modal-container&gt;</code> wrapping <code>&lt;task-note&gt;</code>; on save it calls <code>service.update(id, { note })</code>. The ✕ delete button calls <code>service.remove(id)</code> after a <code>confirm()</code>.</p>
                    <p><strong>Events</strong> (bubbling, composed):</p>
                    <ul>
                        <li><code>task:completed</code> with <code>{ id, comment }</code> &mdash; after a successful complete</li>
                        <li><code>task:deleted</code> with <code>{ id }</code> &mdash; after a successful delete</li>
                        <li><code>task-open-list:toggle</code> with <code>{ id, checkbox }</code> &mdash; fallback when the embedded complete modal isn&apos;t available</li>
                        <li><code>mention-clicked</code> &mdash; bubbled from rendered <code>@mentions</code></li>
                    </ul>`,
                tag: 'task-open-list',
                attrs: [
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                ],
            },
            'task-add-modal': {
                desc: `<p><strong>&lt;task-add-modal&gt;</strong> renders a small <code>+</code> trigger button that opens a <code>&lt;modal-container&gt;</code> wrapping a <code>&lt;task-create&gt;</code> form. Designed for sidebar/header use where space is tight.</p>
                    <p><strong>Behavior:</strong> the modal stays open after a task is created so the user can add several in a row. Dismissed only by the default Lukk button, the ✕ corner button, Esc or backdrop click.</p>
                    <p><strong>Attributes</strong> (forwarded to <code>&lt;task-create&gt;</code>): <code>tasks_service</code>, <code>placeholder</code>, <code>button-label</code>. Trigger styling: <code>trigger-label</code> (default <code>+</code>), <code>trigger-title</code>.</p>
                    <p><strong>Methods:</strong> <code>open()</code>, <code>close()</code>.</p>
                    <p><strong>Events:</strong> bubbles <code>task:created</code> from the embedded <code>&lt;task-create&gt;</code>.</p>`,
                tag: 'task-add-modal',
                attrs: [
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'placeholder', type: 'text', default: 'Beskriv oppgaven…' },
                    { name: 'button-label', type: 'text', default: 'Legg til' },
                    { name: 'trigger-label', type: 'text', default: '+' },
                    { name: 'trigger-title', type: 'text', default: 'Ny oppgave' },
                ],
            },
            'task-create': {
                desc: `<p><strong>&lt;task-create&gt;</strong> is a small reusable form &mdash; one input, one submit button &mdash; for creating a task. Used standalone in the tasks page and embedded in a <code>&lt;modal-container&gt;</code>.</p>
                    <p><strong>Domain:</strong> <code>tasks</code> &mdash; reads from <code>tasks_service</code>. Calls <code>service.create(text)</code>; the service is expected to return either the created task or <code>{ task, tasks }</code>.</p>
                    <p><strong>Attributes:</strong> <code>placeholder</code>, <code>button-label</code>, <code>compact</code> (boolean &mdash; smaller layout for sidebars).</p>
                    <p><strong>Lifecycle.</strong> Trims input on submit; ignores empty submissions. Disables the button while in flight; re-enables on success/failure. Clears input and re-focuses on success. On error shows an inline error and keeps the input so the user can retry.</p>
                    <p><strong>Events</strong> (bubbling, composed):</p>
                    <ul>
                        <li><code>task:created</code> with <code>{ task, tasks }</code></li>
                        <li><code>task:create-failed</code> with <code>{ error, text }</code></li>
                    </ul>`,
                tag: 'task-create',
                attrs: [
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'placeholder', type: 'text', default: 'Ny oppgave...' },
                    { name: 'button-label', type: 'text', default: 'Legg til' },
                    { name: 'compact', type: 'bool' },
                ],
            },
            'task-complete-modal': {
                desc: `<p><strong>&lt;task-complete-modal&gt;</strong> is a centered modal that confirms completion of a single task and lets the user attach an optional comment. The component is dumb &mdash; it does not load or save anything. The host opens the modal with a task object and a callback that receives the result.</p>
                    <p><strong>Methods:</strong></p>
                    <ul>
                        <li><code>open(task, callback)</code> &mdash; sets the task, shows the modal, stores the callback. The textarea is cleared and focused. The callback runs once with one of:
                            <ul>
                                <li><code>{ confirmed: true,  id, comment }</code></li>
                                <li><code>{ confirmed: false, id }</code></li>
                            </ul>
                        </li>
                        <li><code>close()</code> &mdash; hides the modal silently (callback is dropped).</li>
                    </ul>
                    <p><strong>Keyboard:</strong> Esc cancels, Ctrl/⌘ + Enter confirms. Backdrop click and the ✕ button cancel.</p>
                    <p><strong>Try it:</strong> click the button below to open the modal. The result of the callback is logged inside the page (and not via the events panel, since this component does not emit events).</p>`,
                rawHtml: `<button type="button" id="dbg-ctm-trigger" class="btn"
                    style="padding:8px 14px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:8px;font-weight:600;cursor:pointer">Fullfør «Send rapport til @anna»</button>
                    <pre id="dbg-ctm-out" style="margin-top:10px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;min-height:42px;white-space:pre-wrap"></pre>
                    <task-complete-modal id="dbg-ctm"></task-complete-modal>
                    <script>
                        customElements.whenDefined('task-complete-modal').then(function(){
                            var modal = document.getElementById('dbg-ctm');
                            var btn = document.getElementById('dbg-ctm-trigger');
                            var out = document.getElementById('dbg-ctm-out');
                            btn.addEventListener('click', function(){
                                modal.open({ id: 't42', text: 'Send rapport til @anna før fredag' }, function(res){
                                    out.textContent = JSON.stringify(res, null, 2);
                                });
                            });
                        });
                    <\/script>`,
            },
            'task-note-modal': {
                desc: `<p><strong>&lt;task-note-modal&gt;</strong> is a centered modal that edits a task's note (markdown). The component is dumb &mdash; it does not load or save anything. The host opens the modal with a task object (including any existing note) and a callback that receives the result.</p>
                    <p><strong>Methods:</strong></p>
                    <ul>
                        <li><code>open(task, callback)</code> &mdash; shows the modal, fills the textarea with <code>task.note</code>, focuses it. The callback runs once with one of:
                            <ul>
                                <li><code>{ saved: true,  id, note }</code></li>
                                <li><code>{ saved: false, id }</code></li>
                            </ul>
                        </li>
                        <li><code>close()</code> &mdash; hides the modal silently (callback is dropped).</li>
                    </ul>
                    <p><strong>Keyboard:</strong> Esc cancels, Ctrl/⌘ + Enter saves. Backdrop click and the ✕ button cancel.</p>`,
                rawHtml: `<button type="button" id="dbg-tnm-trigger" class="btn"
                    style="padding:8px 14px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:8px;font-weight:600;cursor:pointer">Rediger notat for «Send rapport til @anna»</button>
                    <pre id="dbg-tnm-out" style="margin-top:10px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;min-height:42px;white-space:pre-wrap"></pre>
                    <task-note-modal id="dbg-tnm"></task-note-modal>
                    <script>
                        customElements.whenDefined('task-note-modal').then(function(){
                            var modal = document.getElementById('dbg-tnm');
                            var btn = document.getElementById('dbg-tnm-trigger');
                            var out = document.getElementById('dbg-tnm-out');
                            btn.addEventListener('click', function(){
                                modal.open({ id: 't42', text: 'Send rapport til @anna før fredag', note: 'Eksisterende notat. Husk vedlegg.' }, function(res){
                                    out.textContent = JSON.stringify(res, null, 2);
                                });
                            });
                        });
                    <\/script>`,
            },
            'task-note': {
                desc: `<p><strong>&lt;task-note&gt;</strong> is a dumb form for editing a task's note (markdown). It does not load or save anything &mdash; the host owns the service. Set the current task via the <code>.task</code> property and listen for <code>task-note:save</code> / <code>task-note:cancel</code>.</p>
                    <p>Typically embedded inside a <code>&lt;modal-container&gt;</code>; the modal-container's footer buttons trigger <code>el.save()</code>/<code>el.cancel()</code>.</p>
                    <p><strong>Properties:</strong> <code>.task = { id, text, note }</code>.</p>
                    <p><strong>Methods:</strong> <code>focus()</code>, <code>save()</code>, <code>cancel()</code>.</p>
                    <p><strong>Events</strong> (bubbles, composed):</p>
                    <ul>
                        <li><code>task-note:save</code> &mdash; <code>{ id, note }</code></li>
                        <li><code>task-note:cancel</code> &mdash; <code>{ id }</code></li>
                    </ul>
                    <p><strong>Keyboard:</strong> Ctrl/⌘ + Enter saves, Esc cancels.</p>`,
                rawHtml: `<button type="button" id="dbg-tn-trigger" class="btn"
                    style="padding:8px 14px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:8px;font-weight:600;cursor:pointer">Rediger notat for «Send rapport til @anna»</button>
                    <modal-container id="dbg-tn-modal" size="md">
                        <span slot="title">📓 Notat</span>
                        <task-note id="dbg-tn"></task-note>
                    </modal-container>
                    <script>
                        Promise.all([
                            customElements.whenDefined('task-note'),
                            customElements.whenDefined('modal-container'),
                        ]).then(function(){
                            var modal = document.getElementById('dbg-tn-modal');
                            var note = document.getElementById('dbg-tn');
                            var btn = document.getElementById('dbg-tn-trigger');
                            modal.setButtons([
                                { label: 'Avbryt', variant: 'ghost', action: function(){ note.cancel(); return false; } },
                                { label: '💾 Lagre', primary: true, action: function(){ note.save(); return false; } },
                            ]);
                            btn.addEventListener('click', function(){
                                note.task = { id: 't42', text: 'Send rapport til @anna før fredag', note: 'Eksisterende notat. Husk vedlegg.' };
                                modal.open();
                                setTimeout(function(){ note.focus(); }, 0);
                            });
                            note.addEventListener('task-note:save', function(){ modal.close(); });
                            note.addEventListener('task-note:cancel', function(){ modal.close(); });
                        });
                    <\/script>`,
            },
            'task-view': {
                desc: `<p><strong>&lt;task-view&gt;</strong> is a read-only detail panel that renders <em>every</em> attribute of a task: id, text, done, week, created, completedWeek/completedAt, author, responsible, dueDate, note and commentFile. Unknown future fields are appended at the end so the view doesn&apos;t silently drop schema additions.</p>
                    <p><strong>Usage.</strong> Set <code>.task = {…}</code> directly, or pass <code>taskid</code> + <code>tasks_service</code> to load the task by id from the service. <code>people_service</code> and <code>companies_service</code> are used to resolve <code>@mentions</code> in the text and to label <code>author</code> / <code>responsible</code>.</p>
                    <p><strong>Behaviour.</strong> An overdue <code>dueDate</code> on an open task is highlighted. <code>commentFile</code> is rendered as a link. The component emits no events &mdash; it&apos;s purely presentational.</p>`,
                rawHtml: `<task-view id="dbg-tv"
                        people_service="week-note-services.people_service"
                        companies_service="week-note-services.companies_service"></task-view>
                    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                        <button type="button" class="btn" data-tv="open"
                            style="padding:6px 12px;background:var(--accent);color:var(--text-on-accent);border:0;border-radius:6px;cursor:pointer">Open task</button>
                        <button type="button" class="btn" data-tv="done"
                            style="padding:6px 12px;background:var(--surface-alt);color:var(--text-strong);border:1px solid var(--border);border-radius:6px;cursor:pointer">Completed task</button>
                        <button type="button" class="btn" data-tv="overdue"
                            style="padding:6px 12px;background:var(--surface-alt);color:var(--text-strong);border:1px solid var(--border);border-radius:6px;cursor:pointer">Overdue task</button>
                        <button type="button" class="btn" data-tv="minimal"
                            style="padding:6px 12px;background:var(--surface-alt);color:var(--text-strong);border:1px solid var(--border);border-radius:6px;cursor:pointer">Minimal task</button>
                    </div>
                    <script>
                        customElements.whenDefined('task-view').then(function(){
                            var v = document.getElementById('dbg-tv');
                            var samples = {
                                open: {
                                    id: 't-open-1',
                                    text: 'Send rapport til @anna før fredag',
                                    done: false,
                                    week: '2026-W18',
                                    created: '2026-04-28T09:14:00.000Z',
                                    author: 'me',
                                    responsible: 'anna',
                                    dueDate: '2026-05-08',
                                    note: 'Husk å legge ved Q1-tallene og diagrammene fra @bob.'
                                },
                                done: {
                                    id: 't-done-1',
                                    text: 'Bestill nytt utstyr til @bob',
                                    done: true,
                                    week: '2026-W17',
                                    created: '2026-04-21T08:00:00.000Z',
                                    completedWeek: '2026-W18',
                                    completedAt: '2026-04-30T14:22:00.000Z',
                                    completed: '2026-04-30T14:22:00.000Z',
                                    author: 'me',
                                    responsible: 'me',
                                    commentFile: '2026-W18/oppgave-t-done-1.md'
                                },
                                overdue: {
                                    id: 't-overdue-1',
                                    text: 'Følg opp avtale med @globex',
                                    done: false,
                                    week: '2026-W16',
                                    created: '2026-04-13T10:00:00.000Z',
                                    author: 'me',
                                    responsible: 'me',
                                    dueDate: '2026-04-25'
                                },
                                minimal: {
                                    id: 't-min-1',
                                    text: 'Quick todo'
                                }
                            };
                            function set(k){ v.task = samples[k]; }
                            document.querySelectorAll('button[data-tv]').forEach(function(b){
                                b.addEventListener('click', function(){ set(b.dataset.tv); });
                            });
                            set('open');
                        });
                    <\/script>`,
            },
            'meeting-create': {
                desc: `<p><strong>&lt;meeting-create&gt;</strong> is a reusable form for creating a meeting &mdash; title, type, date, start/end, attendees, location and notes. Used inside the calendar page&apos;s create-meeting overlay.</p>
                    <p><strong>Domain:</strong> <code>meetings</code> &mdash; calls <code>meetings_service.create({...})</code> to persist the meeting.</p>
                    <p><strong>Type list source:</strong> reads from <code>settings_service.getMeetingTypes(context)</code>. The optional <code>context</code> attribute selects which context&apos;s types to load (defaults to the active context server-side). A parent may also set <code>el.types</code> as an explicit override (legacy <code>{key,label}</code> shape accepted).</p>
                    <p><strong>Attributes:</strong> <code>meetings_service</code>, <code>settings_service</code>, <code>context</code> (optional context id), <code>date</code> (defaults today), <code>start</code>, <code>end</code>, <code>type</code> (preselects the matching option). All visible attributes are observed and re-render the form.</p>
                    <p><strong>Time inputs.</strong> <code>Fra</code> and <code>Til</code> use the <a href="/debug/time-picker"><code>&lt;time-picker&gt;</code></a> component (5-minute step) instead of the native <code>&lt;input type=&quot;time&quot;&gt;</code> for consistent behavior across browsers.</p>
                    <p><strong>Form a11y.</strong> Every input has a unique <code>id</code> with a matching <code>for=</code> on its label, generated per instance to avoid id collisions when multiple <code>&lt;meeting-create&gt;</code> are mounted on one page.</p>
                    <p><strong>Lifecycle.</strong> Required field is the title. Submit disables the button while in flight; on success the form resets and emits an event. Cancel button emits a cancel event without touching the service.</p>
                    <p><strong>Events</strong> (bubbling, composed):</p>
                    <ul>
                        <li><code>meeting-create:created</code> with <code>{ meeting }</code></li>
                        <li><code>meeting-create:cancel</code></li>
                        <li><code>meeting-create:error</code> with <code>{ error }</code></li>
                    </ul>`,
                tag: 'meeting-create',
                attrs: [
                    { name: 'meetings_service', type: 'text', default: 'MockMeetingsService' },
                    { name: 'settings_service', type: 'text', default: 'MockSettingsService' },
                    { name: 'context', type: 'text', default: 'work' },
                    { name: 'date', type: 'text' },
                    { name: 'start', type: 'text' },
                    { name: 'end', type: 'text' },
                    { name: 'type', type: 'text' },
                ],
            },
            'meeting-create-modal': {
                desc: `<p><strong>&lt;meeting-create-modal&gt;</strong> is a thin wrapper around <a href="/debug/modal-container"><code>&lt;modal-container&gt;</code></a> + <a href="/debug/meeting-create"><code>&lt;meeting-create&gt;</code></a>. By default it renders a small <code>+</code> trigger button; on click the modal opens with the create-meeting form inside.</p>
                    <p><strong>Trigger appearance:</strong> override with <code>label</code> (default <code>+</code>) and <code>title</code> (default <code>Nytt møte</code>). The trigger is styled like the accent button used elsewhere in the sidebar, but the host is <code>display:inline-block</code> so it can be embedded next to other content.</p>
                    <p><strong>Form attributes</strong> (forwarded verbatim to the inner form): <code>meetings_service</code>, <code>settings_service</code>, <code>context</code>, <code>date</code>, <code>start</code>, <code>end</code>, <code>type</code>. Changing any attribute after the modal has been opened updates the live form.</p>
                    <p><strong>Public API:</strong> <code>el.open()</code> / <code>el.close()</code>. <code>el.types = [...]</code> injects an explicit type list onto the inner <code>&lt;meeting-create&gt;</code> (same shape as <code>&lt;meeting-create&gt;.types</code>).</p>
                    <p><strong>Lifecycle.</strong> The modal is created lazily on first <code>open()</code> and appended to <code>document.body</code> so it isn&apos;t clipped by ancestor <code>overflow</code>. It is removed automatically when the host disconnects.</p>
                    <p><strong>Events</strong> (bubbling, composed) re-emitted from the inner form, then the modal auto-closes for created/cancel:</p>
                    <ul>
                        <li><code>meeting-create:created</code> with <code>{ meeting }</code></li>
                        <li><code>meeting-create:cancel</code></li>
                        <li><code>meeting-create:error</code> with <code>{ error }</code></li>
                    </ul>`,
                tag: 'meeting-create-modal',
                attrs: [
                    { name: 'meetings_service', type: 'text', default: 'MockMeetingsService' },
                    { name: 'settings_service', type: 'text', default: 'MockSettingsService' },
                    { name: 'context', type: 'text', default: 'work' },
                    { name: 'label', type: 'text', default: '+' },
                    { name: 'title', type: 'text', default: 'Nytt møte' },
                    { name: 'date', type: 'text' },
                    { name: 'start', type: 'text' },
                    { name: 'end', type: 'text' },
                    { name: 'type', type: 'text' },
                ],
            },
            'date-time-picker': {
                desc: `<p><strong>&lt;date-time-picker&gt;</strong> is a custom calendar popup styled to match week-notes. It renders a Mon-first month grid (Norwegian weekday/month labels), prev/next navigation, an &ldquo;I dag&rdquo; (today) shortcut and Avbryt/OK actions. In <code>datetime</code> mode it also shows hour/minute selects (5-minute step).</p>
                    <p><strong>Used by:</strong> <code>wn-date-trigger.js</code> &mdash; the keyboard shortcut helper attached to the markdown editor that opens this picker on <code>Ctrl+D</code> (date) and <code>Ctrl+Shift+D</code> (date+time) and inserts <code>YYYY-MM-DD</code> / <code>YYYY-MM-DD HH:MM</code> at the caret.</p>
                    <p><strong>Attributes:</strong></p>
                    <ul>
                        <li><code>mode</code> &mdash; <code>"date"</code> (default) or <code>"datetime"</code></li>
                        <li><code>value</code> &mdash; initial value, format <code>YYYY-MM-DD</code> or <code>YYYY-MM-DD HH:MM</code>. Empty means today/now.</li>
                    </ul>
                    <p><strong>JS API:</strong> <code>el.value</code> getter/setter.</p>
                    <p><strong>Events.</strong> <code>datetime-selected</code> with detail <code>{ value }</code> when the user clicks OK / double-clicks a day / presses Enter. <code>datetime-cancelled</code> when Avbryt or Escape is used. Both bubble and are composed.</p>
                    <p><strong>Keyboard.</strong> Arrow keys navigate days, <code>Enter</code> commits (in <code>datetime</code> mode it advances day → hour → minute → commit), <code>Alt+Enter</code> commits from anywhere, <code>Escape</code> cancels.</p>`,
                tag: 'date-time-picker',
                attrs: [
                    { name: 'mode', type: 'select', options: ['date', 'datetime'], default: 'date' },
                    { name: 'value', type: 'text', default: '' },
                ],
            },
            'time-picker': {
                desc: `<p><strong>&lt;time-picker&gt;</strong> is a custom time-of-day input. It renders an hour <code>&lt;select&gt;</code> (00-23) and a minute <code>&lt;select&gt;</code> snapped to a configurable <code>step</code> (default 5 minutes), giving consistent UI across browsers — Chrome's native <code>&lt;input type=&quot;time&quot;&gt;</code> ignores <code>step</code> for the spinner.</p>
                    <p><strong>Form-associated.</strong> When inside a <code>&lt;form&gt;</code>, the current value is reported as a form value under the <code>name</code> attribute, so <code>FormData</code> picks it up automatically. <code>required</code> is honored via <code>ElementInternals.setValidity</code>; <code>checkValidity()</code> / <code>reportValidity()</code> are exposed on the element.</p>
                    <p><strong>Attributes:</strong></p>
                    <ul>
                        <li><code>value</code> &mdash; "HH:MM"; empty/missing means unset</li>
                        <li><code>name</code> &mdash; form-control name</li>
                        <li><code>step</code> &mdash; minute granularity (1, 5, 10, 15, 20, 30, 60). Default 5</li>
                        <li><code>min</code>, <code>max</code> &mdash; "HH:MM" clamps for the hour list</li>
                        <li><code>disabled</code>, <code>required</code></li>
                        <li><code>aria-label</code> &mdash; falls back to <code>name</code> or <code>"tid"</code></li>
                    </ul>
                    <p><strong>JS API:</strong> <code>el.value</code> getter/setter; setter parses & rounds to step. <code>el.checkValidity()</code>, <code>el.reportValidity()</code>.</p>
                    <p><strong>Events.</strong> Standard <code>change</code> event (bubbling, composed); detail: <code>{ value }</code>.</p>`,
                tag: 'time-picker',
                attrs: [
                    { name: 'value', type: 'text', default: '08:30' },
                    { name: 'name', type: 'text', default: 'start' },
                    { name: 'step', type: 'select', options: ['1', '5', '10', '15', '20', '30', '60'], default: '5' },
                    { name: 'min', type: 'text', default: '' },
                    { name: 'max', type: 'text', default: '' },
                    { name: 'disabled', type: 'bool', default: false },
                    { name: 'required', type: 'bool', default: false },
                    { name: 'aria-label', type: 'text', default: '' },
                ],
            },
            'upcoming-meetings': {
                desc: `<p><strong>&lt;upcoming-meetings&gt;</strong> is the &ldquo;Kommende møter&rdquo; sidebar list. It loads all meetings, keeps the ones starting within the next <code>days</code> days, and renders each as a small card with date/time, title, attendees and a deep link to the calendar week (<code>/calendar/&lt;week&gt;#m-&lt;id&gt;</code>).</p>
                    <p><strong>Domain:</strong> <code>meetings</code> &mdash; primary service from <code>meetings_service</code>. Also reads <code>people_service</code> and <code>companies_service</code> for attendee mention rendering.</p>
                    <p><strong>Attributes:</strong> <code>days</code> (default <code>14</code>) &mdash; the look-ahead window in days.</p>
                    <p><strong>Lifecycle.</strong> Parallel fetch on connect; re-renders on any service attribute change. States: &ldquo;Laster…&rdquo;, list, &ldquo;Ingen kommende møter&rdquo;, error message.</p>
                    <p><strong>Events.</strong> <code>upcoming-meetings:open</code> with <code>{ id, week }</code> when a card link is activated (cancelable). <code>mention-clicked</code> bubbles up from attendee mentions.</p>`,
                tag: 'upcoming-meetings',
                attrs: [
                    { name: 'meetings_service', type: 'text', default: 'MockMeetingsService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                    { name: 'days', type: 'text', default: '14' },
                ],
            },
            'today-calendar': {
                desc: `<p><strong>&lt;today-calendar&gt;</strong> is a sidebar widget that shows <em>today</em>'s meetings inside a single-day <code>&lt;week-calendar&gt;</code> column. Used on the home page below <code>&lt;upcoming-meetings&gt;</code>.</p>
                    <p><strong>Domain:</strong> <code>meetings</code> &mdash; primary service from <code>meetings_service</code> (<code>list({ week })</code> + <code>listTypes()</code>). Also fetches <code>/api/contexts</code> for <code>workHours</code> / <code>visibleStartHour</code> / <code>visibleEndHour</code> and propagates them to the inner grid.</p>
                    <p><strong>Create.</strong> A <code>+ Nytt</code> button in the heading and a right-click / dblclick on the grid both open an overlay with <code>&lt;meeting-create&gt;</code>. Pre-fills date/time from the picked slot (or today, blank time, when opened from the header button), with end = start + <code>defaultMeetingMinutes</code> from settings. Esc / backdrop / ✕ closes. On <code>meeting-create:created</code> the overlay closes and the grid re-loads.</p>
                    <p><strong>Auto-advance.</strong> Listens to <code>nav-meta:newDay</code> on <code>document</code>, so when the wall clock crosses midnight the heading and grid roll over without a page reload. Also re-loads on <code>context-selected</code>.</p>
                    <p><strong>Events.</strong> Forwards <code>week-calendar:item-selected</code> and <code>open-item-selected</code> from the inner grid (bubbles).</p>`,
                tag: 'today-calendar',
                attrs: [
                    { name: 'meetings_service', type: 'text', default: 'MockMeetingsService' },
                    { name: 'settings_service', type: 'text', default: 'MockSettingsService' },
                ],
            },
            'results-page': {
                desc: `<p><strong>&lt;results-page&gt;</strong> is the SPA replacement for <code>/results</code>. Lists all results grouped by ISO week (descending) with a &ldquo;Nytt resultat&rdquo; header button and per-row edit / delete actions. Edit and create both use a shadow-local modal (Esc cancels, Ctrl/⌘+Enter saves).</p>
                    <p><strong>Domain:</strong> <code>results</code>. Also reads <code>people_service</code> + <code>companies_service</code> for <code>@mention</code> rendering via <code>linkMentions</code> + <code>&lt;entity-mention&gt;</code> chips.</p>
                    <p><strong>Hash deep-link.</strong> <code>#r-&lt;id&gt;</code> scrolls to and briefly flashes the matching card.</p>
                    <p><strong>Events.</strong> None of its own &mdash; mutations go directly through the service.</p>`,
                tag: 'results-page',
                attrs: [
                    { name: 'results_service', type: 'text', default: 'MockResultsService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                ],
            },
            'week-results': {
                desc: `<p><strong>&lt;week-results&gt;</strong> is the &ldquo;Resultater&rdquo; section of a week block. It loads all results, filters to a single ISO week, and renders each as a row with date, title, and any <code>@mentions</code>.</p>
                    <p><strong>Domain:</strong> <code>results</code> &mdash; from <code>results_service</code>. Also reads <code>people_service</code> + <code>companies_service</code> for mention rendering.</p>
                    <p><strong>Attributes:</strong> <code>week</code> &mdash; ISO week (<code>YYYY-WNN</code>).</p>
                    <p><strong>Lifecycle.</strong> Parallel fetch on any attribute change. Header shows the count. Renders nothing when the week has no results (the section is omitted by the host); otherwise emits a heading and the list.</p>
                    <p><strong>Events.</strong> None of its own. <code>mention-clicked</code> bubbles from rendered mentions.</p>`,
                tag: 'week-results',
                attrs: [
                    { name: 'results_service', type: 'text', default: 'MockResultsService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                    { name: 'week', type: 'select', options: weeks, default: weeks[0] || '' },
                ],
            },
            'task-completed': {
                desc: `<p><strong>&lt;task-completed&gt;</strong> is the &ldquo;Fullførte oppgaver&rdquo; section of a week block. It loads all tasks, keeps the ones whose <code>completedWeek</code> equals the configured week, and renders each as a row with a strike-through label, optional comment, and an &ldquo;Angre&rdquo; button.</p>
                    <p><strong>Domain:</strong> <code>tasks</code> &mdash; from <code>tasks_service</code>. Plus <code>people_service</code> + <code>companies_service</code> for mentions.</p>
                    <p><strong>Attributes:</strong> <code>week</code> &mdash; ISO week.</p>
                    <p><strong>Events.</strong> <code>task-completed:undo</code> with <code>{ id }</code> (cancelable, bubbling, composed) when the Angre button is pressed; the host page is responsible for calling the service and re-rendering.</p>`,
                tag: 'task-completed',
                attrs: [
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                    { name: 'week', type: 'select', options: weeks, default: weeks[0] || '' },
                ],
            },
            'week-section': {
                desc: `<p><strong>&lt;week-section&gt;</strong> is one whole week block on the home page: heading (with week pill, date range and counts), a grid of note cards, an embedded <code>&lt;week-results&gt;</code>, and an embedded <code>&lt;task-completed&gt;</code>.</p>
                    <p><strong>Domain:</strong> <code>notes</code> &mdash; from <code>notes_service</code>. Forwards <code>results_service</code>, <code>tasks_service</code>, <code>people_service</code>, <code>companies_service</code> to children.</p>
                    <p><strong>Note-card data flow.</strong> <code>&lt;note-card&gt;</code> is a dumb component; the section calls <code>service.list(week)</code> for the file list, then <code>service.card(week, file)</code> in parallel for each note. Cards are rendered as bare placeholders (<code>data-card-key</code>); after render, the section walks the shadow root and pushes the data via <code>setData()</code>.</p>
                    <p><strong>Attributes:</strong> <code>week</code> (auto-detects current ISO week if missing), <code>current</code> (boolean &mdash; visual highlight for the current week).</p>
                    <p><strong>Events.</strong> Re-emits <code>note:view</code>/<code>note:present</code>/<code>note:edit</code> by translating the dumb card's <code>view</code>/<code>present</code>/<code>edit</code> events. Also <code>week-section:summarize</code> and <code>week-section:show-summary</code> from the &ldquo;Oppsummer&rdquo; button. <code>delete</code> bubbles up unchanged.</p>`,
                tag: 'week-section',
                attrs: [
                    { name: 'notes_service', type: 'text', default: 'MockNotesService' },
                    { name: 'results_service', type: 'text', default: 'MockResultsService' },
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                    { name: 'week', type: 'select', options: weeks, default: weeks[0] || '' },
                    { name: 'current', type: 'bool', default: false },
                ],
            },
            'week-list': {
                desc: `<p><strong>&lt;week-list&gt;</strong> is the top-level feed of weekly notes used on the home page. It is a thin orchestrator: it asks <code>NotesService.listWeeks()</code> for the list of known ISO weeks (<code>YYYY-WNN</code>), then renders one <code>&lt;week-section&gt;</code> per week in the order returned (newest first by convention).</p>
                    <p><strong>Domain:</strong> <code>notes</code> &mdash; reads its primary service from <code>notes_service</code>.</p>
                    <p><strong>Service forwarding.</strong> Each <code>&lt;week-section&gt;</code> needs several services to render its full content (notes, results, completed tasks, plus people/companies for mention rendering). Rather than wiring every child individually, the host sets the attributes on <code>&lt;week-list&gt;</code> and they are forwarded as-is to every child. Only attributes actually present are forwarded:</p>
                    <ul>
                        <li><code>notes_service</code> &mdash; required; week-list uses it itself for <code>listWeeks()</code> and forwards it</li>
                        <li><code>results_service</code> &mdash; forwarded to <code>&lt;week-section&gt;</code> for the result count + result list</li>
                        <li><code>tasks_service</code> &mdash; forwarded for completed-task count and the completed list</li>
                        <li><code>people_service</code>, <code>companies_service</code> &mdash; forwarded so child cards can resolve <code>@mentions</code></li>
                    </ul>
                    <p><strong>Lifecycle.</strong> Reloads when <code>notes_service</code> changes. Renders &ldquo;Laster uker…&rdquo; while loading, &ldquo;Kunne ikke laste uker&rdquo; on error, and &ldquo;Ingen uker funnet&rdquo; when the list is empty.</p>
                    <p><strong>Events.</strong> None of its own &mdash; events come from descendants (<code>view</code>/<code>edit</code>/<code>delete</code>/<code>present</code> from <code>&lt;note-card&gt;</code>, etc.) and bubble freely.</p>`,
                tag: 'week-list',
                attrs: [
                    { name: 'notes_service', type: 'text', default: 'MockNotesService' },
                    { name: 'results_service', type: 'text', default: 'MockResultsService' },
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                ],
            },
            'week-pill': {
                desc: `<p><strong>&lt;week-pill&gt;</strong> is a tiny inline badge that displays an ISO week as <code>U&lt;NN&gt;</code> (e.g. <code>U18</code>). Used in week headings, sidebars, and anywhere a compact week reference is needed.</p>
                    <p><strong>Domain:</strong> none &mdash; presentational only.</p>
                    <p><strong>Attributes:</strong> <code>week</code> &mdash; ISO week (<code>YYYY-WNN</code>). The pill renders <code>U</code> + the two-digit week number; the full week is shown in a <code>title</code> tooltip.</p>
                    <p><strong>Lifecycle.</strong> Stateless. Re-renders when <code>week</code> changes.</p>
                    <p><strong>Events.</strong> Cancelable bubbling <code>week-clicked</code> with <code>{ year, weekNumber }</code> (numbers) on click.</p>`,
                tag: 'week-pill',
                attrs: [{ name: 'week', type: 'select', options: weeks, default: weeks[0] || '' }],
            },
            'global-search': {
                desc: `<p><strong>&lt;global-search&gt;</strong> is the singleton command-bar / search modal triggered from the navbar's 🔍 button or <kbd>Ctrl+K</kbd>. Light-DOM via <code>&lt;slot&gt;</code> so server-rendered shell HTML stays styled.</p>
                    <p><strong>Domain:</strong> <code>search</code> &mdash; from <code>search_service</code>. The service is expected to expose <code>search(text) → results</code> and (optionally) <code>embedSearch(text) → results</code> for the embedding-based mode toggle.</p>
                    <p><strong>API.</strong> <code>openSearch()</code>, <code>closeSearch()</code>. Also responds to the window event <code>search:open</code>.</p>
                    <p><strong>Lifecycle.</strong> Debounced query as the user types; arrow-key navigation through results; Enter activates. Esc / backdrop click closes.</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>search:open</code>, <code>search:close</code></li>
                        <li><code>element-selected</code> with the chosen result &mdash; the host page does the navigation</li>
                    </ul>`,
                rawHtml: `<button class="btn-summarize" onclick="document.querySelector('global-search').openSearch()">🔎 Open search</button>
                    <button class="btn-summarize" onclick="document.querySelector('global-search').closeSearch()" style="background:var(--text-muted)">Close</button>
                    <global-search search_service="MockSearchService"></global-search>`,
            },
            'markdown-preview': {
                desc: `<p><strong>&lt;markdown-preview&gt;</strong> renders markdown to HTML (via <code>window.marked</code>) inside a scrollable shadow-DOM viewport. Designed to pair with a textarea for editor live preview.</p>
                    <p><strong>Domain:</strong> <code>notes</code> (optional, used for relative-link resolution); from <code>notes_service</code>.</p>
                    <p><strong>Attributes / API:</strong></p>
                    <ul>
                        <li><code>value</code> (or <code>el.value</code>) &mdash; the markdown source</li>
                        <li><code>placeholder</code> &mdash; shown when the value is empty</li>
                        <li><code>offset</code> &mdash; programmatic scroll position in pixels (host writes do not re-emit the scroll event)</li>
                    </ul>
                    <p><strong>Events.</strong> <code>markdown-preview:scroll</code> with <code>{ offset, scrollHeight, clientHeight }</code> on user-initiated scroll &mdash; suppressed when the host writes <code>offset</code> programmatically. This lets editors implement two-pane scroll-sync without feedback loops.</p>
                    <p><strong>Theming.</strong> Pure CSS variables, so it adopts the active app theme inside its shadow DOM.</p>`,
                rawHtml: `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                        <label style="font-size:0.85em;color:var(--text-muted)">offset (px):</label>
                        <input id="mp-off" type="range" min="0" max="800" step="10" value="0" style="flex:1" />
                        <input id="mp-off-num" type="number" min="0" max="2000" step="10" value="0" style="width:80px;padding:3px 6px;border:1px solid var(--border);border-radius:4px" />
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:stretch">
                        <textarea id="mp-src" style="min-height:320px;padding:10px;font-family:ui-monospace,monospace"># Long document\n\nParagraph one — try scrolling the preview to test the scroll event.\n\n## Section A\n${Array.from({length:20}, (_,i)=>`Line ${i+1} of section A. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`).join('\\n\\n')}\n\n## Section B\n${Array.from({length:20}, (_,i)=>`Line ${i+1} of section B. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`).join('\\n\\n')}\n\n## End</textarea>
                        <markdown-preview id="mp-out" notes_service="MockNotesService" style="max-height:320px" placeholder="Start typing markdown…"></markdown-preview>
                    </div>
                    <script>(function(){
                        var s=document.getElementById('mp-src'),o=document.getElementById('mp-out');
                        var off=document.getElementById('mp-off'),offNum=document.getElementById('mp-off-num');
                        function sync(){o.value=s.value;}
                        s.addEventListener('input',sync); sync();
                        function setOffset(v){var n=Number(v)||0;off.value=String(n);offNum.value=String(n);o.setAttribute('offset',String(n));}
                        off.addEventListener('input',function(){setOffset(off.value);});
                        offNum.addEventListener('input',function(){setOffset(offNum.value);});
                        o.addEventListener('markdown-preview:scroll',function(e){var n=Math.round(e.detail.offset);off.value=String(n);offNum.value=String(n);});
                    })();</script>`,
            },
            'note-editor': {
                desc: `<p><strong>&lt;note-editor&gt;</strong> is the standalone note authoring component used on <code>/editor/&hellip;</code> routes. Form layout: week selector, filename input, themes input, a markdown textarea on the left and a live <code>&lt;markdown-preview&gt;</code> on the right with synchronized scrolling.</p>
                    <p><strong>Domain:</strong> <code>notes</code> &mdash; from <code>notes_service</code>. The optional <code>preview_service</code> is forwarded to the embedded preview for relative-link resolution.</p>
                    <p><strong>Lifecycle.</strong> Loads existing content via <code>service.raw(week, file)</code> when both are present, otherwise starts blank. Save is via <code>service.save({ folder, file, content, tags, type, presentationStyle? })</code>; cancel emits an event. The textarea is wired to a shared <code>&lt;wn-autocomplete&gt;</code> popover for <code>@</code> (people), <code>#</code> (themes) and <code>{{</code> (templates) triggers, and the live preview runs <code>linkMentions</code> so <code>@person</code> / <code>@company</code> chips render the same way as on read pages.</p>
                    <p><strong>Scroll-sync.</strong> Listens for <code>markdown-preview:scroll</code> from the preview and reflects scroll position back to the textarea (and vice versa).</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>note-editor:saved</code> with <code>{ folder, file, path, closeAfter }</code></li>
                        <li><code>note-editor:cancel</code></li>
                    </ul>`,
                rawHtml: `<note-editor notes_service="MockNotesService" preview_service="MockNotesService"></note-editor>`,
            },
            'week-notes-calendar': {
                desc: `<p><strong>&lt;week-notes-calendar&gt;</strong> is the calendar <em>page</em> component: a toolbar (title, ISO-week badge, date range, prev/today/next nav buttons) wrapping an embedded <code>&lt;week-calendar&gt;</code>. Used on <code>/calendar</code> and <code>/calendar/&lt;week&gt;</code>.</p>
                    <p><strong>Domain:</strong> <code>meetings</code> &mdash; from <code>meetings_service</code>. The service supplies the meeting items for the current week.</p>
                    <p><strong>Settings.</strong> When the host injects a <code>settings</code> attribute (JSON, observed) or sets the matching <code>el.settings</code> property, the component reads <code>workHours</code> / <code>visibleStartHour</code> / <code>visibleEndHour</code> from it and forwards them to the inner grid. With no settings provided, the grid renders without work-hour bands.</p>
                    <p><strong>Routing.</strong> Reflects URL changes (<code>/calendar/YYYY-WNN</code>) to its internal <code>week</code> attribute and vice versa &mdash; nav button clicks update <code>history</code> via the SPA router.</p>
                    <p><strong>Events.</strong> <code>calendar:week-changed</code> with <code>{ week }</code> when the user navigates. Forwards <code>week-calendar:item-selected</code> and <code>open-item-selected</code> from the inner grid.</p>`,
                tag: 'week-notes-calendar',
                attrs: [
                    { name: 'meetings_service', type: 'text', default: 'MockMeetingsService' },
                    { name: 'week', type: 'text', default: '' },
                    { name: 'settings', type: 'json', mode: 'tree', default: '{"workHours":[{"start":"09:00","end":"17:00"},{"start":"09:00","end":"17:00"},{"start":"09:00","end":"17:00"},{"start":"09:00","end":"17:00"},{"start":"09:00","end":"15:00"},null,null]}' },
                ],
            },
            'week-calendar': (() => {
                const today = new Date();
                const yw = dateToIsoWeek(today);
                const monday = isoWeekMonday(yw);
                const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
                const fmt = d => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
                const fmtDay = i => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); return fmt(d); };
                const sample = [
                    { id: 'm1', startDate: fmtDay(0) + 'T09:00', endDate: fmtDay(0) + 'T10:00', heading: 'Stand-up', body: 'Team sync', type: 'meeting', moveable: true },
                    { id: 't1', startDate: fmtDay(1) + 'T13:00', endDate: fmtDay(1) + 'T14:30', heading: 'Skriv rapport', body: 'Q-rapport', type: 'task' },
                    { id: 'f1', startDate: fmtDay(2) + 'T08:30', endDate: fmtDay(2) + 'T11:00', heading: 'Fokustid', body: 'Refaktorering', type: 'focus', moveable: true },
                    { id: 'b1', startDate: fmtDay(3) + 'T15:00', endDate: fmtDay(3) + 'T16:00', heading: 'Blokkert', body: 'Lege', type: 'block' },
                    { id: 'n1', startDate: fmtDay(4) + 'T11:00', endDate: fmtDay(4) + 'T12:00', heading: 'Lunsj med Per', type: 'note' },
                    { id: 'v1', startDate: fmtDay(2), endDate: fmtDay(4), heading: 'Ferie', type: 'vacation' },
                    { id: 'v2', startDate: fmtDay(0), endDate: fmtDay(0), heading: 'Reisedag', type: 'travel' },
                ];
                const dayList = [0,1,2,3,4,5,6].map(fmtDay);
                return {
                    desc: `<p><strong>&lt;week-calendar&gt;</strong> is a pure presentation calendar grid &mdash; an N-day × N-hour matrix &mdash; with no toolbar and no service dependency. The host page provides items via the items API and the component renders them as positioned blocks.</p>
                        <p><strong>Domain:</strong> none &mdash; dumb component.</p>
                        <p><strong>Items API:</strong></p>
                        <ul>
                            <li><code>el.setItems(arr)</code> &mdash; replaces all items</li>
                            <li><code>el.addItem(item)</code> &mdash; adds one</li>
                            <li><code>el.clearItems()</code></li>
                            <li><code>el.items</code> &mdash; readonly current array</li>
                        </ul>
                        <p>Item shape: <code>{ id, startDate, endDate, heading, body?, type, moveable?, allDay? }</code>. <code>type</code> is matched against the registered <code>eventTypes</code> to colorize the block; items whose <code>type</code> isn&apos;t registered fall back to the built-in CSS palette. <strong>All-day items</strong> (<code>allDay:true</code>) are rendered as a thin colored bar in a dedicated track between the day headers and the time grid; they may span multiple days (use <code>startDate</code>/<code>endDate</code> as date-only ISO strings, both inclusive). Items extending beyond the visible week are clipped with squared-off ends.</p>
                        <p><strong>Layout attributes:</strong> <code>start-date</code>, <code>end-date</code> (ISO yyyy-mm-dd), <code>show-days</code> (e.g. <code>0-4</code> = Mon-Fri), <code>hour-start</code>/<code>hour-end</code>. Also <code>work-hours</code> JSON for the highlighted bands and <code>special-days</code> JSON for holidays / mid-week swap days.</p>
                        <p><strong>Event types (JS property):</strong> <code>el.eventTypes = [{ typeId, icon, name, color }]</code> &mdash; populates the right-click context menu, supplies the per-type background color for items, and is echoed back on <code>datePeriodSelected</code>.</p>
                        <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                        <ul>
                            <li><code>week-calendar:ready</code> after first render</li>
                            <li><code>week-calendar:item-selected</code> with <code>{ id, item }</code> when an item or all-day bar is clicked. Only one item can be selected at a time; selection is rendered with a dark outline and an open ↗ button. Clicking empty space clears the selection (no event).</li>
                            <li><code>open-item-selected</code> with <code>{ id, item }</code> when the user clicks the open ↗ button on the currently selected item.</li>
                            <li><code>datePeriodSelected</code> with <code>{ type, date, time, icon?, name? }</code> &mdash; emitted on empty-cell <em>double</em>-click (<code>type:'none'</code>) or after picking from the right-click context menu (<code>type:&lt;typeId&gt;</code>; menu requires <code>el.eventTypes</code>). Time is HH:MM, snapped to 15&nbsp;min.</li>
                        </ul>`,
                    tag: 'week-calendar',
                    attrs: [
                        { name: 'start-date', type: 'text', default: fmt(monday) },
                        { name: 'end-date', type: 'text', default: fmt(sunday) },
                        { name: 'show-days', type: 'text', default: '0-6' },
                        { name: 'work-hours', type: 'text', default: '[{"start":"08:00","end":"16:00"},{"start":"08:00","end":"16:00"},{"start":"08:00","end":"16:00"},{"start":"08:00","end":"16:00"},{"start":"08:00","end":"16:00"},null,null]' },
                        { name: 'special-days', type: 'json', mode: 'tree', default: JSON.stringify([{ date: dayList[2], name: 'Eksempel helligdag', workday: false }, { date: dayList[4], name: 'Inneklemt', workday: true }]) },
                        { name: 'hour-start', type: 'text', default: '' },
                        { name: 'hour-end', type: 'text', default: '' },
                    ],
                    extras: `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
                            <span style="color:var(--text-subtle);font-size:0.85em">items API:</span>
                            <button class="btn-summarize" id="wcAddItems">📌 Last sample</button>
                            <button class="btn-summarize" id="wcAddOne">➕ Random</button>
                            <button class="btn-summarize" id="wcClear" style="background:var(--text-muted)">🗑️ Tøm</button>
                            <span id="wcCount" style="color:var(--text-muted);font-family:ui-monospace,monospace;font-size:0.85em"></span>
                        </div>
                        <script>(function(){
                            const SAMPLE = ${JSON.stringify(sample)};
                            const DAYS = ${JSON.stringify(dayList)};
                            const TYPES = ['meeting','task','focus','note','block'];
                            const EVENT_TYPES = [
                                { typeId: 'meeting',  icon: '👥',  name: 'Møte',     color: '#4a90e2' },
                                { typeId: 'standup',  icon: '🔄',  name: 'Standup',  color: '#7ab648' },
                                { typeId: '1on1',     icon: '☕',  name: '1:1',      color: '#a05a2c' },
                                { typeId: 'workshop', icon: '🛠️', name: 'Workshop', color: '#e08a3c' },
                                { typeId: 'demo',     icon: '🎬',  name: 'Demo',     color: '#9b59b6' },
                                { typeId: 'focus',    icon: '🎯',  name: 'Fokustid', color: '#d35400' },
                                { typeId: 'block',    icon: '🔴',  name: 'Blokkert', color: '#c0392b' },
                                { typeId: 'social',   icon: '🎉',  name: 'Sosialt',  color: '#e91e63' },
                                { typeId: 'vacation', icon: '🌴',  name: 'Ferie',    color: '#2ecc71', allDay: true },
                                { typeId: 'travel',   icon: '✈️', name: 'Reise',    color: '#7f8c8d', allDay: true },
                            ];
                            const cnt = document.getElementById('wcCount');
                            const refresh = (cal) => { cnt.textContent = '(' + cal.items.length + ' item' + (cal.items.length === 1 ? '' : 's') + ')'; };
                            const wire = (cal) => {
                                document.getElementById('wcAddItems').onclick = () => { cal.setItems(SAMPLE); refresh(cal); };
                                document.getElementById('wcAddOne').onclick = () => {
                                    const i = Math.floor(Math.random() * DAYS.length);
                                    const h = 8 + Math.floor(Math.random() * 8);
                                    const t = TYPES[Math.floor(Math.random() * TYPES.length)];
                                    cal.addItem({ id: 'r-' + Date.now(), startDate: DAYS[i] + 'T' + String(h).padStart(2,'0') + ':00', endDate: DAYS[i] + 'T' + String(h+1).padStart(2,'0') + ':00', heading: 'Random', body: t, type: t });
                                    refresh(cal);
                                };
                                document.getElementById('wcClear').onclick = () => { cal.clearItems(); refresh(cal); };
                            };
                            const apply = (cal) => {
                                if (!cal) return;
                                customElements.whenDefined('week-calendar').then(() => {
                                    if (typeof cal.setItems !== 'function') return;
                                    wire(cal);
                                    cal.eventTypes = EVENT_TYPES;
                                    cal.setItems(SAMPLE);
                                    refresh(cal);
                                });
                            };
                            document.addEventListener('dbg:rebuilt', (e) => {
                                if (e.detail && e.detail.tag === 'week-calendar') apply(e.detail.el);
                            });
                        })();</script>`,
                };
            })(),
            'settings-page': {
                desc: `<p><strong>&lt;settings-page&gt;</strong> is the master/detail editor on <code>/settings</code>: a list of contexts on the left, a form on the right for the selected context (name, icon, description, theme, working hours per weekday, default meeting length, meeting types). Also hosts the application-wide settings tabs (search, summarization, themes, identity).</p>
                    <p><strong>Domains:</strong></p>
                    <ul>
                        <li><code>settings</code> &mdash; from <code>settings_service</code>; calls <code>getSettings(id)</code>, <code>saveSettings(id, data)</code>, <code>getMeetingTypes(id)</code> / <code>saveMeetingTypes(id, types)</code>, plus <code>listThemes()</code> / <code>createTheme()</code> / <code>updateTheme()</code> / <code>removeTheme()</code> for the theme picker</li>
                        <li><code>context</code> &mdash; from <code>context_service</code>; <code>list()</code>, <code>switchTo(id)</code>, plus context lifecycle (create/clone/disconnect/migrations) used by the rail and detail buttons</li>
                    </ul>
                    <p><strong>Working hours block.</strong> Horizontal cards, one per weekday (Mon-Sun). Each card has a <code>HH:MM-HH:MM</code> text input (regex parsed) or empty for &ldquo;ledig&rdquo;. The form serializes to a length-7 array before saving.</p>
                    <p><strong>Møtetyper editor.</strong> One row per type with: icon, color (<code>&lt;input type="color"&gt;</code>), key (lowercased, used as <code>typeId</code>), label. Saved as <code>settings.meetingTypes = [{key, icon, label, color}]</code>. Falls back to <code>DEFAULT_MEETING_TYPES</code> when empty. The color is consumed by <code>&lt;week-calendar&gt;</code> via its <code>eventTypes</code> property to colorize meeting blocks.</p>
                    <p><strong>Min identitet (👤 Bruker-fane).</strong> Per-context person picker that maps <code>@me</code> to a real person in the people register. Loads <code>GET /api/me</code> + <code>GET /api/people</code>; on submit calls <code>PUT /api/me</code> which writes to <code>data/user.json</code> &mdash; outside any context's git repo &mdash; so multiple users sharing a context each have their own mapping. Updates <code>window.mePersonKey</code> live on save.</p>
                    <p><strong>Lifecycle.</strong> Loads the context list on connect; when one is picked, fetches its settings and populates the form. Save is optimistic but writes through the service; on success re-renders the list to reflect rename/icon changes.</p>
                    <p><strong>Events.</strong> No bespoke events &mdash; navigation/reload happens through the context service.</p>`,
                rawHtml: `<settings-page settings_service="MockSettingsService" context_service="MockContextService"></settings-page>`,
            },
            'people-page': {
                desc: `<p><strong>&lt;people-page&gt;</strong> is the SPA replacement for <code>/people</code>: a tabbed master-list of <strong>Personer</strong>, <strong>Selskaper</strong>, and <strong>Steder</strong>, with cross-references back to tasks, meetings and results.</p>
                    <p><strong>Domains:</strong></p>
                    <ul>
                        <li><code>people</code> — <code>list/create/update/remove</code></li>
                        <li><code>companies</code> — <code>list/create/update/remove</code></li>
                        <li><code>places</code> — <code>list/create/update/remove</code></li>
                        <li><code>tasks</code>, <code>meetings</code>, <code>results</code> — read-only <code>list()</code> for cross-references</li>
                    </ul>
                    <p><strong>Tabs.</strong> Active tab is preserved in the URL hash (<code>#tab=people|companies|places</code>). Direct hash links like <code>#p-petter</code>, <code>#c-acmeas</code> or <code>#pl-mathallen</code> open the matching tab, expand the card and scroll to it.</p>
                    <p><strong>Filtering &amp; sort.</strong> Each tab has a free-text filter; the people tab additionally has sort (Navn ↑↓ / Referanser ↑↓) and a "Vis inaktive" toggle.</p>
                    <p><strong>Cross-references.</strong> Each card lists tasks, meetings and results that <code>@mention</code> the person/company. Mentions are resolved client-side from the loaded people/companies, so author names render properly. <em>Note references are not yet wired</em> — the legacy page reads markdown off disk; the SPA notes service does not expose that yet.</p>
                    <p><strong>Modals.</strong> Edit/create person and company live inside the shadow DOM. The place modal renders in the <em>light</em> DOM so Leaflet (CSS-scoping-sensitive) can mount its tile layer cleanly. Leaflet (CSS+JS) is loaded lazily the first time a place card opens or the place modal appears. The mini-maps inside place cards inject Leaflet's CSS into the shadow root via <code>@import</code>.</p>
                    <p><strong>Mutations.</strong> Save/delete go through the relevant service and the page reloads its data in place — no <code>location.reload()</code>.</p>`,
                rawHtml: `<people-page id="dbg-people-page"
                    people_service="MockPeopleService"
                    companies_service="MockCompaniesService"
                    places_service="MockPlacesService"
                    tasks_service="MockTaskService"
                    meetings_service="MockMeetingsService"
                    results_service="MockResultsService"></people-page>
                    <entity-callout id="dbg-pp-callout"></entity-callout>
                    <script>
                        Promise.all([
                            customElements.whenDefined('people-page'),
                            customElements.whenDefined('entity-callout'),
                        ]).then(function(){
                            var pp  = document.getElementById('dbg-people-page');
                            var cal = document.getElementById('dbg-pp-callout');
                            if (!pp || !cal) return;
                            return Promise.all([
                                Promise.resolve(window.MockPeopleService    ? window.MockPeopleService.list()    : []),
                                Promise.resolve(window.MockCompaniesService ? window.MockCompaniesService.list() : []),
                                Promise.resolve(window.MockPlacesService    ? window.MockPlacesService.list()    : []),
                            ]).then(function(arr){
                                var people = arr[0] || [], companies = arr[1] || [], places = arr[2] || [];
                                function lookup(kind, key){
                                    if (!key) return null;
                                    if (kind === 'person') {
                                        var lk = String(key).toLowerCase();
                                        var p = people.find(function(x){ return (x.key||'').toLowerCase() === lk || (x.name||'').toLowerCase() === lk; });
                                        if (!p) return null;
                                        var company = p.primaryCompanyKey ? companies.find(function(c){ return c.key === p.primaryCompanyKey; }) : null;
                                        return Object.assign({}, p, { company: company });
                                    }
                                    if (kind === 'company') return companies.find(function(c){ return c.key === key; }) || null;
                                    if (kind === 'place')   return places.find(function(x){ return x.key === key; }) || null;
                                    return null;
                                }
                                // Listen on the people-page itself (events bubble + composed
                                // out of its shadow). The page stays dumb; this debug host
                                // owns callout positioning and entity resolution.
                                ['person','company','place'].forEach(function(kind){
                                    pp.addEventListener('hover-' + kind, function(e){
                                        var d = e.detail || {};
                                        if (!d.entering) { cal.hide(); return; }
                                        cal.setData({ kind: kind, key: d.key, entity: lookup(kind, d.key), x: d.x, y: d.y });
                                    });
                                });
                            });
                        });
                    <\/script>`,
            },
        };

        const demo = DEMOS[current];
        const sidebar = `<aside class="dbg-side">
            <h2>Components</h2>
            ${COMPONENT_GROUPS.map(([label, items]) => `
                <div class="dbg-group-label">${label}</div>
                <nav class="dbg-nav">
                    ${items.map(c => `<a href="/debug/${c}" class="${c === current ? 'active' : ''}">${c}</a>`).join('')}
                </nav>
            `).join('')}
            <h2 style="margin-top:18px">Other</h2>
            <nav class="dbg-nav">
                <a href="/debug/services">services</a>
                <a href="/debug/data-shapes">data shapes</a>
                <a href="/debug/tests">tests</a>
            </nav>
        </aside>`;

        // Shared event names to log/cancel
        const EVENTS = [
            'mention-clicked',
            'nav-clicked',
            'view', 'present', 'edit', 'delete',
            'task-open-list:toggle', 'task-open-list:note',
            'task-completed:undo',
            'week-section:summarize', 'week-section:show-summary',
            'note:view', 'note:present', 'note:edit',
            'week-clicked',
            'search:open', 'search:close',
            'element-selected',
            'upcoming-meetings:open',
            'help:close',
            'week-calendar:ready', 'week-calendar:item-selected', 'open-item-selected',
            'datePeriodSelected',
            'nav-meta:newMinute', 'nav-meta:newHour', 'nav-meta:newDay', 'nav-meta:newWeek', 'nav-meta:newMonth', 'nav-meta:newYear',
            'meeting-create:created', 'meeting-create:cancel', 'meeting-create:error',
            'note-editor:saved', 'note-editor:cancel',
            'task:created', 'task:create-failed',
            'task:completed', 'task:uncompleted',
            'task-note:save', 'task-note:cancel',
            'modal-open', 'modal-close',
            'markdown-preview:scroll',
            'calendar:week-changed',
            'context-selected',
            'datetime-selected', 'datetime-cancelled',
            'toggle',
            'select-person', 'select-company', 'select-meeting', 'select-result', 'select-task',
            'hover-person',  'hover-company',  'hover-place',  'hover-meeting',  'hover-result',  'hover-task',
        ];

        const html = `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <title>Debug · ${current}</title>
    <link rel="stylesheet" href="/themes/paper.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsoneditor@10.1.0/dist/jsoneditor.min.css">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>if(window.marked&&marked.use)marked.use({breaks:true,gfm:true});</script>
    <script src="https://cdn.jsdelivr.net/npm/jsoneditor@10.1.0/dist/jsoneditor.min.js"></script>
    <script type="module" src="/components/_shared.js"></script>
    <script defer src="/debug/_mock-services.js"></script>
    <script type="module" src="/components/nav-meta.js"></script>
    <script type="module" src="/components/nav-button.js"></script>
    <script type="module" src="/components/ctx-switcher.js"></script>
    <script type="module" src="/components/modal-container.js"></script>
<script type="module" src="/components/help-modal.js"></script>
    <script type="module" src="/components/json-table.js"></script>
    <script type="module" src="/components/note-card.js"></script>
    <script type="module" src="/components/note-view.js"></script>
    <script type="module" src="/components/note-meta-view.js"></script>
    <script type="module" src="/components/note-meta-panel.js"></script>
    <script type="module" src="/components/task-open-list.js"></script>
    <script type="module" src="/components/task-create.js"></script>
    <script type="module" src="/components/task-add-modal.js"></script>
    <script type="module" src="/components/task-note.js"></script>
    <script type="module" src="/components/task-complete-modal.js"></script>
    <script type="module" src="/components/task-note-modal.js"></script>
    <script type="module" src="/components/task-edit-modal.js"></script>
    <script type="module" src="/components/meeting-create.js"></script>
    <script type="module" src="/components/meeting-create-modal.js"></script>
    <script type="module" src="/components/upcoming-meetings.js"></script>
    <script type="module" src="/components/today-calendar.js"></script>
    <script type="module" src="/components/week-results.js"></script>
    <script type="module" src="/components/task-completed.js"></script>
    <script type="module" src="/components/task-view.js"></script>
    <script type="module" src="/components/week-section.js"></script>
    <script type="module" src="/components/week-list.js"></script>
    <script type="module" src="/components/week-pill.js"></script>
    <script type="module" src="/components/global-search.js"></script>
    <script type="module" src="/components/markdown-preview.js"></script>
    <script type="module" src="/components/note-editor.js"></script>
    <script type="module" src="/components/week-calendar.js"></script>
    <script type="module" src="/components/week-notes-calendar.js"></script>
    <script type="module" src="/components/settings-page.js"></script>
    <script type="module" src="/components/company-card.js"></script>
    <script type="module" src="/components/person-card.js"></script>
    <script type="module" src="/components/place-card.js"></script>
    <script type="module" src="/components/entity-callout.js"></script>
<script type="module" src="/components/entity-mention.js"></script>
<script type="module" src="/components/inline-action.js"></script>
<script type="module" src="/components/inline-task.js"></script>
<script type="module" src="/components/inline-result.js"></script>
<script type="module" src="/components/icon-picker.js"></script>
<script type="module" src="/components/date-time-picker.js"></script>
<script type="module" src="/components/tag-editor.js"></script>
<script type="module" src="/components/people-page.js"></script>
<script type="module" src="/components/results-page.js"></script>
    <style>
        body { font-family: var(--font-family, -apple-system, sans-serif); font-size: var(--font-size, 16px); margin: 0; line-height: 1.6; color: var(--text-strong); background: var(--bg); }
        .dbg-page { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
        .dbg-side { background: var(--surface-head); border-right: 1px solid var(--border-faint); padding: 16px 14px; position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; }
        .dbg-side h2 { font-family: Georgia, serif; color: var(--accent); margin: 0 0 10px; font-size: 1.05em; }
        .dbg-nav { display: flex; flex-direction: column; gap: 2px; }
        .dbg-nav a { display: block; padding: 6px 10px; border-radius: 4px; color: var(--text); text-decoration: none; font-family: ui-monospace, monospace; font-size: 0.88em; }
        .dbg-nav a:hover { background: var(--surface-alt); }
        .dbg-nav a.active { background: var(--accent); color: var(--text-on-accent, white); }
        .dbg-group-label { font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 12px 8px 4px; }
        .dbg-group-label:first-of-type { margin-top: 0; }
        .dbg-main { padding: 20px 26px; max-width: 1100px; }
        .dbg-head { margin-bottom: 14px; }
        .dbg-head h1 { font-family: Georgia, serif; color: var(--accent); font-size: 1.4em; margin: 0 0 4px; }
        .dbg-head .desc { color: var(--text-muted); font-size: 0.9em; }
        a { color: var(--accent); }
        week-section, week-results, task-completed, task-open-list, upcoming-meetings, note-card { display: block; }
        .h-week { font-family: Georgia, serif; font-size: 1.6em; color: var(--accent); margin: 8px 0 14px; display: flex; align-items: baseline; gap: 12px; }
        .h-week .meta { font-style: italic; color: var(--text-subtle); font-size: 0.55em; margin-left: auto; }
        .pill { display: inline-block; background: var(--surface-alt); color: var(--text-muted-warm); padding: 2px 8px; border-radius: 10px; font-size: 0.7em; font-weight: 600; }
        .pill.live { font-size: 0.5em; letter-spacing: 0.06em; text-transform: uppercase; }
        .sec-h, .side-h { font-family: Georgia, serif; color: var(--accent); margin: 14px 0 8px; font-size: 1em; }
        .sec-h .c, .side-h .c { color: var(--text-subtle); font-weight: 400; }
        .empty-quiet { color: var(--text-subtle); font-style: italic; font-size: 0.9em; }
        .older-week { margin: 10px 0; border-top: 1px solid var(--border-faint); }
        .older-week > summary { list-style: none; cursor: pointer; padding: 8px 0; display: flex; align-items: baseline; gap: 10px; color: var(--text-muted); }
        .older-week > summary::-webkit-details-marker { display: none; }
        .older-week .caret { color: var(--text-subtle); transition: transform 0.15s; }
        .older-week[open] .caret { transform: rotate(90deg); }
        .older-title { font-weight: 600; color: var(--text-strong); }
        .older-meta { font-size: 0.85em; color: var(--text-subtle); margin-left: auto; }
        .older-body { padding: 6px 0 14px; }
        .week-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
        .btn-summarize { font-size: 0.8em; padding: 4px 10px; background: var(--accent); color: var(--text-on-accent, white); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
        .week-title-actions { margin: 4px 0 10px; }
        .note-card { padding: 10px 14px; margin: 6px 0; background: var(--surface); border: 1px solid var(--border-faint); border-radius: 6px; }
        .note-card .note-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .note-card .note-actions { display: inline-flex; gap: 6px; }
        .note-card .note-actions button, .note-card .note-actions a { background: none; border: none; cursor: pointer; font-size: 1em; color: var(--text-muted); text-decoration: none; }
        .note-card .note-body { margin-top: 6px; color: var(--text-muted); font-size: 0.9em; }
        .row { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 0.9em; }
        .row.done { color: var(--text-subtle); text-decoration: line-through; }
        .row .when { margin-left: auto; font-size: 0.78em; color: var(--text-subtle); }
        .result { padding: 8px 10px; margin: 6px 0; background: var(--surface); border: 1px solid var(--border-faint); border-left: 3px solid var(--accent); border-radius: 4px; }
        .result .meta { display: flex; justify-content: space-between; font-size: 0.78em; color: var(--text-subtle); margin-top: 4px; }
        .sidebar-meeting { position: relative; padding: 8px 10px; margin: 6px 0; background: var(--surface); border: 1px solid var(--border-faint); border-left: 3px solid var(--accent); border-radius: 4px; font-size: 0.85em; }
        .sidebar-meeting .mtg-when { color: var(--text-muted); font-size: 0.85em; }
        .sidebar-meeting .mtg-when strong { color: var(--accent); }
        .sidebar-meeting .mtg-meta { margin-top: 4px; color: var(--text-muted-warm); font-size: 0.85em; }
        .sidebar-mtg-note { position: absolute; top: 6px; right: 6px; text-decoration: none; opacity: 0.55; }
        .upcoming-cal-link a { font-size: 0.85em; color: var(--accent); }
        .mention-link { color: var(--accent); text-decoration: none; cursor: pointer; }
        .nav-brand { color: var(--accent); font-family: Georgia, serif; font-weight: 700; text-decoration: none; }
        .nav-links { display: inline-flex; gap: 8px; }
        .dbg-attrs { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border-faint); border-radius: 6px; margin-bottom: 12px; font-size: 0.88em; }
        .dbg-attrs label { display: inline-flex; gap: 6px; align-items: center; color: var(--text-muted); }
        .dbg-attrs input[type=text], .dbg-attrs select { padding: 3px 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 4px; font: inherit; }
        .dbg-attrs textarea { padding: 6px 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 4px; font: inherit; font-family: ui-monospace, monospace; font-size: 0.85em; min-width: 360px; resize: vertical; }
        .dbg-attrs label.ta-row { flex: 1 1 100%; align-items: flex-start; flex-direction: column; gap: 4px; }
        .dbg-attrs label.ta-row textarea { width: 100%; box-sizing: border-box; }
        .dbg-attrs label.json-row { flex: 1 1 100%; align-items: flex-start; flex-direction: column; gap: 4px; }
        .dbg-attrs .json-editor-mount { width: 100%; height: 280px; box-sizing: border-box; }
        .dbg-attrs .json-error { color: #c0392b; font-family: ui-monospace, monospace; font-size: 0.8em; margin-top: 2px; min-height: 1em; }
        .dbg-attrs code { color: var(--accent); }
        #dbgEvents { font-family: ui-monospace, monospace; font-size: 0.78em; color: var(--text-muted); background: var(--surface-alt); border: 1px solid var(--border-faint); border-radius: 4px; padding: 0; min-height: 22px; overflow: hidden; position: fixed; top: 12px; right: 12px; bottom: 12px; width: 320px; z-index: 50; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; flex-direction: column; }
        #dbgEvents .dbg-events-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--border-faint); background: var(--surface); font-weight: 600; color: var(--text-strong); }
        #dbgEvents .dbg-events-head button { font: inherit; font-size: 0.85em; padding: 2px 8px; border: 1px solid var(--border); background: var(--surface-alt); color: var(--text-strong); border-radius: 3px; cursor: pointer; }
        #dbgEvents .dbg-events-head button:hover { background: var(--surface); }
        #dbgEventsLog { flex: 1; overflow-y: auto; padding: 8px; margin: 0; white-space: pre-wrap; font: inherit; }
        #dbgHost { border: 1px dashed var(--border); padding: 14px; border-radius: 6px; background: var(--surface); }
        .dbg-main { padding-right: 350px; }
        @media (max-width: 900px) { #dbgEvents { position: static; width: auto; max-height: 200px; margin-top: 14px; } .dbg-main { padding-right: 26px; } }
        ${demo.extraStyle || ''}
    </style>
</head>
<body>
    <div class="dbg-page">
        ${sidebar}
        <main class="dbg-main">
            <div class="dbg-head">
                <h1>🧪 ${current}</h1>
                <div class="desc">${demo.desc}</div>
            </div>
            ${demo.tag && demo.attrs && demo.attrs.length > 0 ? `<div class="dbg-attrs" id="dbgAttrs">
                <span style="color:var(--text-subtle)">attributes:</span>
                ${demo.attrs.map(a => {
                    const nm = `dbg-${a.name}`;
                    if (a.type === 'bool') {
                        return `<label><input type="checkbox" id="${nm}" name="${nm}" data-attr="${a.name}"${a.default ? ' checked' : ''} /> <code>${a.name}</code></label>`;
                    }
                    if (a.type === 'select') {
                        const opts = (a.options || []).map(o => `<option value="${escapeHtml(o)}"${o === a.default ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
                        return `<label for="${nm}"><code>${a.name}</code><select id="${nm}" name="${nm}" data-attr="${a.name}">${opts || '<option value="">(none)</option>'}</select></label>`;
                    }
                    if (a.type === 'textarea') {
                        return `<label class="ta-row" for="${nm}"><code>${a.name}</code><textarea id="${nm}" name="${nm}" data-attr="${a.name}" rows="${a.rows || 3}" spellcheck="false">${escapeHtml(a.default || '')}</textarea></label>`;
                    }
                    if (a.type === 'json') {
                        const def = a.default || '';
                        return `<label class="json-row"><code>${a.name}</code>`
                            + `<div class="json-editor-mount" data-json-for="${a.name}" data-json-mode="${escapeHtml(a.mode || 'tree')}" data-json-default="${escapeHtml(def)}"></div>`
                            + `<div class="json-error" data-json-error-for="${a.name}"></div>`
                            + `<input type="hidden" name="${nm}" data-attr="${a.name}" value="${escapeHtml(def)}" />`
                            + `</label>`;
                    }
                    return `<label for="${nm}"><code>${a.name}</code><input type="text" id="${nm}" name="${nm}" data-attr="${a.name}" value="${escapeHtml(a.default || '')}" /></label>`;
                }).join('')}
            </div>` : ''}
            ${demo.extras || ''}
            <div id="dbgHost">${demo.rawHtml || (demo.tag ? `<${demo.tag}></${demo.tag}>` : '')}</div>
            <div id="dbgEvents">
                <div class="dbg-events-head"><span>events</span><button type="button" id="dbgEventsClear">Clear</button></div>
                <pre id="dbgEventsLog">(none)</pre>
            </div>
        </main>
    </div>
    <script>
        (function () {
            const events = document.getElementById('dbgEventsLog');
            const clearBtn = document.getElementById('dbgEventsClear');
            const log = (line) => {
                const t = new Date().toISOString().slice(11, 19);
                if (events.textContent === '(none)') events.textContent = '';
                events.textContent = '[' + t + '] ' + line + '\\n' + events.textContent;
            };
            if (clearBtn) clearBtn.addEventListener('click', () => { events.textContent = '(none)'; });
            const NAMES = ${JSON.stringify(EVENTS)};
            NAMES.forEach(name => {
                document.addEventListener(name, (e) => log(name + ' ' + JSON.stringify(e.detail || {})));
            });
            // Cancel cancelable events so we just observe (don't navigate / open modals).
            ['mention-clicked', 'view', 'present', 'edit', 'delete', 'upcoming-meetings:open', 'note:view', 'note:present', 'note:edit', 'week-clicked', 'context-selected'].forEach(name => {
                document.addEventListener(name, (e) => { if (e.cancelable) e.preventDefault(); }, true);
            });

            // Attribute editor: rebuild the live host element on input change.
            const TAG = ${JSON.stringify(demo.tag || '')};
            const attrPanel = document.getElementById('dbgAttrs');
            const host = document.getElementById('dbgHost');
            if (TAG && attrPanel) {
                const rebuild = () => {
                    const el = document.createElement(TAG);
                    attrPanel.querySelectorAll('[data-attr]').forEach(input => {
                        const name = input.dataset.attr;
                        if (input.type === 'checkbox') {
                            if (input.checked) el.setAttribute(name, '');
                        } else if (input.value !== '') {
                            el.setAttribute(name, input.value);
                        }
                    });
                    host.innerHTML = '';
                    host.appendChild(el);
                    log('rebuilt <' + TAG + '> ' + Array.from(el.attributes).map(a => a.name + (a.value ? '=' + JSON.stringify(a.value) : '')).join(' '));
                    document.dispatchEvent(new CustomEvent('dbg:rebuilt', { detail: { tag: TAG, host: host, el: el } }));
                };
                attrPanel.addEventListener('change', rebuild);
                attrPanel.addEventListener('input', (e) => {
                    if (e.target.matches('input[type=text], textarea')) rebuild();
                });

                // Mount jsoneditor for any data-json-for slots.
                const editors = new Map();
                attrPanel.querySelectorAll('.json-editor-mount').forEach(mount => {
                    const name = mount.dataset.jsonFor;
                    const mode = mount.dataset.jsonMode || 'tree';
                    const errEl = attrPanel.querySelector('[data-json-error-for="' + name + '"]');
                    const hidden = attrPanel.querySelector('input[type=hidden][data-attr="' + name + '"]');
                    let initial = {};
                    try { initial = JSON.parse(mount.dataset.jsonDefault || '{}'); } catch (_) {}
                    if (typeof JSONEditor === 'undefined') {
                        mount.textContent = '(JSONEditor failed to load)';
                        return;
                    }
                    const editor = new JSONEditor(mount, {
                        mode: mode,
                        modes: ['tree', 'code', 'text', 'view'],
                        mainMenuBar: true,
                        navigationBar: false,
                        statusBar: false,
                        onChange: () => {
                            try {
                                const txt = editor.getText();
                                JSON.parse(txt);
                                if (errEl) errEl.textContent = '';
                                hidden.value = txt;
                                hidden.dispatchEvent(new Event('input', { bubbles: true }));
                            } catch (e) {
                                if (errEl) errEl.textContent = e.message;
                            }
                        },
                    }, initial);
                    editors.set(name, editor);
                });

                rebuild();
            }
        })();
    </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }
    };
};
