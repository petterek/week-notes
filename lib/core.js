const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ROOT_DIR = path.join(__dirname, '..');
const { marked } = require('marked');
marked.use({ breaks: true, gfm: true });
const { execSync } = require('child_process');
const { Worker } = require('worker_threads');
const crypto = require('crypto');
const { dateToIsoWeek, isoWeekMonday, currentIsoWeek, shiftIsoWeek, getCurrentYearWeek, isoWeekToDateRange } = require('./dates');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const CONTEXTS_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const ACTIVE_FILE = path.join(CONTEXTS_DIR, '.active');
const APP_SETTINGS_FILE = path.join(CONTEXTS_DIR, 'app-settings.json');
const USER_FILE = path.join(CONTEXTS_DIR, 'user.json');

// Embedding models offered to the user. All are Xenova feature-extraction
// pipelines available via @huggingface/transformers. dimension is informational
// — the worker derives the actual dim from the first inference.
const EMBED_MODELS = [
    {
        id: 'Xenova/multilingual-e5-small',
        label: 'multilingual-e5-small',
        dim: 384,
        sizeMb: 130,
        languages: 'NO/EN/multi',
        description: 'Standard. Liten flerspråklig modell, fungerer godt på norsk og engelsk.',
        recommended: true,
    },
    {
        id: 'Xenova/multilingual-e5-base',
        label: 'multilingual-e5-base',
        dim: 768,
        sizeMb: 280,
        languages: 'NO/EN/multi',
        description: 'Større flerspråklig modell. Bedre kvalitet, treigere første gang.',
    },
    {
        id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        label: 'paraphrase-multilingual-MiniLM-L12-v2',
        dim: 384,
        sizeMb: 120,
        languages: 'multi',
        description: 'Flerspråklig MiniLM, optimalisert for parafraser/likhet.',
    },
    {
        id: 'Xenova/all-MiniLM-L6-v2',
        label: 'all-MiniLM-L6-v2',
        dim: 384,
        sizeMb: 25,
        languages: 'EN',
        description: 'Liten engelsk-bare modell. Veldig lett, dårlig på norsk.',
    },
    {
        id: 'Xenova/bge-small-en-v1.5',
        label: 'bge-small-en-v1.5',
        dim: 384,
        sizeMb: 35,
        languages: 'EN',
        description: 'BGE small (engelsk). God på engelsk, ikke flerspråklig.',
    },
    {
        id: 'Xenova/bge-base-en-v1.5',
        label: 'bge-base-en-v1.5',
        dim: 768,
        sizeMb: 110,
        languages: 'EN',
        description: 'BGE base (engelsk). Sterkere retrieval enn small, kun engelsk.',
    },
    {
        id: 'Xenova/all-mpnet-base-v2',
        label: 'all-mpnet-base-v2',
        dim: 768,
        sizeMb: 110,
        languages: 'EN',
        description: 'Mpnet base. Toppkvalitet på engelsk. Ikke flerspråklig.',
    },
    {
        id: 'Xenova/paraphrase-multilingual-mpnet-base-v2',
        label: 'paraphrase-multilingual-mpnet-base-v2',
        dim: 768,
        sizeMb: 280,
        languages: 'multi',
        description: 'Mpnet flerspråklig. Best kvalitet for flerspråklig likhet, men tung.',
    },
    {
        id: 'Xenova/gte-small',
        label: 'gte-small',
        dim: 384,
        sizeMb: 35,
        languages: 'EN',
        description: 'GTE small. Sterk engelsk retrieval i liten størrelse.',
    },
    {
        id: 'Xenova/gte-base',
        label: 'gte-base',
        dim: 768,
        sizeMb: 110,
        languages: 'EN',
        description: 'GTE base. Topp engelsk retrieval, mellomstor.',
    },
    {
        id: 'Xenova/jina-embeddings-v2-small-en',
        label: 'jina-embeddings-v2-small-en',
        dim: 512,
        sizeMb: 33,
        languages: 'EN',
        description: 'Jina v2 small. Lang kontekst (8k), kun engelsk.',
    },
    {
        id: 'Xenova/snowflake-arctic-embed-s',
        label: 'snowflake-arctic-embed-s',
        dim: 384,
        sizeMb: 33,
        languages: 'EN',
        description: 'Snowflake Arctic small. God balanse størrelse/kvalitet på engelsk.',
    },
];
const DEFAULT_EMBED_MODEL = 'Xenova/multilingual-e5-small';

// Local summarization models (seq2seq). Run via @huggingface/transformers
// 'summarization' pipeline in summarize-worker.js. distilbart-cnn-6-6 is the
// sweet spot for English; mT5_multilingual_XLSum is the only viable
// multilingual (incl. Norwegian) option but quality is mediocre.
const SUMMARIZE_MODELS = [
    {
        id: 'remote:github-models/gpt-4o-mini',
        label: 'GitHub Models · gpt-4o-mini',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Ekstern (krever GitHub-token via `gh auth` eller GH_TOKEN). Best kvalitet, ingen nedlasting.',
        remote: true,
        recommended: true,
    },
    {
        id: 'Xenova/distilbart-cnn-6-6',
        label: 'distilbart-cnn-6-6',
        sizeMb: 150,
        languages: 'EN',
        description: 'Lokal. DistilBART trent på CNN/DailyMail. God kvalitet, kun engelsk.',
    },
    {
        id: 'Xenova/distilbart-cnn-12-6',
        label: 'distilbart-cnn-12-6',
        sizeMb: 310,
        languages: 'EN',
        description: 'Større DistilBART. Bedre kvalitet enn 6-6, kun engelsk.',
    },
    {
        id: 'Xenova/bart-large-cnn',
        label: 'bart-large-cnn',
        sizeMb: 440,
        languages: 'EN',
        description: 'Full BART-large. Toppkvalitet på engelsk, tung å laste.',
    },
    {
        id: 'Xenova/t5-small',
        label: 't5-small',
        sizeMb: 60,
        languages: 'EN',
        description: 'T5 small ("summarize: ..."-prefiks). Veldig liten, middels kvalitet.',
    },
];
const DEFAULT_SUMMARIZE_MODEL = 'remote:github-models/gpt-4o-mini';

function getAppSettings() {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf-8')) || {}; } catch {}
    if (!s.vectorSearch || typeof s.vectorSearch !== 'object') {
        s.vectorSearch = { enabled: false, model: DEFAULT_EMBED_MODEL };
    }
    if (!s.vectorSearch.model || !EMBED_MODELS.some(m => m.id === s.vectorSearch.model)) {
        s.vectorSearch.model = DEFAULT_EMBED_MODEL;
    }
    s.vectorSearch.enabled = !!s.vectorSearch.enabled;
    if (!s.searchIndex || typeof s.searchIndex !== 'object') {
        s.searchIndex = { enabled: true };
    }
    s.searchIndex.enabled = s.searchIndex.enabled !== false;
    if (!s.summarization || typeof s.summarization !== 'object') {
        s.summarization = { enabled: false, model: DEFAULT_SUMMARIZE_MODEL };
    }
    if (!s.summarization.model || !SUMMARIZE_MODELS.some(m => m.id === s.summarization.model)) {
        s.summarization.model = DEFAULT_SUMMARIZE_MODEL;
    }
    s.summarization.enabled = !!s.summarization.enabled;
    return s;
}

function setAppSettings(next) {
    const cur = getAppSettings();
    const merged = Object.assign({}, cur, next || {});
    if (next && next.vectorSearch) {
        merged.vectorSearch = Object.assign({}, cur.vectorSearch, next.vectorSearch);
        if (!EMBED_MODELS.some(m => m.id === merged.vectorSearch.model)) {
            merged.vectorSearch.model = DEFAULT_EMBED_MODEL;
        }
        merged.vectorSearch.enabled = !!merged.vectorSearch.enabled;
    }
    if (next && next.searchIndex) {
        merged.searchIndex = Object.assign({}, cur.searchIndex, next.searchIndex);
        merged.searchIndex.enabled = merged.searchIndex.enabled !== false;
    }
    if (next && next.summarization) {
        merged.summarization = Object.assign({}, cur.summarization, next.summarization);
        if (!SUMMARIZE_MODELS.some(m => m.id === merged.summarization.model)) {
            merged.summarization.model = DEFAULT_SUMMARIZE_MODEL;
        }
        merged.summarization.enabled = !!merged.summarization.enabled;
    }
    try { fs.mkdirSync(path.dirname(APP_SETTINGS_FILE), { recursive: true }); } catch {}
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(merged, null, 2));
    return merged;
}

// Per-machine user identity. Lives at data/user.json — OUTSIDE any context's
// git repo (per-context git lives at data/<ctx>/.git), so it stays local to
// the user's machine and isn't synced when multiple users share a context.
//
// Shape: { contexts: [{ context, mePersonKey }] }
function getUser() {
    let u = {};
    try { u = JSON.parse(fs.readFileSync(USER_FILE, 'utf-8')) || {}; } catch {}
    if (!Array.isArray(u.contexts)) u.contexts = [];
    u.contexts = u.contexts.filter(e => e && typeof e === 'object' && typeof e.context === 'string');
    return u;
}

function getMePersonKey(ctxId) {
    if (!ctxId) return '';
    const u = getUser();
    const e = u.contexts.find(x => x.context === ctxId);
    return (e && typeof e.mePersonKey === 'string') ? e.mePersonKey : '';
}

function setMePersonKey(ctxId, key) {
    if (!ctxId) throw new Error('Mangler kontekst');
    const u = getUser();
    const safeKey = String(key || '').trim().toLowerCase();
    const idx = u.contexts.findIndex(x => x.context === ctxId);
    if (!safeKey) {
        if (idx >= 0) u.contexts.splice(idx, 1);
    } else if (idx >= 0) {
        u.contexts[idx].mePersonKey = safeKey;
    } else {
        u.contexts.push({ context: ctxId, mePersonKey: safeKey });
    }
    try { fs.mkdirSync(path.dirname(USER_FILE), { recursive: true }); } catch {}
    fs.writeFileSync(USER_FILE, JSON.stringify(u, null, 2));
    return safeKey;
}

const WEEK_NOTES_MARKER = '.week-notes';
const WEEK_NOTES_VERSION = (() => {
    try {
        return require('child_process')
            .execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
            .trim();
    } catch { return 'unknown'; }
})();
function writeMarker(dir) {
    try {
        fs.writeFileSync(
            path.join(dir, WEEK_NOTES_MARKER),
            JSON.stringify({ type: 'week-notes', version: WEEK_NOTES_VERSION }, null, 2) + '\n'
        );
    } catch (e) { console.error('writeMarker failed', e.message); }
}
function readMarker(dir) {
    try {
        const raw = fs.readFileSync(path.join(dir, WEEK_NOTES_MARKER), 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    return null;
}

function safeName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function listContexts() {
    try {
        const ids = fs.readdirSync(CONTEXTS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
            .map(d => d.name);
        const nameOf = (id) => {
            try {
                const s = JSON.parse(fs.readFileSync(path.join(CONTEXTS_DIR, id, 'settings.json'), 'utf-8'));
                return (s && typeof s.name === 'string' && s.name.trim()) || id;
            } catch { return id; }
        };
        return ids
            .map(id => ({ id, name: nameOf(id) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
            .map(x => x.id);
    } catch { return []; }
}

function getActiveContext() {
    let active = '';
    try { active = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim(); } catch {}
    const all = listContexts();
    if (active && all.includes(active)) return active;
    if (all.length === 0) return '';
    const first = all[0];
    try { fs.writeFileSync(ACTIVE_FILE, first); } catch {}
    return first;
}

function setActiveContext(name, opts) {
    const { skipPull = false } = opts || {};
    const safe = safeName(name);
    if (!safe) throw new Error('Ugyldig kontekstnavn');
    if (!listContexts().includes(safe)) throw new Error('Kontekst finnes ikke');
    // Commit any pending changes in the current context before switching
    let prevCtx = '';
    try {
        const current = (function(){ try { return fs.readFileSync(ACTIVE_FILE, 'utf-8').trim(); } catch { return ''; } })();
        prevCtx = current;
        if (current && current !== safe && listContexts().includes(current)) {
            const curDir = path.join(CONTEXTS_DIR, current);
            gitInitIfNeeded(curDir, getContextSettings(current).name || current);
            if (gitIsDirty(curDir)) {
                gitCommitAll(curDir, `Auto: bytter til ${safe} (${new Date().toISOString()})`);
            }
        }
    } catch (e) { console.error('pre-switch commit failed', e.message); }
    fs.writeFileSync(ACTIVE_FILE, safe);
    // Auto-commit on the previous ctx may have changed its tree; the
    // new ctx may be pulled below. Drop both caches to be safe.
    if (prevCtx) _cacheInvalidateContext(prevCtx);
    _cacheInvalidateContext(safe);
    // Pull the target context if it has a remote configured (skippable so
    // callers can defer the network call to a background task)
    if (!skipPull) {
        try { pullContextRemote(safe); }
        catch (e) { console.error('post-switch pull failed', e.message); }
    }
    return safe;
}

function pullContextRemote(name) {
    const safe = safeName(name);
    const targetDir = path.join(CONTEXTS_DIR, safe);
    const targetSettings = getContextSettings(safe);
    if (gitIsRepo(targetDir) && (targetSettings.remote || '').trim()) {
        try {
            git(targetDir, 'pull --ff-only --quiet');
            // Pull may have rewritten files; drop the whole ctx cache.
            _cacheInvalidateContext(safe);
        }
        catch (e) { console.error('git pull failed for', safe, e.message); }
    }
}

function createContext(rawName, settings, opts) {
    const force = !!(opts && opts.force);
    const safe = safeName(rawName);
    if (!safe) throw new Error('Ugyldig kontekstnavn');
    const dir = path.join(CONTEXTS_DIR, safe);
    if (fs.existsSync(dir)) throw new Error('Kontekst finnes allerede');
    fs.mkdirSync(dir, { recursive: true });
    const cfg = Object.assign({ name: rawName || safe, icon: '📁' }, settings || {});
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(cfg, null, 2));
    gitInitIfNeeded(dir, cfg.name);
    // Configure remote if supplied
    if ((cfg.remote || '').trim() && gitIsRepo(dir)) {
        try { git(dir, `remote add origin "${String(cfg.remote).replace(/"/g, '\\"')}"`); } catch (e) { console.error('git remote add failed', e.message); }
        const r = gitPullInitial(dir, { force });
        if (!r.ok && r.invalid) {
            const err = new Error(r.error);
            err.needsConfirm = true;
            // Roll back the whole context creation; user can retry with force.
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
            throw err;
        }
        if (!r.ok) console.error('initial git pull failed for', safe, r.error);
        // If we pulled into a remote that lacked the marker but user forced it,
        // (re)write the marker and commit it locally so the next push adds it.
        if (force) {
            writeMarker(dir);
            try {
                git(dir, `add "${WEEK_NOTES_MARKER}"`);
                git(dir, `commit -m "Mark as week-notes context" --no-verify`);
            } catch {}
        }
    }
    return safe;
}

function cloneContext(remoteUrl, rawName, opts) {
    const force = !!(opts && opts.force);
    const url = String(remoteUrl || '').trim();
    if (!url) throw new Error('Mangler remote-URL');
    let safe = safeName(rawName);
    if (!safe) {
        const m = url.match(/([^/:]+?)(?:\.git)?\/?$/);
        safe = safeName(m ? m[1] : '');
    }
    if (!safe) throw new Error('Kunne ikke utlede kontekstnavn fra remote');
    const dir = path.join(CONTEXTS_DIR, safe);
    if (fs.existsSync(dir)) throw new Error('Kontekst finnes allerede');
    try {
        require('child_process').execSync(`git clone --quiet "${url.replace(/"/g, '\\"')}" "${dir.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        throw new Error('git clone feilet: ' + ((e.stderr && e.stderr.toString()) || e.message));
    }
    try { git(dir, `config user.email "ukenotater@local"`); } catch {}
    try { git(dir, `config user.name "Ukenotater"`); } catch {}
    // Validate this is actually a week-notes repo before keeping the clone.
    const hasMarker = fs.existsSync(path.join(dir, WEEK_NOTES_MARKER));
    if (!hasMarker && !force) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        const err = new Error('Remote er ikke en week-notes repo (mangler .week-notes-fil)');
        err.needsConfirm = true;
        throw err;
    }
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8')); } catch {}
    cfg = Object.assign({ name: cfg.name || rawName || safe, icon: cfg.icon || '📁', description: cfg.description || '' }, cfg, { remote: url });
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(cfg, null, 2));
    if (!hasMarker && force) {
        // User confirmed; commit the marker so the next push includes it.
        try {
            git(dir, `add "${WEEK_NOTES_MARKER}"`);
            git(dir, `commit -m "Mark as week-notes context" --no-verify`);
        } catch {}
    }
    return safe;
}

function getContextSettings(name) {
    const safe = safeName(name);
    const bucket = _ctxCacheBucket(safe);
    if (bucket && bucket.settings) return { ...bucket.settings };
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(CONTEXTS_DIR, safe, 'settings.json'), 'utf-8')); }
    catch { data = { name: safe, icon: '📁' }; }
    if (bucket) bucket.settings = { ...data };
    return data;
}

const DISCONNECTED_FILE = path.join(CONTEXTS_DIR, '.disconnected.json');
function loadDisconnected() {
    try {
        const arr = JSON.parse(fs.readFileSync(DISCONNECTED_FILE, 'utf-8'));
        if (!Array.isArray(arr)) return [];
        // Dedupe by remote URL (case-insensitive), keeping the most recent entry.
        // Older entries earlier in the array are dropped if a later one shares the URL.
        const seen = new Map();
        for (const d of arr) {
            if (!d || typeof d !== 'object') continue;
            const key = String(d.remote || '').toLowerCase().trim() || ('id:' + (d.id || ''));
            seen.set(key, d);
        }
        return Array.from(seen.values());
    } catch { return []; }
}
function saveDisconnected(arr) {
    try { fs.mkdirSync(CONTEXTS_DIR, { recursive: true }); } catch {}
    try { fs.writeFileSync(DISCONNECTED_FILE, JSON.stringify(arr, null, 2)); }
    catch (e) { console.error('saveDisconnected failed', e.message); }
}

function disconnectContext(name) {
    const safe = safeName(name);
    if (!listContexts().includes(safe)) throw new Error('Kontekst finnes ikke');
    const dir = path.join(CONTEXTS_DIR, safe);
    const cfg = getContextSettings(safe);
    const remote = String(cfg.remote || '').trim();
    if (!remote) throw new Error('Konteksten har ingen remote — kan ikke koble fra trygt');
    if (!gitIsRepo(dir)) throw new Error('Konteksten er ikke et git-repo');
    // Commit any pending changes
    try {
        if (gitIsDirty(dir)) {
            git(dir, 'add -A');
            try { git(dir, `commit -m "Disconnect from week-notes (${new Date().toISOString()})" --no-verify`); } catch {}
        }
    } catch (e) { throw new Error('Klarte ikke å committe lokale endringer: ' + e.message); }
    // Push to origin so nothing is lost
    try {
        require('child_process').execSync('git push origin HEAD 2>&1', { cwd: dir, encoding: 'utf-8', timeout: 60000 });
    } catch (e) {
        throw new Error('git push feilet: ' + ((e.stdout || '') + (e.stderr || '') || e.message));
    }
    // Remember the URL before destroying the dir.
    // Dedupe by id AND remote so the same repo cloned under different names
    // doesn't accumulate stale entries.
    const normRemote = remote.toLowerCase();
    const list = loadDisconnected().filter(d => d.id !== safe && String(d.remote || '').toLowerCase() !== normRemote);
    list.push({
        id: safe,
        name: cfg.name || safe,
        icon: cfg.icon || '📁',
        remote: remote,
        disconnectedAt: new Date().toISOString()
    });
    saveDisconnected(list);
    // If this is the active context, clear it so a reload picks another
    try {
        const active = (function(){ try { return fs.readFileSync(ACTIVE_FILE, 'utf-8').trim(); } catch { return ''; } })();
        if (active === safe) { try { fs.unlinkSync(ACTIVE_FILE); } catch {} }
    } catch {}
    // Remove the working tree
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch (e) { throw new Error('Klarte ikke å slette mappen: ' + e.message); }
    return { id: safe, remote };
}

function forgetDisconnected(id) {
    const safe = safeName(id);
    saveDisconnected(loadDisconnected().filter(d => d.id !== safe));
}

function setContextSettings(name, data, opts) {
    const force = !!(opts && opts.force);
    const safe = safeName(name);
    if (!listContexts().includes(safe)) throw new Error('Kontekst finnes ikke');
    const dir = path.join(CONTEXTS_DIR, safe);
    // Sync git remote with settings.remote (if any). Validate BEFORE persisting settings,
    // so a bad remote URL doesn't get stored.
    try { gitInitIfNeeded(dir, data.name || safe); } catch {}
    if (gitIsRepo(dir)) {
        const desired = String(data.remote || '').trim();
        let current = '';
        try { current = git(dir, 'remote get-url origin').trim(); } catch {}
        if (desired && desired !== current) {
            const hadRemote = !!current;
            try { git(dir, hadRemote ? `remote set-url origin "${desired.replace(/"/g, '\\"')}"` : `remote add origin "${desired.replace(/"/g, '\\"')}"`); } catch (e) { console.error('git remote set failed', e.message); }
            const r = gitPullInitial(dir, { force });
            if (!r.ok && r.invalid) {
                // Roll back the remote change so settings stay consistent with git config.
                try { git(dir, hadRemote ? `remote set-url origin "${current.replace(/"/g, '\\"')}"` : 'remote remove origin'); } catch {}
                const err = new Error(r.error);
                err.needsConfirm = true;
                throw err;
            }
            if (!r.ok) console.error('initial git pull failed for', safe, r.error);
            if (force) {
                writeMarker(dir);
                try {
                    git(dir, `add "${WEEK_NOTES_MARKER}"`);
                    git(dir, `commit -m "Mark as week-notes context" --no-verify`);
                } catch {}
            }
        } else if (!desired && current) {
            try { git(dir, 'remote remove origin'); } catch {}
        }
    }
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(data, null, 2));
    writeMarker(dir);
    _cacheInvalidateSettings(safe);
    return data;
}

// All data paths resolve via the *current* active context, so switching is hot.
function dataDir() { return path.join(CONTEXTS_DIR, getActiveContext()); }
function tasksFile() { return path.join(dataDir(), 'tasks.json'); }
function notesMetaFile() { return path.join(dataDir(), 'notes-meta.json'); }
function notesMetaDir() { return path.join(dataDir(), 'notes-meta'); }
function notesMetaSidecarPath(week, file) {
    // Mirror layout: notes-meta/<week>/<file>.json
    return path.join(notesMetaDir(), week, file + '.json');
}
function peopleFile() { return path.join(dataDir(), 'people.json'); }
function resultsFile() { return path.join(dataDir(), 'results.json'); }
function meetingsFile() { return path.join(dataDir(), 'meetings.json'); }
function companiesFile() { return path.join(dataDir(), 'companies.json'); }
function placesFile() { return path.join(dataDir(), 'places.json'); }

// --- Git per context ---
function checkExternalTools() {
    const required = [
        { cmd: 'git', test: 'git --version', why: 'each context is a git repo (commit/push/pull)' }
    ];
    const optional = [
        { cmd: 'gh', test: 'gh --version', why: 'fetch GitHub auth token (otherwise set GH_TOKEN env var)' }
    ];
    const missing = [];
    for (const t of required) {
        try { execSync(t.test, { stdio: 'ignore' }); }
        catch { missing.push(t); }
    }
    if (missing.length) {
        console.error('\n❌ Required tools are missing:');
        for (const t of missing) console.error(`   - ${t.cmd}  (${t.why})`);
        console.error('\nInstall them and try again. Aborting.\n');
        process.exit(1);
    }
    for (const t of optional) {
        try { execSync(t.test, { stdio: 'ignore' }); }
        catch { console.warn(`⚠️  Optional tool not found: ${t.cmd}  (${t.why})`); }
    }
    try {
        const v = execSync('git --version', { encoding: 'utf-8' }).trim();
        console.log(`✓ ${v}`);
    } catch {}
}

function git(cwd, args) {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitIsRepo(dir) {
    try { return fs.existsSync(path.join(dir, '.git')); } catch { return false; }
}

function gitInitIfNeeded(dir, contextName) {
    if (gitIsRepo(dir)) return false;
    try {
        const branch = currentReleaseTag() || 'main';
        git(dir, `init -q -b ${branch}`);
        try { git(dir, `config user.email "ukenotater@local"`); } catch {}
        try { git(dir, `config user.name "Ukenotater"`); } catch {}
        try { git(dir, 'add -A'); } catch {}
        try { git(dir, `commit -q --allow-empty -m "Init kontekst: ${(contextName || path.basename(dir)).replace(/"/g, '\\"')}"`); } catch {}
        return true;
    } catch (e) {
        console.error('git init failed for', dir, e.message);
        return false;
    }
}

// Latest reachable release tag from the app repo HEAD (e.g. "v2"),
// or null if no tag is reachable / git is unavailable.
function currentReleaseTag() {
    try {
        return require('child_process').execSync('git describe --tags --abbrev=0', {
            cwd: ROOT_DIR,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim() || null;
    } catch { return null; }
}

function gitIsDirty(dir) {
    if (!gitIsRepo(dir)) return false;
    try { return git(dir, 'status --porcelain').trim().length > 0; }
    catch { return false; }
}

function gitCommitAll(dir, message) {
    if (!gitIsRepo(dir)) gitInitIfNeeded(dir);
    if (!gitIsDirty(dir)) return { ok: true, committed: false };
    try {
        git(dir, 'add -A');
        const safe = (message || 'Endringer').replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
        git(dir, `commit -q -m "${safe}"`);
        return { ok: true, committed: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function gitLastCommit(dir) {
    if (!gitIsRepo(dir)) return null;
    try {
        const out = git(dir, 'log -1 --format=%H%x09%cI%x09%s').trim();
        if (!out) return null;
        const [hash, iso, ...rest] = out.split('\t');
        return { hash: hash.slice(0, 7), date: iso, subject: rest.join('\t') };
    } catch { return null; }
}

function gitGetRemote(dir) {
    if (!gitIsRepo(dir)) return null;
    try { return git(dir, 'remote get-url origin').trim() || null; }
    catch { return null; }
}

function gitCurrentBranch(dir) {
    if (!gitIsRepo(dir)) return null;
    try {
        const out = git(dir, 'rev-parse --abbrev-ref HEAD').trim();
        return out === 'HEAD' ? null : out;
    } catch { return null; }
}

function gitRemoteHasFile(dir, branch, file) {
    try {
        require('child_process').execSync(`git cat-file -e origin/${branch}:${file}`, { cwd: dir, stdio: 'ignore' });
        return true;
    } catch { return false; }
}

function gitPullInitial(dir, opts) {
    const force = !!(opts && opts.force);
    if (!gitIsRepo(dir)) return { ok: false, error: 'Ikke et git-repo' };
    if (!gitGetRemote(dir)) return { ok: false, error: 'Ingen remote konfigurert' };
    try {
        const cp = require('child_process');
        cp.execSync('git fetch origin 2>&1', { cwd: dir, encoding: 'utf-8', timeout: 60000 });
        let branch = '';
        try { branch = git(dir, 'symbolic-ref --short refs/remotes/origin/HEAD').trim().replace(/^origin\//, ''); } catch {}
        if (!branch) {
            const heads = (() => { try { return git(dir, 'branch -r'); } catch { return ''; } });
            const list = heads().split('\n').map(s => s.trim());
            if (list.includes('origin/main')) branch = 'main';
            else if (list.includes('origin/master')) branch = 'master';
            else {
                const first = list.find(b => b.startsWith('origin/') && !b.includes('->'));
                if (first) branch = first.replace(/^origin\//, '');
            }
        }
        // Empty remote (no branches yet) — treat as a fresh push target, skip pull.
        if (!branch) return { ok: true, output: 'remote er tom — ingen pull nødvendig', empty: true };
        // Validate that this is actually a week-notes repo (must have .week-notes marker at root).
        if (!force && !gitRemoteHasFile(dir, branch, WEEK_NOTES_MARKER)) {
            return { ok: false, invalid: true, error: 'Remote er ikke en week-notes repo (mangler .week-notes på origin/' + branch + ')' };
        }
        const out = cp.execSync(`git pull origin ${branch} --allow-unrelated-histories --no-edit --no-rebase 2>&1`, { cwd: dir, encoding: 'utf-8', timeout: 60000 });
        return { ok: true, output: out.trim() };
    } catch (e) {
        return { ok: false, error: (e.stdout || '') + (e.stderr || '') || e.message };
    }
}

function gitPush(dir) {
    if (!gitIsRepo(dir)) return { ok: false, error: 'Ikke et git-repo' };
    if (!gitGetRemote(dir)) return { ok: false, error: 'Ingen remote konfigurert' };
    try {
        const out = require('child_process').execSync('git push origin HEAD 2>&1', { cwd: dir, encoding: 'utf-8', timeout: 60000 });
        return { ok: true, output: out.trim() };
    } catch (e) {
        return { ok: false, error: (e.stdout || '') + (e.stderr || '') || e.message };
    }
}

function gitPull(dir) {
    if (!gitIsRepo(dir)) return { ok: false, error: 'Ikke et git-repo' };
    if (!gitGetRemote(dir)) return { ok: false, error: 'Ingen remote konfigurert' };
    if (gitIsDirty(dir)) return { ok: false, error: 'Det finnes ucommittede endringer. Commit eller forkast før du puller.' };
    try {
        const out = require('child_process').execSync('git pull --ff-only --no-edit origin 2>&1', { cwd: dir, encoding: 'utf-8', timeout: 60000 });
        return { ok: true, output: out.trim() };
    } catch (e) {
        return { ok: false, error: (e.stdout || '') + (e.stderr || '') || e.message };
    }
}

function ensureAllContextsInitialised() {
    for (const id of listContexts()) {
        const dir = path.join(CONTEXTS_DIR, id);
        gitInitIfNeeded(dir, getContextSettings(id).name || id);
    }
}

// ----- Per-item collection storage -------------------------------------
//
// Records are stored as one JSON file per item under
//   data/<ctx>/<entity>/<idOrKey>.json
//
// During the transition we still fall back to the legacy single-array
// JSON file (data/<ctx>/<entity>.json) when the folder doesn't exist
// yet. The migration `split-entities-to-folders` (run from the settings
// page) does the one-time conversion and removes the legacy file.

// Filenames are restricted to a safe charset to avoid traversal.
function sanitizeItemFilename(s) {
    if (s === undefined || s === null) return '';
    const str = String(s);
    return str.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

function entityDir(name) { return path.join(dataDir(), name); }
function entityLegacyFile(name) { return path.join(dataDir(), name + '.json'); }

function readJsonDirAll(dirName) {
    const dir = entityDir(dirName);
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return null; }
    const items = [];
    for (const fname of entries) {
        if (!fname.endsWith('.json')) continue;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, fname), 'utf-8'));
            items.push(data);
        } catch { /* skip unreadable */ }
    }
    return items;
}

// ------------------------------------------------------------------
// In-memory cache keyed by context name. The server is the only writer,
// so we can keep a strong cache and invalidate at known write/state-
// change points:
//   - syncCollection                → invalidate (ctx, collection)
//   - setNoteMeta/deleteNoteMeta/saveNotesMeta → invalidate (ctx, notes-meta)
//   - setContextSettings            → invalidate (ctx, settings)
//   - setActiveContext              → invalidate (prev) + (next) entirely
//                                     (auto-commit on switch + git pull may
//                                      change files on disk)
//   - pullContextRemote / gitPull   → invalidate (ctx) entirely
//   - migration runs                → invalidate (ctx) entirely
// Returned values are always cloned so callers can mutate freely without
// corrupting the cached canonical copy.
// ------------------------------------------------------------------
const _ctxCache = new Map(); // ctxId -> { collections: Map<name,arr>, notesMeta?, settings? }

function _ctxCacheBucket(ctx) {
    if (!ctx) return null;
    let b = _ctxCache.get(ctx);
    if (!b) { b = { collections: new Map() }; _ctxCache.set(ctx, b); }
    return b;
}
function _cloneArray(arr) {
    // Shallow clone array + each item, sufficient for the load-mutate-save
    // pattern used throughout server.js (push/sort/splice + per-item field
    // updates).
    return arr.map(x => (x && typeof x === 'object' && !Array.isArray(x)) ? { ...x } : x);
}
function _cacheGetCollection(dirName) {
    const b = _ctxCacheBucket(getActiveContext());
    if (!b) return null;
    const arr = b.collections.get(dirName);
    return arr ? _cloneArray(arr) : null;
}
function _cacheSetCollection(dirName, items) {
    const b = _ctxCacheBucket(getActiveContext());
    if (!b) return;
    b.collections.set(dirName, _cloneArray(items));
}
function _cacheInvalidateCollection(dirName, ctx) {
    const target = ctx || getActiveContext();
    const b = _ctxCache.get(target);
    if (b) b.collections.delete(dirName);
}
function _cacheInvalidateNotesMeta(ctx) {
    const target = ctx || getActiveContext();
    const b = _ctxCache.get(target);
    if (b) {
        delete b.notesMeta;
        delete b.notesMetaLoadedWeeks;
    }
}
function _cacheInvalidateSettings(ctx) {
    const target = ctx || getActiveContext();
    const b = _ctxCache.get(target);
    if (b) delete b.settings;
}
function _cacheInvalidateContext(ctx) {
    if (ctx) _ctxCache.delete(ctx);
}

// Reads a per-item collection. Returns the array, or — if the folder
// doesn't exist yet — falls back to the legacy <entity>.json file.
function loadCollection(dirName) {
    const cached = _cacheGetCollection(dirName);
    if (cached) return cached;
    const fromDir = readJsonDirAll(dirName);
    let items;
    if (Array.isArray(fromDir)) {
        items = fromDir;
    } else {
        try {
            const arr = JSON.parse(fs.readFileSync(entityLegacyFile(dirName), 'utf-8'));
            items = Array.isArray(arr) ? arr : [];
        } catch { items = []; }
    }
    _cacheSetCollection(dirName, items);
    // Return a clone so callers can mutate freely.
    return _cloneArray(items);
}

// Pick a stable, filesystem-safe filename stem for an item.
// Prefer `key` for human-readable lookups (people/companies/places),
// fall back to `id`. Generate one if neither is present.
function itemStem(item, idField) {
    if (idField && item && item[idField] !== undefined && item[idField] !== '') {
        const s = sanitizeItemFilename(item[idField]);
        if (s) return s;
    }
    if (item && item.key) {
        const s = sanitizeItemFilename(item.key);
        if (s) return s;
    }
    if (item && item.id !== undefined && item.id !== '') {
        const s = sanitizeItemFilename(item.id);
        if (s) return s;
    }
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Write the entire collection by syncing the folder: create/update one
// file per item and remove any orphaned files. Matches the semantics
// of the old `saveX(array)` calls (bulk replace).
function syncCollection(dirName, items, idField) {
    const dir = entityDir(dirName);
    fs.mkdirSync(dir, { recursive: true });
    const wantFiles = new Set();
    const usedStems = new Set();
    for (const item of (items || [])) {
        let stem = itemStem(item, idField);
        // Avoid stem collisions across items (e.g. two people sharing a
        // key after a merge). Append a short suffix if needed.
        while (usedStems.has(stem)) {
            stem = stem + '_' + Math.random().toString(36).slice(2, 5);
        }
        usedStems.add(stem);
        const fname = stem + '.json';
        wantFiles.add(fname);
        fs.writeFileSync(path.join(dir, fname), JSON.stringify(item, null, 2), 'utf-8');
    }
    // Prune orphans.
    let existing;
    try { existing = fs.readdirSync(dir); } catch { existing = []; }
    for (const fname of existing) {
        if (!fname.endsWith('.json')) continue;
        if (!wantFiles.has(fname)) {
            try { fs.unlinkSync(path.join(dir, fname)); } catch {}
        }
    }
    _cacheInvalidateCollection(dirName);
}

function loadTasks() {
    return loadCollection('tasks').filter(t => !t.deleted);
}

function loadAllTasks() {
    // Includes tombstoned (deleted:true) entries; used so that
    // <inline-task> references in old notes can still resolve a task
    // text and render as "deleted".
    return loadCollection('tasks');
}

function saveTasks(tasks) {
    syncCollection('tasks', tasks, 'id');
}

// Extract every task id referenced by an inline marker in a note's content.
// Recognises {{?<id>}} (open) and {{!<id>}} (closed). The pre-save
// {{X}} form is not included here — those create new tasks (see save flow)
// and are rewritten to {{?<newId>}} before this runs.
function extractTaskRefs(content) {
    const ids = new Set();
    if (typeof content !== 'string' || !content) return ids;
    const re = /\{\{[!?]\s*([^{}\s]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(content)) !== null) ids.add(m[1]);
    return ids;
}

// Reconcile the list of notes that reference each task. `noteRef` is the
// canonical "<week>/<file>" string. `contentOnDisk` is the post-save
// content of that note. Walks all (non-deleted) tasks and:
//   - adds noteRef to t.noteRefs if the content has a marker for t.id
//   - removes noteRef from t.noteRefs if the content has no such marker
// Persists once if anything changed.
function syncTaskNoteRefs(noteRef, contentOnDisk) {
    if (!noteRef) return;
    const referencedIds = extractTaskRefs(contentOnDisk);
    const all = loadAllTasks();
    let changed = false;
    for (const t of all) {
        if (!t || !t.id) continue;
        const refs = Array.isArray(t.noteRefs) ? t.noteRefs.slice() : [];
        const has = refs.includes(noteRef);
        const should = referencedIds.has(t.id);
        if (should && !has) {
            refs.push(noteRef);
            t.noteRefs = refs;
            changed = true;
        } else if (!should && has) {
            t.noteRefs = refs.filter(r => r !== noteRef);
            changed = true;
        }
    }
    if (changed) saveTasks(all);
}

// Strip a noteRef from every task's noteRefs (used when a note is deleted).
function clearTaskNoteRef(noteRef) {
    if (!noteRef) return;
    const all = loadAllTasks();
    let changed = false;
    for (const t of all) {
        if (!t || !Array.isArray(t.noteRefs)) continue;
        if (t.noteRefs.includes(noteRef)) {
            t.noteRefs = t.noteRefs.filter(r => r !== noteRef);
            changed = true;
        }
    }
    if (changed) saveTasks(all);
}

// Standalone scanner that walks every weekly note in the active context,
// rebuilds each task's `noteRefs` from scratch, and writes them back.
// Lives in scripts/rebuild-task-refs.js so it can also be run from the
// CLI (e.g. for one-off backfills).
const { rebuild: rebuildTaskNoteRefsScript } = require('../scripts/rebuild-task-refs.js');
function rebuildTaskNoteRefs() {
    let dir;
    try { dir = dataDir(); } catch { return null; }
    if (!dir) return null;
    const summary = rebuildTaskNoteRefsScript(dir);
    // The script writes individual task files directly; invalidate the
    // in-memory tasks cache so subsequent loadTasks() picks up the new
    // noteRefs.
    try { _cacheInvalidateCollection('tasks'); } catch {}
    return summary;
}

function loadPeople() {
    const all = loadCollection('people');
    return all.filter(p => !p.deleted);
}

function loadAllPeople() {
    // Includes tombstoned (deleted:true) entries; used by syncMentions
    // to avoid auto-recreating people that the user explicitly deleted.
    return loadCollection('people');
}

function savePeople(people) {
    syncCollection('people', people, 'key');
}

function loadMeetings() {
    return loadCollection('meetings');
}

function saveMeetings(meetings) {
    syncCollection('meetings', meetings, 'id');
}

function loadCompanies() {
    return loadCollection('companies').filter(c => !c.deleted);
}
function loadAllCompanies() {
    return loadCollection('companies');
}
function saveCompanies(companies) {
    syncCollection('companies', companies, 'key');
}

function loadPlaces() {
    return loadCollection('places').filter(p => !p.deleted);
}
function loadAllPlaces() {
    return loadCollection('places');
}
function savePlaces(places) {
    syncCollection('places', places, 'key');
}

const DEFAULT_MEETING_TYPES = [
    { key: 'meeting', label: 'Møte', icon: '👥', mins: 60 },
    { key: '1on1', label: '1:1', icon: '☕', mins: 30 },
    { key: 'standup', label: 'Standup', icon: '🔄', mins: 15 },
    { key: 'workshop', label: 'Workshop', icon: '🛠️', mins: 120 },
    { key: 'demo', label: 'Demo', icon: '🎬', mins: 60 },
    { key: 'planning', label: 'Planlegging', icon: '📋', mins: 60 },
    { key: 'review', label: 'Gjennomgang', icon: '🔍', mins: 60 },
    { key: 'social', label: 'Sosialt', icon: '🎉', mins: 60 },
    { key: 'call', label: 'Telefon', icon: '📞', mins: 30 },
    { key: 'focus', label: 'Fokus', icon: '🎯', mins: 60 }
];
function meetingTypesFile(ctxId) { return path.join(CONTEXTS_DIR, ctxId || getActiveContext(), 'meeting-types.json'); }
function loadMeetingTypes(ctxId) {
    try {
        const arr = JSON.parse(fs.readFileSync(meetingTypesFile(ctxId), 'utf-8'));
        if (Array.isArray(arr)) return arr.filter(t => t && t.key);
    } catch {}
    return DEFAULT_MEETING_TYPES.slice();
}
function saveMeetingTypes(types, ctxId) {
    fs.writeFileSync(meetingTypesFile(ctxId), JSON.stringify(types, null, 2), 'utf-8');
}
function meetingTypeIcon(key) {
    const t = loadMeetingTypes().find(x => x.key === key);
    return t ? (t.icon || '') : '';
}
function meetingTypeLabel(key) {
    const t = loadMeetingTypes().find(x => x.key === key);
    return t ? (t.label || '') : '';
}

function getWorkHours(ctxId) {
    const s = ctxId ? getContextSettings(ctxId) : (getActiveContext() ? getContextSettings(getActiveContext()) : {});
    const reTime = /^\d{2}:\d{2}$/;
    // New format: workHours = array of length 7 (0=Mon..6=Sun), each {start,end} or null
    if (Array.isArray(s.workHours) && s.workHours.length === 7) {
        return {
            hours: s.workHours.map(h => {
                if (h && reTime.test(h.start) && reTime.test(h.end)) return { start: h.start, end: h.end };
                return null;
            })
        };
    }
    // Backward-compat: derive from old workStart/workEnd/workDays
    const start = reTime.test(s.workStart) ? s.workStart : '08:00';
    const end = reTime.test(s.workEnd) ? s.workEnd : '16:00';
    const daysArr = Array.isArray(s.workDays) ? s.workDays.map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6) : [0, 1, 2, 3, 4];
    const days = new Set(daysArr);
    const hours = [];
    for (let i = 0; i < 7; i++) hours.push(days.has(i) ? { start, end } : null);
    return { hours };
}

function getDefaultMeetingMinutes(ctxId, typeKey) {
    if (typeKey) {
        const t = loadMeetingTypes(ctxId).find(x => x.key === typeKey);
        const tm = t && parseInt(t.mins, 10);
        if (tm > 0 && tm <= 600) return tm;
    }
    const s = ctxId ? getContextSettings(ctxId) : (getActiveContext() ? getContextSettings(getActiveContext()) : {});
    const n = parseInt(s.defaultMeetingMinutes, 10);
    return n > 0 && n <= 600 ? n : 60;
}

function getUpcomingMeetingsDays(ctxId) {
    const s = ctxId ? getContextSettings(ctxId) : (getActiveContext() ? getContextSettings(getActiveContext()) : {});
    const n = parseInt(s.upcomingMeetingsDays, 10);
    return n > 0 && n <= 365 ? n : 14;
}

// Available note tags (themes) for the given context. Stored in
// settings.json under `availableThemes` as a string[] of normalized tag
// names (lowercase, trimmed, deduped). Used for autocomplete / chip
// pickers in the note editor and notes finder page.
function getContextThemes(ctxId) {
    const s = ctxId ? getContextSettings(ctxId) : (getActiveContext() ? getContextSettings(getActiveContext()) : {});
    const raw = Array.isArray(s.availableThemes) ? s.availableThemes : [];
    const seen = new Set();
    const out = [];
    for (const t of raw) {
        const v = String(t || '').trim();
        if (!v) continue;
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
    }
    return out;
}





function meetingId() {
    return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function extractMentions(text) {
    if (!text) return [];
    const matches = [...text.matchAll(/(?:^|[\s\n(\[])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g)];
    return [...new Set(matches.map(m => m[1]))];
}

function syncMentions(...texts) {
    const people = loadAllPeople();
    const companies = loadAllCompanies();
    const companyKeys = new Set(companies.filter(c => !c.deleted).map(c => c.key));
    let changed = false;
    texts.flat().forEach(text => {
        extractMentions(text).forEach(rawName => {
            const key = rawName.toLowerCase();
            // Skip if a (live) company already claims this key — don't shadow it with a person stub.
            if (companyKeys.has(key)) return;
            if (!people.find(p => p.key === key)) {
                people.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key, name: rawName, firstName: rawName, created: new Date().toISOString() });
                changed = true;
            }
        });
    });
    if (changed) savePeople(people);
}

function loadResults() {
    return loadCollection('results');
}

function saveResults(results) {
    syncCollection('results', results, 'id');
}

// Extract [bracketed text] from a note, return { results: string[], cleanNote: string }.
// Skips reference forms ([[?<id>]] / [[!<id>]]) — those refer to existing
// results and should not be re-created.
function extractResults(noteText) {
    if (!noteText) return { results: [], cleanNote: noteText || '' };
    const extracted = [];
    const clean = noteText.replace(/\[\[([^\[\]]+)\]\]/g, (m, inner) => {
        const trimmed = inner.trim();
        if (trimmed.startsWith('?') || trimmed.startsWith('!')) return m;
        if (trimmed) extracted.push(trimmed);
        return trimmed;
    });
    return { results: extracted, cleanNote: clean };
}

// On EXPLICIT save, transform [[X]] markers into linked [[?<id>]] markers,
// creating the underlying result entities. Mirrors the task pipeline ({{X}}
// → {{?<id>}}). Returns { text, createdIds, createdCount }. Reference forms
// already in the text are left untouched.
function processInlineResults(text, week, extraFields) {
    if (!text) return { text: text || '', createdIds: [], createdCount: 0 };
    const noteMentions = extractMentions(text);
    const created = [];
    const out = text.replace(/\[\[([^\[\]]+)\]\]/g, (m, inner) => {
        const trimmed = inner.trim();
        if (!trimmed) return m;
        if (trimmed.startsWith('?') || trimmed.startsWith('!')) return m;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const textMentions = extractMentions(trimmed);
        const allMentions = [...new Set([...noteMentions, ...textMentions])];
        const rec = {
            id,
            text: trimmed,
            week,
            people: allMentions,
            created: new Date().toISOString(),
        };
        if (extraFields && typeof extraFields === 'object') Object.assign(rec, extraFields);
        created.push(rec);
        return `[[?${id}]]`;
    });
    if (created.length > 0) {
        const all = loadResults();
        for (const r of created) all.push(r);
        saveResults(all);
    }
    return { text: out, createdIds: created.map(r => r.id), createdCount: created.length };
}

// {{X}} — double-brace task marker. Inner text becomes a new task entity,
// the braces are stripped on save (keeps inner text). The two reference
// forms ({{?<id>}} for open, {{!<id>}} for closed) are NOT new-task
// markers and are skipped.
function extractInlineTasks(noteText) {
    if (!noteText) return { tasks: [], cleanNote: noteText || '' };
    const extracted = [];
    const clean = noteText.replace(/\{\{([^{}]+)\}\}/g, (m, inner) => {
        const trimmed = inner.trim();
        // Skip reference forms — they refer to existing tasks.
        if (trimmed.startsWith('!') || trimmed.startsWith('?')) return m;
        if (trimmed) extracted.push(trimmed);
        return trimmed;
    });
    return { tasks: extracted, cleanNote: clean };
}

// Pull {{!taskId}} close markers out of the note. Returns the list of task
// IDs to close and the note with markers stripped (whitespace tidied).
function extractCloseMarkers(noteText) {
    if (!noteText) return { closedIds: [], cleanNote: noteText || '' };
    const ids = [];
    const clean = noteText.replace(/\{\{!\s*([^{}\s]+)\s*\}\}/g, (_, id) => {
        const trimmed = String(id).trim();
        if (trimmed) ids.push(trimmed);
        return '';
    });
    return { closedIds: ids, cleanNote: clean };
}

// Set a task note: extract results, sync mentions, return cleaned note
function syncTaskNote(task, rawNote, allTasks) {
    // Extract {{...}} → new tasks; [[...]] → new results. Both strip
    // the markers, keeping the inner text.
    const { tasks: inlineTasks, cleanNote: noteAfterTasks } = extractInlineTasks(rawNote);
    const { results: texts, cleanNote } = extractResults(noteAfterTasks);
    task.note = cleanNote;

    // Extract mentions from raw note (before stripping) for people registry + results
    const mentionNames = extractMentions(rawNote);

    // Replace results for this task
    let allResults = loadResults().filter(r => r.taskId !== task.id);
    texts.forEach(text => {
        // Merge mentions from the full note AND from the result text itself
        const textMentions = extractMentions(text);
        const allMentions = [...new Set([...mentionNames, ...textMentions])];
        allResults.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            text,
            week: task.week || '',
            taskId: task.id,
            taskText: task.text,
            people: allMentions,
            created: new Date().toISOString()
        });
    });
    saveResults(allResults);

    // Append new tasks from {{...}} markers to the caller's tasks array
    // so it gets persisted in the same saveTasks() call.
    if (Array.isArray(allTasks) && inlineTasks.length > 0) {
        const week = task.week || getCurrentYearWeek();
        inlineTasks.forEach(text => {
            allTasks.push({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                text,
                done: false,
                week,
                created: new Date().toISOString(),
            });
        });
    }

    // Sync people registry using raw note
    syncMentions(task.text, rawNote);

    return cleanNote;
}

// In-memory note-meta cache shape (per context bucket):
//   bucket.notesMeta            = { [week]: { [file]: metaObj } }   nested map
//   bucket.notesMetaLoadedWeeks = Set<week>                         weeks fully scanned
//
// A week present in the Set means we've enumerated its sidecar dir; a missing
// file under such a week is authoritative (returns {}). For weeks not in the
// Set, individual files may still be present opportunistically (single-file
// reads in getNoteMeta) but we don't know what's missing.

function _ensureNotesMetaBucket(bucket) {
    if (!bucket.notesMeta) bucket.notesMeta = {};
    if (!bucket.notesMetaLoadedWeeks) bucket.notesMetaLoadedWeeks = new Set();
    return bucket;
}

// Load all sidecars for a single week into the cache. Cheap when the week dir
// is small (typical: a handful of notes). Idempotent — safe to call repeatedly.
function _loadWeekNotesMeta(week, bucket) {
    if (!bucket) return null;
    _ensureNotesMetaBucket(bucket);
    if (bucket.notesMetaLoadedWeeks.has(week)) return bucket.notesMeta[week] || {};
    const wdir = path.join(notesMetaDir(), week);
    const map = bucket.notesMeta[week] || (bucket.notesMeta[week] = {});
    let files;
    try { files = fs.readdirSync(wdir); } catch { files = []; }
    for (const fname of files) {
        if (!fname.endsWith('.json')) continue;
        const noteFile = fname.slice(0, -5);
        if (map[noteFile]) continue; // already memoized via single-file path
        try {
            map[noteFile] = JSON.parse(fs.readFileSync(path.join(wdir, fname), 'utf-8'));
        } catch {}
    }
    bucket.notesMetaLoadedWeeks.add(week);
    return map;
}

function loadNotesMeta() {
    const ctx = getActiveContext();
    const bucket = _ctxCacheBucket(ctx);
    // Sidecar layout: notes-meta/<week>/<file>.json. Falls back to legacy
    // single-file notes-meta.json for unmigrated contexts.
    const dir = notesMetaDir();
    if (fs.existsSync(dir)) {
        // Load every week, then flatten to the legacy "week/file" key shape.
        let weekDirs;
        try { weekDirs = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { weekDirs = []; }
        if (bucket) _ensureNotesMetaBucket(bucket);
        for (const wd of weekDirs) {
            if (!wd.isDirectory()) continue;
            if (bucket) _loadWeekNotesMeta(wd.name, bucket);
        }
        const out = {};
        if (bucket && bucket.notesMeta) {
            for (const w of Object.keys(bucket.notesMeta)) {
                const wmap = bucket.notesMeta[w] || {};
                for (const f of Object.keys(wmap)) out[w + '/' + f] = { ...wmap[f] };
            }
        }
        return out;
    }
    // Legacy single-file fallback (unmigrated contexts).
    let result;
    try { result = JSON.parse(fs.readFileSync(notesMetaFile(), 'utf-8')); }
    catch { result = {}; }
    if (bucket) {
        _ensureNotesMetaBucket(bucket);
        for (const k of Object.keys(result)) {
            const slash = k.indexOf('/');
            if (slash < 0) continue;
            const w = k.slice(0, slash), f = k.slice(slash + 1);
            if (!bucket.notesMeta[w]) bucket.notesMeta[w] = {};
            bucket.notesMeta[w][f] = { ...result[k] };
            bucket.notesMetaLoadedWeeks.add(w);
        }
    }
    return result;
}

function saveNotesMeta(meta) {
    // Bulk replace: write each entry as its own sidecar, prune any
    // sidecars whose key isn't present in `meta`. Used only by the
    // legacy code path that loads-mutates-saves the whole map.
    const dir = notesMetaDir();
    fs.mkdirSync(dir, { recursive: true });
    const wantPaths = new Set();
    for (const key of Object.keys(meta || {})) {
        const slash = key.indexOf('/');
        if (slash < 0) continue;
        const week = key.slice(0, slash);
        const file = key.slice(slash + 1);
        const wdir = path.join(dir, week);
        fs.mkdirSync(wdir, { recursive: true });
        const fpath = path.join(wdir, file + '.json');
        fs.writeFileSync(fpath, JSON.stringify(meta[key], null, 2), 'utf-8');
        wantPaths.add(fpath);
    }
    // Prune orphan sidecars + empty week dirs.
    let weekDirs;
    try { weekDirs = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { weekDirs = []; }
    for (const wd of weekDirs) {
        if (!wd.isDirectory()) continue;
        const wdir = path.join(dir, wd.name);
        let files;
        try { files = fs.readdirSync(wdir); } catch { continue; }
        for (const fname of files) {
            if (!fname.endsWith('.json')) continue;
            const fpath = path.join(wdir, fname);
            if (!wantPaths.has(fpath)) {
                try { fs.unlinkSync(fpath); } catch {}
            }
        }
        try {
            if (fs.readdirSync(wdir).length === 0) fs.rmdirSync(wdir);
        } catch {}
    }
    // Drop the legacy single-file once we've migrated to sidecars.
    try { if (fs.existsSync(notesMetaFile())) fs.unlinkSync(notesMetaFile()); } catch {}
    _cacheInvalidateNotesMeta();
}

function getNoteMeta(week, file) {
    const ctx = getActiveContext();
    const bucket = _ctxCacheBucket(ctx);
    if (bucket) {
        _ensureNotesMetaBucket(bucket);
        const wmap = bucket.notesMeta[week];
        if (wmap && Object.prototype.hasOwnProperty.call(wmap, file)) {
            return { ...wmap[file] };
        }
        // If the entire week has been scanned, a missing file is authoritative.
        if (bucket.notesMetaLoadedWeeks.has(week)) {
            return {};
        }
    }
    // Read a single sidecar — O(1) lookup. Memoize into the nested cache.
    try {
        const data = JSON.parse(fs.readFileSync(notesMetaSidecarPath(week, file), 'utf-8'));
        if (bucket) {
            if (!bucket.notesMeta[week]) bucket.notesMeta[week] = {};
            bucket.notesMeta[week][file] = { ...data };
        }
        return data;
    } catch {}
    // Fallback: scan the legacy single-file shape (this also populates the cache).
    if (fs.existsSync(notesMetaFile())) {
        const meta = loadNotesMeta();
        return meta[week + '/' + file] || {};
    }
    return {};
}

function setNoteMeta(week, file, data) {
    const cur = getNoteMeta(week, file);
    const merged = { ...cur, ...data };
    const fpath = notesMetaSidecarPath(week, file);
    fs.mkdirSync(path.dirname(fpath), { recursive: true });
    fs.writeFileSync(fpath, JSON.stringify(merged, null, 2), 'utf-8');
    const bucket = _ctxCacheBucket(getActiveContext());
    if (bucket) {
        _ensureNotesMetaBucket(bucket);
        if (!bucket.notesMeta[week]) bucket.notesMeta[week] = {};
        bucket.notesMeta[week][file] = { ...merged };
    }
}

function deleteNoteMeta(week, file) {
    try { fs.unlinkSync(notesMetaSidecarPath(week, file)); } catch {}
    // Tidy empty week dir.
    let weekDirEmpty = false;
    try {
        const wdir = path.join(notesMetaDir(), week);
        if (fs.readdirSync(wdir).length === 0) { fs.rmdirSync(wdir); weekDirEmpty = true; }
    } catch {}
    // Legacy fallback: also strip the entry from the single-file map.
    if (fs.existsSync(notesMetaFile())) {
        try {
            const meta = JSON.parse(fs.readFileSync(notesMetaFile(), 'utf-8'));
            delete meta[week + '/' + file];
            fs.writeFileSync(notesMetaFile(), JSON.stringify(meta, null, 2), 'utf-8');
        } catch {}
    }
    const bucket = _ctxCacheBucket(getActiveContext());
    if (bucket && bucket.notesMeta && bucket.notesMeta[week]) {
        delete bucket.notesMeta[week][file];
        if (weekDirEmpty) {
            delete bucket.notesMeta[week];
            if (bucket.notesMetaLoadedWeeks) bucket.notesMetaLoadedWeeks.delete(week);
        }
    }
}

// Convert a UTC ISO timestamp to local-time { date: "YYYY-MM-DD", time: "HH:MM" }.
// Calendar grid columns are local-time, so timestamps stored as UTC ISO need
// converting before they can be positioned on the grid.
function isoToLocalDateTime(iso) {
    if (!iso) return null;
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return null;
    const date = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const time = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    return { date, time };
}

// Activity items rendered on the calendar in addition to meetings: tasks
// (completedAt if done, else created), notes (notes-meta `modified`), and
// results (created). Filters by [startIso..endIso] inclusive (local dates).
function getCalendarActivity(startIso, endIso) {
    const items = [];

    try {
        const tasks = loadTasks();
        for (const t of tasks) {
            const ts = t.done ? (t.completedAt || t.created) : t.created;
            const dt = isoToLocalDateTime(ts);
            if (!dt) continue;
            if (dt.date < startIso || dt.date > endIso) continue;
            items.push({
                kind: 'task',
                id: t.id,
                title: t.text || '(uten tittel)',
                date: dt.date,
                time: dt.time,
                href: '/tasks#t-' + encodeURIComponent(t.id),
                icon: t.done ? '✅' : '☐',
                done: !!t.done
            });
        }
    } catch {}

    try {
        const meta = loadNotesMeta();
        for (const key of Object.keys(meta || {})) {
            const m = meta[key];
            if (!m) continue;
            const lastSave = Array.isArray(m.saves) && m.saves.length ? m.saves[m.saves.length - 1] : null;
            const lastSaveTs = lastSave && typeof lastSave === 'object' ? lastSave.at : lastSave;
            const ts = m.modified || lastSaveTs;
            const dt = isoToLocalDateTime(ts);
            if (!dt) continue;
            if (dt.date < startIso || dt.date > endIso) continue;
            const slash = key.indexOf('/');
            const week = slash > 0 ? key.slice(0, slash) : '';
            const file = slash > 0 ? key.slice(slash + 1) : key;
            items.push({
                kind: 'note',
                id: key,
                title: file.replace(/\.md$/, ''),
                date: dt.date,
                time: dt.time,
                href: '/editor/' + week + '/' + encodeURIComponent(file),
                icon: '📝'
            });
        }
    } catch {}

    try {
        const results = loadResults();
        for (const r of results) {
            const dt = isoToLocalDateTime(r.created);
            if (!dt) continue;
            if (dt.date < startIso || dt.date > endIso) continue;
            items.push({
                kind: 'result',
                id: r.id,
                title: r.text || '',
                date: dt.date,
                time: dt.time,
                href: '/results',
                icon: '🏁'
            });
        }
    } catch {}

    return items;
}

// Stat-based caches for directory listings. Reading a directory hundreds of
// times per request is the hot path for /api/notes, search, summarize, home
// sidebar etc. fs.statSync only touches inode metadata (cheap), and the
// parent directory's mtime changes whenever a child is added/removed/renamed
// — so we can safely return a cached listing as long as mtime is unchanged.
const _weekDirsCache = new Map();   // key: dataDir, val: { mtimeMs, value }
const _mdFilesCache  = new Map();   // key: dataDir|week, val: { mtimeMs, value }

function _statMtime(p) {
    try { return fs.statSync(p).mtimeMs; } catch { return -1; }
}

function getWeekDirs() {
    const dir = dataDir();
    const mtime = _statMtime(dir);
    const cached = _weekDirsCache.get(dir);
    if (cached && cached.mtimeMs === mtime && mtime !== -1) return cached.value;
    let value;
    try {
        value = fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory() && /^\d{4}-\d{1,2}$/.test(d.name))
            .map(d => d.name)
            .sort((a, b) => b.localeCompare(a));
    } catch { value = []; }
    _weekDirsCache.set(dir, { mtimeMs: mtime, value });
    return value;
}

function getMdFiles(weekDir) {
    const root = dataDir();
    const full = path.join(root, weekDir);
    const mtime = _statMtime(full);
    if (mtime === -1) return [];
    const key = root + '|' + weekDir;
    const cached = _mdFilesCache.get(key);
    if (cached && cached.mtimeMs === mtime) return cached.value;
    let value;
    try {
        value = fs.readdirSync(full)
            .filter(f => f.endsWith('.md'))
            .sort();
    } catch { value = []; }
    _mdFilesCache.set(key, { mtimeMs: mtime, value });
    return value;
}

// mtime-keyed cache for raw .md content + derived plain-text snippet.
// Keyed by absolute path so it transparently spans contexts. Hot consumers:
// /api/notes/:week/:file/card, search, summarize, anywhere a note is read
// more than once between writes.
const _noteContentCache = new Map(); // path -> { mtimeMs, raw, snippet, snippetLen }

function readNoteCached(week, file) {
    const full = path.join(dataDir(), week, file);
    const mtime = _statMtime(full);
    if (mtime === -1) return null;
    const cached = _noteContentCache.get(full);
    if (cached && cached.mtimeMs === mtime) return cached;
    let raw;
    try { raw = fs.readFileSync(full, 'utf-8'); } catch { return null; }
    const entry = { mtimeMs: mtime, raw, snippet: null, snippetLen: 0 };
    _noteContentCache.set(full, entry);
    return entry;
}

function noteSnippetCached(week, file, len) {
    const entry = readNoteCached(week, file);
    if (!entry) return '';
    const wantLen = len || 200;
    if (entry.snippet != null && entry.snippetLen === wantLen) return entry.snippet;
    entry.snippet = noteSnippet(entry.raw, wantLen);
    entry.snippetLen = wantLen;
    return entry.snippet;
}

function searchSnippet(content, q, pad = 60) {
    if (!content) return '';
    const idx = content.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return '';
    const start = Math.max(0, idx - pad);
    const end = Math.min(content.length, idx + q.length + pad);
    return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

function searchMdFiles(query) {
    const results = [];
    const q = query.toLowerCase();
    const weeks = getWeekDirs();
    for (const week of weeks) {
        for (const file of getMdFiles(week)) {
            const entry = readNoteCached(week, file);
            if (!entry) continue;
            const content = entry.raw;
            const nameLower = file.toLowerCase();
            const contentLower = content.toLowerCase();
            const nameMatch = nameLower.includes(q);
            const idx = contentLower.indexOf(q);
            if (!nameMatch && idx === -1) continue;

            let snippet = '';
            if (idx !== -1) {
                const start = Math.max(0, idx - 60);
                const end = Math.min(content.length, idx + query.length + 60);
                snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
            }
            results.push({ week, file, snippet });
        }
    }
    return results;
}

function searchAll(query) {
    const q = String(query || '').toLowerCase();
    if (!q) return [];
    const out = [];

    // Notes
    for (const r of searchMdFiles(query)) {
        const name = r.file.replace(/\.md$/, '');
        out.push({
            type: 'note',
            identifier: r.week + '/' + encodeURIComponent(r.file),
            title: name,
            subtitle: r.week + '/' + r.file,
            href: '/' + r.week + '/' + encodeURIComponent(r.file),
            snippet: r.snippet
        });
    }

    // Tasks
    try {
        const tasks = loadTasks();
        for (const t of tasks) {
            const haystacks = [t.text, t.comment, t.notes].filter(Boolean);
            const hit = haystacks.find(h => String(h).toLowerCase().includes(q));
            if (!hit) continue;
            out.push({
                type: 'task',
                identifier: t.id,
                title: t.text || '(uten tittel)',
                subtitle: (t.done ? '✓ ' : '☐ ') + (t.completedWeek || t.week || ''),
                href: '/tasks',
                snippet: searchSnippet(hit, query)
            });
        }
    } catch {}

    // Meetings
    try {
        const meetings = loadMeetings();
        for (const m of meetings) {
            const att = (m.attendees || []).join(' ');
            const haystacks = [m.title, m.location, m.notes, att].filter(Boolean);
            const hit = haystacks.find(h => String(h).toLowerCase().includes(q));
            if (!hit) continue;
            const week = m.date ? dateToIsoWeek(new Date(m.date + 'T00:00:00Z')) : '';
            out.push({
                type: 'meeting',
                identifier: m.id,
                title: m.title || '(uten tittel)',
                subtitle: (m.date || '') + (m.start ? ' ' + m.start : ''),
                href: week ? `/calendar/${week}#m-${encodeURIComponent(m.id)}` : '/calendar',
                snippet: searchSnippet(hit, query)
            });
        }
    } catch {}

    // People
    try {
        const people = loadPeople();
        for (const p of people) {
            const haystacks = [p.name, p.firstName, p.lastName, p.title, p.email, p.phone, p.notes].filter(Boolean);
            const hit = haystacks.find(h => String(h).toLowerCase().includes(q));
            if (!hit) continue;
            const display = p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : (p.name || p.key);
            out.push({
                type: 'person',
                identifier: p.key || '',
                title: display,
                subtitle: p.title || p.email || '@' + (p.key || ''),
                href: '/people#' + encodeURIComponent(p.key || ''),
                snippet: searchSnippet(hit, query)
            });
        }
    } catch {}

    // Results
    try {
        const results = loadResults();
        for (const r of results) {
            if (!r.text || !String(r.text).toLowerCase().includes(q)) continue;
            out.push({
                type: 'result',
                identifier: r.id,
                title: r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text,
                subtitle: r.week || '',
                href: '/results',
                snippet: searchSnippet(r.text, query)
            });
        }
    } catch {}

    return out;
}

function getGhToken() {
    try { return execSync('gh auth token', { encoding: 'utf-8' }).trim(); }
    catch { return process.env.GH_TOKEN || ''; }
}

function summarizeWeek(week) {
    const app = getAppSettings();
    const useLocal = app.summarization.enabled && !isRemoteSummarizeModel(app.summarization.model);
    return new Promise((resolve, reject) => {
        const files = getMdFiles(week);
        const tasks = loadTasks().filter(t => t.week === week);

        // For remote (gpt-4o-mini) we send a richly-instructed Norwegian
        // prompt. For local seq2seq models the instructions are noise —
        // they just summarize whatever text they get — so we feed a
        // bare concatenation of the week's content instead.
        let context = useLocal
            ? `Uke ${week}.\n\n`
            : `Oppsummer hva som skjedde i uke ${week}.\n\nSkriv oppsummeringen på norsk i markdown-format. Vær grundig og dekkende — ta med detaljer, kontekst og diskusjoner fra notatene, ikke bare overskrifter.\n\nStruktur oppsummeringen med følgende seksjoner (bruk ## overskrifter):\n\n## Hovedpunkter\nEt fyldig sammendrag (flere avsnitt) av hva som skjedde i uken. Beskriv møter, diskusjoner, problemstillinger, og beslutninger i prosa. Ta med kontekst og nyanser fra notatene.\n\n## Oppgaver\nList fullførte og pågående oppgaver. Nevn kort hva som ble oppnådd på fullførte oppgaver (bruk notat/kommentar).\n\n## Resultater og beslutninger\nList opp ALLE elementer fra seksjonen \"Resultater\" nedenfor. Hvert resultat som eget punkt. Ikke utelat noen.\n\n## Involverte personer\nList opp ALLE personer fra seksjonen \"Personer\" nedenfor. For hver person: navn, rolle/tittel hvis kjent, og hva de bidro med eller ble nevnt i forbindelse med denne uken.\n\nIkke utelat resultater eller personer. Vær utfyllende under Hovedpunkter.\n\n`;

        for (const f of files) {
            if (f === 'summarize.md') continue;
            const entry = readNoteCached(week, f);
            if (entry) context += `--- ${f} ---\n${entry.raw}\n\n`;
        }

        if (tasks.length > 0) {
            context += '--- Oppgaver ---\n';
            tasks.forEach(t => {
                context += `- [${t.done ? 'x' : ' '}] ${t.text}${t.comment ? ' (' + t.comment + ')' : ''}\n`;
                if (t.note && t.note.trim()) {
                    context += `  Notat: ${t.note.replace(/\n/g, '\n  ')}\n`;
                }
            });
        }

        const results = loadResults().filter(r => r.week === week);
        if (results.length > 0) {
            context += '\n--- Resultater ---\n';
            results.forEach(r => {
                const who = (r.people && r.people.length) ? ` [${r.people.join(', ')}]` : '';
                const fromTask = r.taskText ? ` (fra oppgave: ${r.taskText})` : '';
                context += `- ${r.text}${who}${fromTask}\n`;
            });
        }

        // Collect people referenced in this week (from tasks, notes, results)
        const allPeople = loadPeople();
        const referenced = new Set();
        const collect = (text) => {
            if (!text) return;
            const re = /(?:^|[\s\n(\[])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g;
            let m;
            while ((m = re.exec(text)) !== null) referenced.add(m[1]);
        };
        tasks.forEach(t => { collect(t.text); collect(t.note); collect(t.comment); });
        results.forEach(r => (r.people || []).forEach(p => referenced.add(p)));
        for (const f of files) {
            if (f === 'summarize.md') continue;
            try { collect(fs.readFileSync(path.join(dataDir(), week, f), 'utf-8')); } catch {}
        }
        if (referenced.size > 0) {
            context += '\n--- Personer ---\n';
            for (const name of referenced) {
                const p = allPeople.find(x => x.name === name || (x.key && x.key === name.toLowerCase()));
                if (p) {
                    const display = (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name);
                    const parts = [display];
                    if (p.title) parts.push(p.title);
                    if (p.notes) parts.push(p.notes);
                    context += `- @${name}: ${parts.join(' — ')}\n`;
                } else {
                    context += `- @${name}\n`;
                }
            }
        }

        if (useLocal) {
            // Hand off to local summarize-worker. No need for the GitHub
            // token. Worker chunks long inputs internally.
            summarizeViaLocalWorker(context).then(resolve).catch(reject);
            return;
        }

        const token = getGhToken();
        if (!token) return reject(new Error('Ingen GitHub-token funnet'));

        const payload = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Du er en assistent som oppsummerer ukentlige notater for et utviklingsteam som jobber med migrering fra Arena til Kelvin (AAP-systemet). Skriv en konsis oppsummering i markdown.' },
                { role: 'user', content: context }
            ],
            max_tokens: 4000,
            temperature: 0.4
        });

        const req = https.request('https://models.inference.ai.azure.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.choices && json.choices[0]) {
                        const summary = json.choices[0].message.content;
                        resolve(summary);
                    } else {
                        reject(new Error(json.error?.message || 'Uventet svar fra API'));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function commentModalHtml() {
    return '<div id="commentModal" class="page-modal" onclick="if(event.target===this)cancelComment()"><div class="page-modal-card"><h3>✅ Fullfør oppgave</h3><p id="commentTaskText" style="color:var(--text-muted);margin-bottom:16px;font-weight:600"></p><textarea id="commentText" rows="4" placeholder="Legg til en kommentar (valgfritt)..."></textarea><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="cancelComment()">Avbryt</button><button class="page-modal-btn green" onclick="submitComment(true)">✅ Fullført</button></div></div></div>';
}

function noteModalHtml() {
    return '<div id="noteModal" class="page-modal" onclick="if(event.target===this)closeNoteModal()"><div class="page-modal-card"><h3>📓 Notat</h3><p id="noteTaskText" style="color:var(--text-muted);margin-bottom:12px;font-weight:600"></p><textarea id="noteText" rows="5" placeholder="Skriv notat her..."></textarea><div class="page-modal-actions"><button class="page-modal-btn cancel" onclick="closeNoteModal()">Avbryt</button><button class="page-modal-btn blue" onclick="saveNote()">💾 Lagre</button></div></div></div>';
}

const CONTEXT_ICONS = ['💼','⛳','🏌️','🏠','📚','✈️','🎨','🎵','🎮','🧪','🔬','💡','🌱','🏃','🐾','🍳','☕','📷','✍️','🛒','💰','🏥','📅','📁','⭐','🚀'];

function iconPickerHtml(name, current, pickerId, inputId) {
    const safeCurrent = escapeHtml(current || '📁');
    const inputAttr = inputId ? ` id="${escapeHtml(inputId)}"` : '';
    const buttons = CONTEXT_ICONS.map(ic => {
        const sel = ic === (current || '📁') ? ' selected' : '';
        return `<button type="button" class="icon-option${sel}" data-icon="${escapeHtml(ic)}" tabindex="-1">${escapeHtml(ic)}</button>`;
    }).join('');
    return `<div class="icon-picker" data-picker="${escapeHtml(pickerId)}">
        <button type="button" class="icon-trigger" data-icon-trigger>
            <span class="icon-current">${safeCurrent}</span>
            <span class="icon-caret">▾</span>
        </button>
        <input type="hidden" name="${escapeHtml(name)}"${inputAttr} value="${safeCurrent}">
        <div class="icon-grid">${buttons}</div>
    </div>`;
}

function contextSwitcherHtml() {
    return `<ctx-switcher class="ctx-switcher" context_service="week-note-services.context_service"></ctx-switcher>`;
}

const THEMES = ['paper', 'dark', 'nerd', 'solarized-light', 'nord', 'forest', 'ocean'];
const THEME_LABELS = {
    'paper': 'Papir',
    'dark': 'Mørk',
    'nerd': 'Nerd',
    'solarized-light': 'Solarized Light',
    'nord': 'Nord',
    'forest': 'Skog',
    'ocean': 'Hav'
};
const THEME_VAR_NAMES = [
    'bg', 'surface', 'surface-alt', 'surface-head',
    'border', 'border-soft', 'border-faint',
    'text', 'text-strong', 'text-muted', 'text-muted-warm', 'text-subtle',
    'accent', 'accent-strong', 'accent-soft',
    'font-family', 'font-size'
];
const CUSTOM_THEMES_DIR = path.join(CONTEXTS_DIR, '_themes');
function safeThemeId(s) {
    return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}
function parseThemeCss(content) {
    const out = { name: '', vars: {} };
    const nameMatch = content.match(/\/\*\s*name:\s*([^*\n]+?)\s*\*\//i);
    if (nameMatch) out.name = nameMatch[1].trim();
    else {
        // fallback: first /* ... */ comment up to first em-dash or end
        const m = content.match(/\/\*\s*([^*\n]+?)\s*\*\//);
        if (m) out.name = m[1].split(/\s+—\s+/)[0].trim();
    }
    for (const v of THEME_VAR_NAMES) {
        const re = new RegExp('--' + v.replace(/-/g, '\\-') + ':\\s*([^;]+?);', 'i');
        const mm = content.match(re);
        if (mm) out.vars[v] = mm[1].trim();
    }
    return out;
}
function readBuiltinTheme(id) {
    try {
        const file = path.join(ROOT_DIR, 'themes', id + '.css');
        const css = fs.readFileSync(file, 'utf-8');
        const parsed = parseThemeCss(css);
        return { id, name: parsed.name || THEME_LABELS[id] || id, builtin: true, vars: parsed.vars };
    } catch { return null; }
}
function readCustomTheme(id) {
    try {
        const file = path.join(CUSTOM_THEMES_DIR, id + '.css');
        const css = fs.readFileSync(file, 'utf-8');
        const parsed = parseThemeCss(css);
        return { id, name: parsed.name || id, builtin: false, vars: parsed.vars };
    } catch { return null; }
}
function listCustomThemes() {
    try {
        return fs.readdirSync(CUSTOM_THEMES_DIR)
            .filter(f => f.endsWith('.css'))
            .map(f => f.slice(0, -4))
            .map(readCustomTheme)
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
    } catch { return []; }
}
function listBuiltinThemes() {
    return THEMES.map(readBuiltinTheme).filter(Boolean);
}
function listAllThemes() {
    return [...listBuiltinThemes(), ...listCustomThemes()];
}
function findTheme(id) {
    return listAllThemes().find(t => t.id === id) || null;
}
function themeCssFor(name, vars) {
    const lines = THEME_VAR_NAMES
        .filter(v => vars[v] != null && String(vars[v]).trim() !== '')
        .map(v => `    --${v}: ${String(vars[v]).trim()};`);
    return `/* name: ${String(name || '').replace(/\*\//g, '')} */\n:root {\n${lines.join('\n')}\n}\n`;
}
function writeCustomTheme(id, name, vars) {
    const safe = safeThemeId(id);
    if (!safe) throw new Error('Ugyldig tema-id');
    if (THEMES.includes(safe)) throw new Error('Kan ikke overskrive innebygd tema');
    try { fs.mkdirSync(CUSTOM_THEMES_DIR, { recursive: true }); } catch {}
    fs.writeFileSync(path.join(CUSTOM_THEMES_DIR, safe + '.css'), themeCssFor(name, vars));
    return safe;
}
function deleteCustomTheme(id) {
    const safe = safeThemeId(id);
    if (!safe || THEMES.includes(safe)) throw new Error('Kan ikke slette innebygd tema');
    try { fs.unlinkSync(path.join(CUSTOM_THEMES_DIR, safe + '.css')); } catch {}
}
function uniqueThemeId(base) {
    let id = safeThemeId(base) || 'tema';
    let n = 2;
    while (THEMES.includes(id) || fs.existsSync(path.join(CUSTOM_THEMES_DIR, id + '.css'))) {
        id = safeThemeId(base) + '-' + (n++);
    }
    return id;
}
function isValidThemeId(t) {
    if (THEMES.includes(t)) return true;
    if (!safeThemeId(t)) return false;
    return fs.existsSync(path.join(CUSTOM_THEMES_DIR, safeThemeId(t) + '.css'));
}
function getActiveTheme() {
    const ctx = getActiveContext();
    if (!ctx) return 'paper';
    const t = (getContextSettings(ctx) || {}).theme;
    return isValidThemeId(t) ? t : 'paper';
}

function navLinksHtml(extra) {
    return `<a href="/" data-key="h" title="Hjem (Alt+H)">🏠 Hjem <kbd>Alt+H</kbd></a>
                <a href="/tasks" data-key="o" title="Oppgaver (Alt+O)">☑️ Oppgaver <kbd>Alt+O</kbd></a>
                <a href="/calendar" data-key="k" title="Kalender (Alt+K)">📅 Kalender <kbd>Alt+K</kbd></a>
                <a href="/people" data-key="p" title="Personer og steder (Alt+P)">👥 Personer og steder <kbd>Alt+P</kbd></a>
                <a href="/results" data-key="r" title="Resultater (Alt+R)">⚖️ Resultater <kbd>Alt+R</kbd></a>
                <a href="/editor" data-key="n" title="Nytt notat (Alt+N)">📝 Nytt <kbd>Alt+N</kbd></a>
                <a href="#" id="navSearchBtn" data-key="/" title="Søk (/)">🔎 Søk <kbd>/</kbd></a>
                <a href="/settings" data-key="s" title="Innstillinger (Alt+S)">⚙️ Innstillinger <kbd>Alt+S</kbd></a>
                <a href="#" id="helpBtn" title="Hjelp">❓ Hjelp</a>
                ${extra || ''}`;
}

function navbarHtml(extraNavLinks, opts) {
    var fixed = opts && opts.fixed ? ' app-navbar-fixed' : '';
    return `<nav id="appNav" class="app-navbar${fixed}">
        <div class="nav-inner">
            <nav-button href="/" text="Ukenotater" size="4" data-key="h"></nav-button>
            ${contextSwitcherHtml()}
            <div class="nav-links">
                <nav-button size="2" href="/editor" data-key="n" title="Nytt notat (Alt+N)" icon="📝" text="Nytt notat"></nav-button>
                <nav-button size="2" href="/calendar" data-key="k" title="Kalender (Alt+K)" icon="📅" text="Kalender"></nav-button>
                <nav-button size="2" href="/tasks" data-key="o" title="Oppgaver (Alt+O)" icon="✅" text="Oppgaver"></nav-button>
                <nav-button size="2" href="/people" data-key="p" title="Personer (Alt+P)" icon="👥" text="Personer"></nav-button>
                <nav-button size="2" href="/results" data-key="r" title="Resultater (Alt+R)" icon="🎯" text="Resultater"></nav-button>
                <nav-button size="2" href="/notes" icon="📚" text="Notater"></nav-button>
                <nav-button size="2" href="/settings" data-key="s" title="Innstillinger (Alt+S)" icon="⚙️" text="Innstillinger"></nav-button>
            </div>
            <global-search search_service="week-note-services.search_service"></global-search>
            <nav-meta></nav-meta>
        </div>
    </nav>`;
}

function pageHtml(title, body, extraNavLinks, opts) {
    opts = opts || {};
    if (opts.fragment) {
        // Just the inner content (with title hint for the SPA router).
        return `<title>${escapeHtml(title)}</title>\n<main id="content">${body}</main>`;
    }
    const nav = navbarHtml(extraNavLinks, { fixed: false });
    const theme = getActiveTheme();
    return `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link id="themeStylesheet" rel="stylesheet" href="/themes/${theme}.css">
    <link rel="stylesheet" href="/style.css">
</head>
<body><header id="appHeader">${nav}</header><main id="content">${body}</main><entity-callout id="appEntityCallout"></entity-callout><help-modal></help-modal><footer id="shortcutsBar" class="shortcuts-bar" aria-label="Hurtigtaster"><span><kbd>Alt</kbd>+<kbd>H</kbd> Hjem</span><span><kbd>Alt</kbd>+<kbd>O</kbd> Oppgaver</span><span><kbd>Alt</kbd>+<kbd>K</kbd> Kalender</span><span><kbd>Alt</kbd>+<kbd>P</kbd> Personer</span><span><kbd>Alt</kbd>+<kbd>R</kbd> Resultater</span><span><kbd>Alt</kbd>+<kbd>N</kbd> Nytt notat</span><span><kbd>Alt</kbd>+<kbd>S</kbd> Innstillinger</span><span><kbd>/</kbd> Søk</span><span><kbd>Esc</kbd> Lukk</span><span><kbd>?</kbd> Hjelp</span></footer><script>
// ----- Entity callout host: listen for hover-* events bubbling from cards
// (composed events cross every shadow boundary) and drive the dumb
// <entity-callout> singleton. Services are loaded lazily on first hover. -----
(function(){
    var cal = document.getElementById('appEntityCallout');
    if (!cal) return;
    var ready = customElements.whenDefined('entity-callout');
    var cache = { person: null, company: null, place: null };
    var loading = null;
    function svc(name){
        var ns = window['week-note-services'] || {};
        return ns[name + '_service'];
    }
    function loadAll(){
        if (cache.person && cache.company && cache.place) return Promise.resolve();
        if (loading) return loading;
        loading = Promise.all([
            Promise.resolve((svc('people')    && svc('people').list())    || []),
            Promise.resolve((svc('companies') && svc('companies').list()) || []),
            Promise.resolve((svc('places')    && svc('places').list())    || []),
        ]).then(function(arr){
            cache.person  = arr[0] || [];
            cache.company = arr[1] || [];
            cache.place   = arr[2] || [];
        });
        return loading;
    }
    function lookup(kind, key){
        var list = cache[kind];
        if (!list || !key) return null;
        if (kind === 'person') {
            var lk = String(key).toLowerCase();
            var p = list.find(function(x){ return (x.key && x.key.toLowerCase() === lk) || (x.name && x.name.toLowerCase() === lk); });
            if (!p) return null;
            var company = p.primaryCompanyKey ? (cache.company || []).find(function(c){ return c.key === p.primaryCompanyKey; }) : null;
            return Object.assign({}, p, { company: company });
        }
        return list.find(function(x){ return x.key === key; }) || null;
    }
    ['person','company','place'].forEach(function(kind){
        document.addEventListener('hover-' + kind, function(e){
            var d = e.detail || {};
            ready.then(function(){
                if (!d.entering) { cal.hide(); return; }
                loadAll().then(function(){
                    cal.setData({ kind: kind, key: d.key, entity: lookup(kind, d.key), x: d.x, y: d.y });
                });
            });
        });
    });

    // ----- Navigation: clicking an <entity-mention> emits select-* events.
    // Replicate the old anchor behaviour (href="/people..." / "/people#tab=companies&key=...")
    // through the SPA router so chips remain navigable. -----
    function nav(url) {
        if (window.SPA && typeof window.SPA.navigate === 'function') window.SPA.navigate(url);
        else window.location.assign(url);
    }
    document.addEventListener('select-person', function(e){
        var key = (e.detail && e.detail.key) || '';
        nav('/people' + (key ? '#' + encodeURIComponent(key) : ''));
    });
    document.addEventListener('select-company', function(e){
        var key = (e.detail && e.detail.key) || '';
        nav('/people' + (key ? '#tab=companies&key=' + encodeURIComponent(key) : ''));
    });
    document.addEventListener('select-place', function(e){
        var key = (e.detail && e.detail.key) || '';
        nav('/people' + (key ? '#tab=places&key=' + encodeURIComponent(key) : ''));
    });

    // ----- Bridge legacy ".mention-link" anchors -> hover-* events. -----
    // Mention links live in the light DOM (rendered by linkMentions). They
    // emit no events themselves; this watcher converts mouseover/mouseout to
    // the same composed hover-* events that cards dispatch, so the callout
    // host above handles them uniformly.
    function dispatchMention(a, entering, ev) {
        var compKey = a.getAttribute('data-company-key');
        var personKey = a.getAttribute('data-person-key');
        var key, kind;
        if (compKey) { key = compKey; kind = 'company'; }
        else if (personKey) { key = personKey; kind = 'person'; }
        else {
            key = (a.textContent || '').trim().toLowerCase();
            kind = a.classList.contains('mention-company') ? 'company' : 'person';
        }
        if (!key) return;
        document.dispatchEvent(new CustomEvent('hover-' + kind, {
            bubbles: true, composed: true,
            detail: { key: key, entering: entering, x: ev.clientX, y: ev.clientY },
        }));
    }
    document.addEventListener('mouseover', function(e){
        var a = e.target.closest && e.target.closest('.mention-link');
        if (!a) return;
        dispatchMention(a, true, e);
    });
    document.addEventListener('mouseout', function(e){
        var a = e.target.closest && e.target.closest('.mention-link');
        if (!a) return;
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.mention-link') === a) return;
        dispatchMention(a, false, e);
    });
    document.addEventListener('mousemove', function(e){
        if (!cal.hasAttribute('visible')) return;
        var a = e.target.closest && e.target.closest('.mention-link');
        if (!a) return;
        cal.position && cal.position(e.clientX, e.clientY);
    });
})();
</script><script>
// ----- SPA router. Maps URL paths to static HTML fragments under /pages/. -----
(function(){
    var ROUTES = {
        '/': '/pages/home.html',
        '/editor': '/pages/editor.html',
        '/tasks': '/pages/tasks.html',
        '/people': '/pages/people.html',
        '/results': '/pages/results.html',
        '/notes': '/pages/notes.html',
        '/settings': '/pages/settings.html',
        '/calendar': '/pages/calendar.html'
    };
    var ROUTE_PATTERNS = [
        { re: /^\\/editor\\/[^/]+\\/[^/]+\\.md$/, frag: '/pages/editor.html' },
        { re: /^\\/calendar\\/\\d{4}-W\\d{2}$/, frag: '/pages/calendar.html' }
    ];
    var content = document.getElementById('content');
    if (!content) return;

    function resolveFragment(pathname) {
        if (Object.prototype.hasOwnProperty.call(ROUTES, pathname)) return ROUTES[pathname];
        for (var i = 0; i < ROUTE_PATTERNS.length; i++) {
            if (ROUTE_PATTERNS[i].re.test(pathname)) return ROUTE_PATTERNS[i].frag;
        }
        return null; // unknown route -> fall through to full navigation
    }

    function applyFragment(html, pushPath) {
        // Extract <title> if present and update document.title.
        var titleMatch = html.match(/<title>([^<]*)<\\/title>/i);
        if (titleMatch) {
            document.title = titleMatch[1];
            html = html.replace(titleMatch[0], '');
        }
        // Push state BEFORE inserting the new content so custom elements
        // that read location.pathname during connectedCallback see the
        // new URL, not the previous one.
        if (pushPath) {
            history.pushState({ spa: true }, '', pushPath);
        }
        content.innerHTML = html;
        // Notify the rest of the app that content changed.
        document.dispatchEvent(new CustomEvent('spa:navigated', { detail: { path: location.pathname } }));
    }

    function navigate(pathname, push) {
        var frag = resolveFragment(pathname);
        if (!frag) {
            // Not a SPA route — let the browser do a full navigation.
            window.location.href = pathname;
            return;
        }
        fetch(frag, { headers: { 'Accept': 'text/html' } })
            .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(function(html){ applyFragment(html, push ? pathname : null); })
            .catch(function(){ window.location.href = pathname; });
    }

    document.addEventListener('click', function(e){
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        if (a.target && a.target !== '' && a.target !== '_self') return;
        var url;
        try { url = new URL(a.href, location.href); } catch (_) { return; }
        if (url.origin !== location.origin) return;
        if (a.hasAttribute('download')) return;
        if (!resolveFragment(url.pathname)) return;
        e.preventDefault();
        navigate(url.pathname + url.search, true);
    });

    window.addEventListener('popstate', function(){
        navigate(location.pathname, false);
    });

    // Public API: returns true if the path was handled via SPA, false otherwise.
    window.spaNavigate = function(pathname){
        try {
            var u = new URL(pathname, location.origin);
            if (u.origin !== location.origin) return false;
            if (!resolveFragment(u.pathname)) return false;
            navigate(u.pathname + u.search, true);
            return true;
        } catch (_) { return false; }
    };

    // Initial load: if the server returned an empty <content>, hydrate from the route.
    function hydrate(){
        if (content.children.length === 0 && content.textContent.trim() === '') {
            navigate(location.pathname, false);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrate);
    } else {
        hydrate();
    }
})();

// Auto-wire any <details data-persist-key="..."> in the SPA fragment so its
// open/closed state is remembered across navigations.
(function(){
    function wire(root){
        (root || document).querySelectorAll('details[data-persist-key]').forEach(function(d){
            if (d._persistWired) return;
            d._persistWired = true;
            var key = d.getAttribute('data-persist-key');
            if (localStorage.getItem(key) === 'true') d.open = true;
            d.addEventListener('toggle', function(){
                localStorage.setItem(key, d.open ? 'true' : 'false');
            });
        });
    }
    document.addEventListener('spa:navigated', function(){ wire(document); });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ wire(document); });
    } else { wire(document); }
})();

document.addEventListener('keydown',function(e){
    if(!e.altKey||e.ctrlKey||e.metaKey)return;
    var t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
    var btn=document.querySelector('#appNav nav-button[data-key="'+e.key.toLowerCase()+'"]');
    if(btn){e.preventDefault();var href=btn.getAttribute('href');if(window.spaNavigate&&window.spaNavigate(href))return;window.location.href=href;}
});

// Global "?" hotkey opens the help modal (skip when typing in inputs).
document.addEventListener('keydown', function(e){
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
    // Shadow DOM retargets e.target to the host, so walk the composed
    // path to find any actual input/textarea/contentEditable.
    var path = (typeof e.composedPath === 'function') ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (!n || !n.tagName) continue;
        if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable) return;
    }
    var hm = document.querySelector('help-modal');
    if (hm && typeof hm.open === 'function') { e.preventDefault(); hm.open(); }
});

// Global "/" hotkey opens the search modal (skip when typing in inputs).
// Note: on Norwegian (and many EU) layouts, "/" is Shift+7, so we must
// allow shiftKey here — e.key already resolves to "/" regardless.
document.addEventListener('keydown', function(e){
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var path = (typeof e.composedPath === 'function') ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (!n || !n.tagName) continue;
        if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable) return;
    }
    if (typeof window.openSearch === 'function') { e.preventDefault(); window.openSearch(); }
});

// Highlight the active nav-button based on current pathname.
(function(){
    function updateSelected(){
        var path = location.pathname || '/';
        document.querySelectorAll('nav-button[href]').forEach(function(btn){
            var href = btn.getAttribute('href') || '';
            var match = false;
            if (href === '/') match = (path === '/' || path === '');
            else match = (path === href || path.indexOf(href + '/') === 0);
            if (match) btn.setAttribute('selected', '');
            else btn.removeAttribute('selected');
        });
    }
    document.addEventListener('spa:navigated', updateSelected);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateSelected);
    else updateSelected();
})();

// ----- Global wiring of component events -----
(function(){
    function pad2(n){ return String(n).padStart(2,'0'); }
    function go(url){ window.location.href = url; }

    // nav-clicked: navigate to the target href (via SPA router if possible).
    document.addEventListener('nav-clicked', function(e){
        var href = e.detail && e.detail.href;
        if (!href) return;
        e.preventDefault();
        if (window.spaNavigate && window.spaNavigate(href)) return;
        go(href);
    });

    // mention-clicked: resolve id -> person or company URL.
    document.addEventListener('mention-clicked', function(e){
        var id = e.detail && e.detail.id;
        if (!id) return;
        e.preventDefault();
        fetch('/api/companies').then(function(r){ return r.ok ? r.json() : []; }).then(function(companies){
            var isCompany = (companies || []).some(function(c){ return c.key === id; });
            if (isCompany) go('/people#tab=companies&key=' + encodeURIComponent(id));
            else go('/people#' + encodeURIComponent(id));
        }).catch(function(){ go('/people'); });
    });

    // week-clicked: navigate to that ISO week in the calendar.
    document.addEventListener('week-clicked', function(e){
        var d = e.detail || {};
        if (!d.year || !d.weekNumber) return;
        e.preventDefault();
        go('/calendar/' + d.year + '-W' + pad2(d.weekNumber));
    });

    // Note actions. <week-section> emits "note:*"; bare <note-card>s emit unprefixed.
    // Detail shape: { week, file } (raw filename, NOT URI-encoded).
    function readWF(detail){
        if (!detail || !detail.week || !detail.file) return null;
        return { week: detail.week, file: detail.file, fileEnc: encodeURIComponent(detail.file) };
    }
    function handleView(e){
        var p = readWF(e.detail); if (!p) return;
        e.preventDefault();
        if (typeof window.openNoteViewModal === 'function') window.openNoteViewModal(p.week, p.fileEnc);
        else go('/note/' + p.week + '/' + p.fileEnc);
    }
    function handlePresent(e){
        var p = readWF(e.detail); if (!p) return;
        e.preventDefault();
        if (typeof window.openPresentation === 'function') window.openPresentation(p.week, p.fileEnc);
        else window.open('/present/' + p.week + '/' + p.fileEnc + '?fs=1', '_blank');
    }
    function handleEdit(e){
        var p = readWF(e.detail); if (!p) return;
        e.preventDefault();
        go('/editor/' + p.week + '/' + p.fileEnc);
    }
    function handleDelete(e){
        var p = readWF(e.detail); if (!p) return;
        e.preventDefault();
        // Find the originating <note-card> from the event path. This
        // works whether the card is in light DOM or inside another
        // component's shadow DOM (composedPath crosses shadow roots).
        var path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
        var card = null;
        for (var i = 0; i < path.length; i++) {
            var n = path[i];
            if (n && n.nodeType === 1 && n.tagName === 'NOTE-CARD') { card = n; break; }
        }
        if (!card) card = e.target && e.target.closest && e.target.closest('note-card');
        var name = p.file.replace(/\\.md$/, '');
        if (!confirm('Slette notatet "' + name + '"?\\n\\nDette kan ikke angres.')) return;
        fetch('/api/notes/' + p.week + '/' + p.fileEnc, { method: 'DELETE' })
            .then(function(resp){
                if (!resp.ok) { alert('Kunne ikke slette notatet.'); return; }
                if (card && card.remove) card.remove();
                document.dispatchEvent(new CustomEvent('note:deleted', {
                    bubbles: true, detail: { week: p.week, file: p.file },
                }));
            })
            .catch(function(err){ alert('Nettverksfeil: ' + (err && err.message || err)); });
    }
    document.addEventListener('view', handleView);
    document.addEventListener('present', handlePresent);
    document.addEventListener('delete', handleDelete);
    document.addEventListener('note:view', handleView);
    document.addEventListener('note:present', handlePresent);
    document.addEventListener('note:edit', handleEdit);

    // Task lifecycle cross-list refresh:
    //   - <task-open-list> exposes taskCreated()/taskCompleted()/taskUncompleted()
    //   - <task-completed>  exposes taskCompleted()/taskUncompleted()
    //   The shell forwards the matching global event to every list instance.
    function notify(selector, method, detail) {
        function walk(root) {
            root.querySelectorAll(selector).forEach(function(el){
                if (typeof el[method] === 'function') el[method](detail);
            });
            root.querySelectorAll('*').forEach(function(el){
                if (el.shadowRoot) walk(el.shadowRoot);
            });
        }
        walk(document);
    }
    document.addEventListener('task:created', function(e){
        notify('task-open-list', 'taskCreated', e.detail || {});
    });
    document.addEventListener('task:completed', function(e){
        notify('task-open-list', 'taskCompleted', e.detail || {});
        notify('task-completed', 'taskCompleted', e.detail || {});
    });
    document.addEventListener('task:uncompleted', function(e){
        notify('task-open-list', 'taskUncompleted', e.detail || {});
        notify('task-completed', 'taskUncompleted', e.detail || {});
    });

    //   <inline-task> emits 'task-closed' (bubbles + composed) when the
    //   user toggles a checkbox in a rendered note. Forward to the
    //   standard task:completed/uncompleted events so every list
    //   refreshes via its existing method.
    document.addEventListener('task-closed', function(e){
        var d = e.detail || {};
        var id = d.taskId;
        if (!id) return;
        var ev = d.done ? 'task:completed' : 'task:uncompleted';
        document.dispatchEvent(new CustomEvent(ev, {
            bubbles: true, detail: { id: id },
        }));
    });

    // ===== Week summarize / show-summary =====
    // <week-section> dispatches 'week-section:summarize' (and ':show-summary')
    // when its "✨ Oppsummer" / "📋 Vis oppsummering" button is clicked.
    // We wire those to /api/summarize and /api/notes/:week/summarize.md.
    function ensureSummaryModal() {
        var m = document.getElementById('summaryModal');
        if (m) return m;
        m = document.createElement('modal-container');
        m.id = 'summaryModal';
        m.setAttribute('size', 'lg');
        var t = document.createElement('span');
        t.setAttribute('slot', 'title');
        m.appendChild(t);
        var body = document.createElement('div');
        body.className = 'summary-modal-body';
        body.style.cssText = 'min-height:120px;font-size:0.95em;line-height:1.55;';
        m.appendChild(body);
        document.body.appendChild(m);
        return m;
    }
    function setSummaryBody(modal, html) {
        var body = modal.querySelector('.summary-modal-body');
        if (body) body.innerHTML = html;
    }
    function escapeHtmlClient(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function renderMarkdown(md) {
        if (window.marked && typeof window.marked.parse === 'function') {
            try { return window.marked.parse(md || ''); } catch (_) {}
        }
        return '<pre style="white-space:pre-wrap;font-family:inherit">'
            + escapeHtmlClient(md || '') + '</pre>';
    }
    function saveSummary(week, markdown) {
        return fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: week, file: 'summarize.md', content: markdown }),
        }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); });
    }

    function runSummarize(week) {
        var modal = ensureSummaryModal();
        modal.setTitle('Oppsummering &mdash; uke ' + escapeHtmlClient(week));
        setSummaryBody(modal, '<p style="color:var(--text-muted)">⏳ Oppsummerer uke ' + escapeHtmlClient(week) + ' &hellip;</p>');
        modal.setButtons([
            { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
        ]);
        modal.open();
        fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week: week }),
        }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
        .then(function(res){
            if (!res.ok || !res.j || !res.j.ok) {
                var msg = (res.j && (res.j.error || res.j.message)) || 'Ukjent feil';
                setSummaryBody(modal,
                    '<p style="color:var(--danger,#c53030)"><strong>Kunne ikke oppsummere:</strong> '
                    + escapeHtmlClient(msg) + '</p>');
                return;
            }
            var md = res.j.summary || '';
            setSummaryBody(modal, renderMarkdown(md));
            modal.setButtons([
                { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
                { label: 'Kjør på nytt', action: function(){ runSummarize(week); return false; }, dismiss: false },
                { label: '💾 Lagre som notat', primary: true, action: function(m, btn){
                    btn.disabled = true;
                    return saveSummary(week, md).then(function(res2){
                        if (!res2.ok) {
                            alert('Kunne ikke lagre: ' + ((res2.j && res2.j.error) || 'feil'));
                            return false;
                        }
                        // Refresh the relevant <week-section> so the
                        // "📋 Vis oppsummering" button appears.
                        document.querySelectorAll('week-section').forEach(function(ws){
                            if (ws.getAttribute('week') === week && typeof ws.refresh === 'function') ws.refresh();
                        });
                    }, function(){ alert('Lagring feilet'); return false; });
                } },
            ]);
        }, function(err){
            setSummaryBody(modal,
                '<p style="color:var(--danger,#c53030)"><strong>Nettverksfeil:</strong> '
                + escapeHtmlClient(err && err.message || err) + '</p>');
        });
    }

    function showSavedSummary(week) {
        var modal = ensureSummaryModal();
        modal.setTitle('Oppsummering &mdash; uke ' + escapeHtmlClient(week));
        setSummaryBody(modal, '<p style="color:var(--text-muted)">⏳ Henter lagret oppsummering &hellip;</p>');
        modal.setButtons([
            { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
        ]);
        modal.open();
        fetch('/api/notes/' + encodeURIComponent(week) + '/summarize.md/raw')
            .then(function(r){ return r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)); })
            .then(function(md){
                setSummaryBody(modal, renderMarkdown(md));
                modal.setButtons([
                    { label: 'Lukk', variant: 'ghost', action: function(m){ m.close('button'); }, dismiss: false },
                    { label: '✨ Kjør på nytt', action: function(){ runSummarize(week); return false; }, dismiss: false },
                ]);
            }, function(err){
                setSummaryBody(modal,
                    '<p style="color:var(--danger,#c53030)"><strong>Kunne ikke hente:</strong> '
                    + escapeHtmlClient(err && err.message || err) + '</p>');
            });
    }

    window.summarizeWeek = runSummarize;
    window.showWeekSummary = showSavedSummary;
    document.addEventListener('week-section:summarize', function(e){
        var w = e.detail && e.detail.week;
        if (w) runSummarize(w);
    });
    document.addEventListener('week-section:show-summary', function(e){
        var w = e.detail && e.detail.week;
        if (w) showSavedSummary(w);
    });

    //   <task-completed> emits 'task-completed:undo' when the user clicks
    //   Angre. Toggle the task back via the service and dispatch
    //   'task:uncompleted' so every list refreshes via its method.
    document.addEventListener('task-completed:undo', function(e){
        var id = e.detail && e.detail.id;
        if (!id) return;
        e.preventDefault();
        var reg = window['week-note-services'];
        var svc = reg && reg.tasks_service;
        if (!svc || typeof svc.toggle !== 'function') return;
        Promise.resolve(svc.toggle(id)).then(function(){
            document.dispatchEvent(new CustomEvent('task:uncompleted', {
                bubbles: true, detail: { id: id },
            }));
        });
    });

    // Open a note in a modal overlay using <note-view>. Used by the
    // global-search element-selected handler so clicking a note hit shows
    // the rendered note instead of navigating away from the current page.
    window.openNoteViewModal = function(week, fileEnc) {
        if (!week || !fileEnc) return;
        var existing = document.querySelector('note-view[data-search-modal]');
        if (existing) existing.remove();
        var v = document.createElement('note-view');
        v.setAttribute('notes_service', 'week-note-services.notes_service');
        v.setAttribute('data-search-modal', '1');
        v.addEventListener('note-view:close', function(){
            try { v.remove(); } catch (_) {}
        });
        document.body.appendChild(v);
        // open() opens the overlay and fetches/renders; setting via attribute
        // also works but the imperative API gives us a clean callsite.
        if (typeof v.open === 'function') v.open(week + '/' + fileEnc);
        else v.setAttribute('path', week + '/' + fileEnc), v.setAttribute('open', '');
    };

    // element-selected from <global-search>: route to the right URL by type.
    document.addEventListener('element-selected', function(e){
        var d = e.detail || {};
        var t = d.type, id = d.identifier || '';
        if (!t) return;
        e.preventDefault();
        if (typeof window.__closeGlobalSearch === 'function') window.__closeGlobalSearch();
        if (t === 'note') {
            var i = id.indexOf('/');
            if (i < 0) return;
            var week = id.slice(0, i), fileEnc = id.slice(i + 1);
            if (typeof window.openNoteViewModal === 'function') window.openNoteViewModal(week, fileEnc);
            else go('/editor/' + week + '/' + fileEnc);
        } else if (t === 'meeting') {
            // identifier is meeting id; we don't know the week here, so defer to /api/meetings? Keep simple: jump to calendar list.
            go('/calendar#m-' + encodeURIComponent(id));
        } else if (t === 'person') {
            fetch('/api/companies').then(function(r){ return r.ok ? r.json() : []; }).then(function(companies){
                var isCompany = (companies || []).some(function(c){ return c.key === id; });
                if (isCompany) go('/people#tab=companies&key=' + encodeURIComponent(id));
                else go('/people#' + encodeURIComponent(id));
            }).catch(function(){ go('/people#' + encodeURIComponent(id)); });
        } else if (t === 'task') {
            go('/tasks#t-' + encodeURIComponent(id));
        } else if (t === 'result') {
            go('/results#r-' + encodeURIComponent(id));
        }
    });
})();
</script>
<script type="module" src="/components/_shared.js"></script>
<script type="module">
    // Production service registry. All domain services are imported here
    // and attached to a single object on window keyed by domain name so:
    //   - components resolve <domain>_service="..." via the registry
    //   - page code can call: WeekNoteServices.tasks_service.list()
    import { ContextService }  from '/services/context.js';
    import { MeetingsService } from '/services/meetings.js';
    import { NotesService }    from '/services/notes.js';
    import { PeopleService, CompaniesService, PlacesService } from '/services/people.js';
    import { ResultsService }  from '/services/results.js';
    import { SearchService }   from '/services/search.js';
    import { SettingsService } from '/services/settings.js';
    import { TaskService }     from '/services/tasks.js';

    const registry = {
        companies_service: CompaniesService,
        context_service:   ContextService,
        meetings_service:  MeetingsService,
        notes_service:     NotesService,
        people_service:    PeopleService,
        places_service:    PlacesService,
        results_service:   ResultsService,
        search_service:    SearchService,
        settings_service:  SettingsService,
        tasks_service:     TaskService,
    };
    window['week-note-services'] = registry;
    window.WeekNoteServices = registry;
    window.mePersonKey = ${JSON.stringify(getMePersonKey(getActiveContext()) || '')};

    document.dispatchEvent(new CustomEvent('week-note-services:ready', { detail: registry }));
</script>
<script type="module" src="/components/nav-meta.js"></script>
<script type="module" src="/components/nav-button.js"></script>
<script type="module" src="/components/ctx-switcher.js"></script>
<script type="module" src="/components/markdown-preview.js"></script>
<script type="module" src="/components/modal-container.js"></script>
<script type="module" src="/components/help-modal.js"></script>
<script type="module" src="/components/note-card.js"></script>
<script type="module" src="/components/note-meta-view.js"></script>
<script type="module" src="/components/note-meta-panel.js"></script>
<script type="module" src="/components/note-view.js"></script>
<script type="module" src="/components/note-editor.js"></script>
<script type="module" src="/components/task-open-list.js"></script>
<script type="module" src="/components/task-create.js"></script>
<script type="module" src="/components/task-add-modal.js"></script>
<script type="module" src="/components/task-complete-modal.js"></script>
<script type="module" src="/components/task-note-modal.js"></script>
<script type="module" src="/components/task-edit-modal.js"></script>
<script type="module" src="/components/upcoming-meetings.js"></script>
<script type="module" src="/components/today-calendar.js"></script>
<script type="module" src="/components/meeting-create.js"></script>
<script type="module" src="/components/meeting-create-modal.js"></script>
<script type="module" src="/components/week-results.js"></script>
<script type="module" src="/components/task-completed.js"></script>
<script type="module" src="/components/task-view.js"></script>
<script type="module" src="/components/week-section.js"></script>
<script type="module" src="/components/week-list.js"></script>
<script type="module" src="/components/week-pill.js"></script>
<script type="module" src="/components/global-search.js"></script>
<script type="module" src="/components/week-calendar.js"></script>
<script type="module" src="/components/week-notes-calendar.js"></script>
<script type="module" src="/components/settings-page.js"></script>
<script type="module" src="/components/notes-page.js"></script>
<script type="module" src="/components/company-card.js"></script>
<script type="module" src="/components/person-card.js"></script>
<script type="module" src="/components/place-card.js"></script>
<script type="module" src="/components/entity-callout.js"></script>
<script type="module" src="/components/entity-mention.js"></script>
<script type="module" src="/components/inline-action.js"></script>
<script type="module" src="/components/inline-task.js"></script>
<script type="module" src="/components/inline-result.js"></script>
<script type="module" src="/components/icon-picker.js"></script>
<script type="module" src="/components/tag-editor.js"></script>
<script type="module" src="/components/people-page.js"></script>
<script type="module" src="/components/results-page.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>if(window.marked&&marked.use)marked.use({breaks:true,gfm:true});</script>
</body>
</html>`;
}



function noteSnippet(md, len) {
    if (!md) return '';
    const max = len || 200;
    let text = md
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length > max) text = text.slice(0, max).replace(/\s+\S*$/, '') + '…';
    return text;
}

function presentationStyleCss(style) {
    const styles = {
        paper: `
            :root { --r-main-font: Georgia, "Times New Roman", serif; --r-heading-font: Georgia, "Times New Roman", serif; --r-main-color: var(--text); --r-heading-color: var(--accent); --r-link-color: #2b6cb0; --r-background-color: var(--bg); }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: var(--accent); font-weight: 400; letter-spacing: -0.01em; text-transform: none; }
            .reveal h1 { border-bottom: 1px solid var(--border); padding-bottom: 12px; }
            .reveal blockquote { background: #ebf8ff; border-left: 4px solid #2b6cb0; padding: 14px 20px; box-shadow: none; color: #2c5282; font-style: normal; }
            .reveal code { background: #f5efe1; color: var(--text-muted-warm); padding: 2px 8px; border-radius: 3px; font-size: 0.85em; }
            .reveal pre { background: var(--text-strong); color: var(--border-soft); box-shadow: none; border-radius: 6px; }
            .reveal pre code { background: none; color: inherit; }
            .reveal table th { background: #2a4365; color: white; padding: 8px 12px; text-align: left; font-size: 0.85em; }
            .reveal table td { border: 1px solid var(--border-soft); padding: 8px 12px; }
            .reveal a { border-bottom: 1px dashed #2b6cb0; }
            .reveal hr { border: none; border-top: 1px solid var(--border-soft); }
        `,
        noir: `
            :root { --r-main-font: Georgia, "Times New Roman", serif; --r-heading-font: Georgia, "Times New Roman", serif; --r-main-color: var(--border-soft); --r-heading-color: #f5e6a8; --r-link-color: #f0c674; --r-background-color: #0d0d0d; }
            body { background: #0d0d0d; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #f5e6a8; font-weight: 400; letter-spacing: -0.01em; text-transform: none; }
            .reveal h1 { border-bottom: 1px solid #3a3a3a; padding-bottom: 12px; color: var(--surface); }
            .reveal h2 { color: #f5e6a8; font-style: italic; }
            .reveal blockquote { background: rgba(245,230,168,0.08); border-left: 3px solid #f5e6a8; padding: 14px 20px; box-shadow: none; color: #f5e6a8; font-style: italic; }
            .reveal code { background: #1a1a1a; color: #7ee787; padding: 2px 8px; border-radius: 3px; border: 1px solid #2a2a2a; }
            .reveal pre { background: #050505; color: var(--border-soft); box-shadow: none; border: 1px solid #2a2a2a; border-radius: 6px; }
            .reveal pre code { background: none; color: inherit; border: none; }
            .reveal table th { background: #1a1a1a; color: #f5e6a8; padding: 8px 12px; text-align: left; font-size: 0.85em; border-bottom: 1px solid #3a3a3a; }
            .reveal table td { border: 1px solid #2a2a2a; padding: 8px 12px; color: var(--border-soft); }
            .reveal a { color: #f0c674; border-bottom: 1px dashed #f0c674; }
            .reveal strong { color: var(--surface); }
            .reveal em { color: #f0c674; }
        `,
        klassisk: `
            :root { --r-main-font: "Times New Roman", Times, serif; --r-heading-font: "Times New Roman", Times, serif; --r-main-color: #1a1a1a; --r-heading-color: #000; --r-link-color: #0066cc; --r-background-color: #ffffff; }
            body { background: #ffffff; }
            .reveal .slides { text-align: center; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #000; font-weight: 700; letter-spacing: 0; text-transform: none; font-family: "Times New Roman", Times, serif; }
            .reveal h1 { font-size: 2.6em; margin-bottom: 0.5em; }
            .reveal h2 { font-size: 1.9em; }
            .reveal p, .reveal li { font-size: 1.1em; line-height: 1.5; }
            .reveal blockquote { background: transparent; border-left: 4px solid #000; padding: 8px 24px; box-shadow: none; color: #1a1a1a; font-style: italic; font-size: 1.1em; }
            .reveal code { background: #f0f0f0; color: #1a1a1a; padding: 2px 6px; border-radius: 0; font-family: "Courier New", Courier, monospace; }
            .reveal pre { background: #f0f0f0; color: #1a1a1a; box-shadow: none; border-radius: 0; font-family: "Courier New", Courier, monospace; }
            .reveal pre code { background: none; color: inherit; }
            .reveal table th { background: #000; color: #fff; padding: 10px 14px; }
            .reveal table td { border: 1px solid #1a1a1a; padding: 8px 14px; }
            .reveal a { color: #0066cc; }
            .reveal hr { border: none; border-top: 2px solid #000; width: 30%; margin: 1em auto; }
        `,
        levende: `
            :root { --r-main-font: "Helvetica Neue", Helvetica, Arial, sans-serif; --r-heading-font: "Helvetica Neue", Helvetica, Arial, sans-serif; --r-main-color: #ffffff; --r-heading-color: #ffffff; --r-link-color: #ffe066; --r-background-color: #2d1b69; }
            body { background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%) !important; background-attachment: fixed !important; }
            .reveal { color: #ffffff; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #ffffff; font-weight: 800; letter-spacing: -0.02em; text-transform: none; text-shadow: 0 2px 12px rgba(0,0,0,0.25); }
            .reveal h1 { font-size: 3.2em; background: linear-gradient(90deg, #ffe066, #f093fb); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
            .reveal h2 { font-size: 2.2em; }
            .reveal blockquote { background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border-left: 4px solid #ffe066; padding: 14px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); color: #ffffff; border-radius: 4px; }
            .reveal code { background: rgba(0,0,0,0.35); color: #ffe066; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
            .reveal pre { background: rgba(0,0,0,0.45); color: #f8f8f2; box-shadow: 0 8px 24px rgba(0,0,0,0.2); border-radius: 8px; backdrop-filter: blur(10px); }
            .reveal pre code { background: none; color: inherit; }
            .reveal table th { background: rgba(0,0,0,0.35); color: #ffe066; padding: 10px 14px; text-align: left; }
            .reveal table td { border: 1px solid rgba(255,255,255,0.2); padding: 8px 14px; color: #ffffff; }
            .reveal a { color: #ffe066; border-bottom: 1px solid #ffe066; }
            .reveal strong { color: #ffe066; }
            .reveal em { color: #f093fb; }
            .reveal hr { border: none; border-top: 2px solid rgba(255,255,255,0.3); }
        `,
        minimal: `
            :root { --r-main-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; --r-heading-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; --r-main-color: #2d3748; --r-heading-color: var(--text-strong); --r-link-color: #3182ce; --r-background-color: #ffffff; }
            body { background: #ffffff; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: var(--text-strong); font-weight: 200; letter-spacing: -0.03em; text-transform: none; }
            .reveal h1 { font-size: 4em; font-weight: 100; }
            .reveal h2 { font-size: 2.4em; font-weight: 200; color: var(--text-muted); }
            .reveal h3 { font-size: 1.6em; font-weight: 300; color: #718096; }
            .reveal p, .reveal li { font-size: 1.05em; color: var(--text-muted); line-height: 1.7; font-weight: 300; }
            .reveal blockquote { background: transparent; border-left: 2px solid #cbd5e0; padding: 4px 24px; box-shadow: none; color: #718096; font-style: normal; font-weight: 300; }
            .reveal code { background: #f7fafc; color: var(--text-muted); padding: 1px 6px; border-radius: 2px; font-size: 0.85em; border: 1px solid #edf2f7; }
            .reveal pre { background: #f7fafc; color: #2d3748; box-shadow: none; border-radius: 4px; border: 1px solid #edf2f7; }
            .reveal pre code { background: none; color: inherit; border: none; }
            .reveal table th { background: transparent; color: var(--text-strong); padding: 10px 0; text-align: left; border-bottom: 2px solid var(--text-strong); font-weight: 600; }
            .reveal table td { border: none; border-bottom: 1px solid #edf2f7; padding: 10px 0; color: var(--text-muted); font-weight: 300; }
            .reveal a { color: #3182ce; border-bottom: 1px solid #3182ce; }
            .reveal strong { color: var(--text-strong); font-weight: 600; }
            .reveal hr { border: none; border-top: 1px solid #edf2f7; }
        `,
        matrix: `
            :root { --r-main-font: "Courier New", Courier, ui-monospace, monospace; --r-heading-font: "Courier New", Courier, ui-monospace, monospace; --r-main-color: #00ff41; --r-heading-color: #00ff41; --r-link-color: #39ff14; --r-background-color: #000000; }
            body { background: #000000; }
            .matrix-rain { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.35; }
            .reveal { color: #00ff41; text-shadow: 0 0 6px rgba(0,255,65,0.55); position: relative; z-index: 1; }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: #00ff41; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 0 10px rgba(0,255,65,0.7), 0 0 22px rgba(0,255,65,0.35); }
            .reveal h1 { font-size: 2.6em; border-bottom: 1px solid rgba(0,255,65,0.4); padding-bottom: 12px; }
            .reveal h2 { font-size: 1.9em; }
            .reveal h3 { color: #39ff14; font-size: 1.4em; }
            .reveal p, .reveal li { color: #00ff41; }
            .reveal blockquote { background: rgba(0,255,65,0.06); border-left: 3px solid #00ff41; padding: 14px 20px; box-shadow: 0 0 20px rgba(0,255,65,0.18); color: #b9ffc6; font-style: italic; }
            .reveal code { background: rgba(0,255,65,0.08); color: #b9ffc6; padding: 2px 8px; border-radius: 0; border: 1px solid rgba(0,255,65,0.3); }
            .reveal pre { background: rgba(0,20,5,0.85); color: #00ff41; box-shadow: 0 0 20px rgba(0,255,65,0.18); border: 1px solid rgba(0,255,65,0.4); border-radius: 0; }
            .reveal pre code { background: none; color: inherit; border: none; }
            .reveal table th { background: rgba(0,255,65,0.12); color: #00ff41; padding: 8px 12px; text-align: left; font-size: 0.85em; text-transform: uppercase; border-bottom: 1px solid #00ff41; }
            .reveal table td { border: 1px solid rgba(0,255,65,0.25); padding: 8px 12px; color: #b9ffc6; }
            .reveal a { color: #39ff14; border-bottom: 1px dashed #39ff14; text-shadow: 0 0 8px rgba(57,255,20,0.6); }
            .reveal strong { color: #ffffff; text-shadow: 0 0 8px rgba(255,255,255,0.6); }
            .reveal em { color: #b9ffc6; }
            .reveal hr { border: none; border-top: 1px dashed rgba(0,255,65,0.4); }
            .reveal ::selection { background: #00ff41; color: #000; }
        `,
        nav: `
            :root { --r-main-font: var(--ax-font-family, "Source Sans 3", "Source Sans Pro", Arial, sans-serif); --r-heading-font: var(--ax-font-family, "Source Sans 3", "Source Sans Pro", Arial, sans-serif); --r-main-color: var(--ax-neutral-1000, #202733); --r-heading-color: var(--ax-neutral-1000, #202733); --r-link-color: var(--ax-accent-700, #0063c1); --r-background-color: #ffffff; }
            body { background: #ffffff; font-family: var(--ax-font-family, "Source Sans 3", "Source Sans Pro", Arial, sans-serif); }
            .reveal .slides { text-align: left; }
            .reveal h1, .reveal h2, .reveal h3, .reveal h4 { color: var(--ax-neutral-1000, #202733); font-weight: 600; text-transform: none; letter-spacing: -0.01em; }
            .reveal h1 { font-size: 2.6em; font-weight: 600; }
            .reveal h2 { font-size: 1.9em; font-weight: 600; color: var(--ax-neutral-1000, #202733); }
            .reveal h3 { color: var(--ax-accent-700, #0063c1); font-size: 1.35em; font-weight: 600; }
            .reveal h4 { color: var(--ax-neutral-900, #49515e); font-size: 1.1em; font-weight: 600; }
            .reveal p, .reveal li { color: var(--ax-neutral-1000, #202733); line-height: 1.55; font-size: 1em; font-weight: 400; }
            .reveal blockquote { background: var(--ax-accent-100, #f1f7ff); border-left: 4px solid var(--ax-accent-600, #2176d4); padding: 16px 20px; box-shadow: none; color: var(--ax-neutral-1000, #202733); font-style: normal; font-size: 1em; border-radius: 4px; }
            .reveal code { background: var(--ax-neutral-100, #f5f6f7); color: var(--ax-neutral-1000, #202733); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
            .reveal pre { background: var(--ax-neutral-100, #f5f6f7); color: var(--ax-neutral-1000, #202733); box-shadow: none; border-radius: 8px; }
            .reveal pre code { background: none; color: inherit; }
            .reveal table { border-collapse: collapse; }
            .reveal table th { background: transparent; color: var(--ax-neutral-1000, #202733); padding: 10px 14px; text-align: left; font-weight: 600; border: none; border-bottom: 2px solid var(--ax-neutral-1000, #202733); }
            .reveal table td { border: none; border-bottom: 1px solid var(--ax-neutral-200, #ecedef); padding: 10px 14px; color: var(--ax-neutral-1000, #202733); }
            .reveal a { color: var(--ax-accent-700, #0063c1); border-bottom: 1px solid var(--ax-accent-700, #0063c1); text-decoration: none; font-weight: 600; }
            .reveal a:hover { color: var(--ax-accent-900, #004ea3); border-bottom-color: var(--ax-accent-900, #004ea3); }
            .reveal strong { color: var(--ax-neutral-1000, #202733); font-weight: 600; }
            .reveal em { color: var(--ax-neutral-1000, #202733); font-style: italic; }
            .reveal hr { border: none; border-top: 1px solid var(--ax-neutral-400, #cfd3d8); margin: 24px 0; }
            .reveal ul li::marker { color: var(--ax-accent-600, #2176d4); }
            .reveal ol li::marker { color: var(--ax-neutral-1000, #202733); font-weight: 600; }
            .reveal .progress { color: var(--ax-accent-600, #2176d4); }
            .reveal .controls { color: var(--ax-accent-700, #0063c1); }
            .reveal ::selection { background: var(--ax-accent-200, #e4eeff); color: var(--ax-neutral-1000, #202733); }
            .nav-logo { position: fixed; top: -22vh; left: -8vh; z-index: 0; width: 70vh; height: 70vh; pointer-events: none; opacity: 0.15; }
            .nav-logo svg { width: 100%; height: 100%; display: block; }
            .reveal { position: relative; z-index: 1; }
        `
    };
    return styles[style] || styles.paper;
}

function presentationPageHtml(week, file, content, style) {
    const name = file.replace(/\.md$/, '');
    const safeContent = String(content || '').replace(/<\/script>/gi, '<\\/script>');
    const themeCss = presentationStyleCss(style);
    return `<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>${escapeHtml(name)} · Presentasjon</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/white.css" id="theme">
    ${style === 'nav' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap"><link rel="stylesheet" href="https://unpkg.com/@navikt/ds-tokens@8.10.2/dist/tokens.css">' : ''}
    <style>
        ${themeCss}
        .reveal table { border-collapse: collapse; width: 100%; }
        .reveal pre { padding: 16px; overflow-x: auto; }
        .reveal ul, .reveal ol { display: block; }
        .pres-toolbar { position: fixed; top: 8px; right: 12px; z-index: 60; display: flex; gap: 6px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; opacity: 0.35; transition: opacity 0.2s; }
        .pres-toolbar:hover { opacity: 1; }
        .pres-toolbar a, .pres-toolbar button { background: rgba(255,253,247,0.95); border: 1px solid var(--border); color: var(--text); padding: 4px 10px; font-size: 0.78em; border-radius: 4px; text-decoration: none; cursor: pointer; }
        .pres-toolbar a:hover, .pres-toolbar button:hover { background: var(--surface-alt); color: var(--accent); }
        .fs-overlay { position: fixed; inset: 0; background: rgba(26,54,93,0.92); color: var(--surface); z-index: 1000; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 16px; cursor: pointer; font-family: Georgia, "Times New Roman", serif; }
        .fs-overlay.show { display: flex; }
        .fs-overlay .fs-icon { font-size: 4em; }
        .fs-overlay .fs-title { font-size: 2em; font-style: italic; }
        .fs-overlay .fs-hint { font-size: 1em; opacity: 0.75; font-family: -apple-system, sans-serif; font-style: normal; }
        .fs-overlay .fs-skip { position: absolute; bottom: 18px; right: 18px; font-size: 0.8em; opacity: 0.6; font-family: -apple-system, sans-serif; }
    </style>
</head>
<body${style === 'matrix' ? ' class="is-matrix"' : ''}>
    ${style === 'matrix' ? '<canvas class="matrix-rain" id="matrixRain"></canvas>' : ''}
    <div class="pres-toolbar">
        <a href="/editor/${week}/${encodeURIComponent(file)}" title="Rediger">✏️ Rediger</a>
        <a href="#" onclick="window.close();return false;" title="Lukk">✕ Lukk</a>
    </div>
    ${style === 'nav' ? `<div class="nav-logo" aria-label="NAV"><svg viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#C30000"/><path fill-rule="evenodd" clip-rule="evenodd" d="M19.814 8.78589H17.9828C17.9828 8.78589 17.8566 8.78589 17.812 8.89741L16.7985 12.0013L15.786 8.89741C15.7414 8.78589 15.6144 8.78589 15.6144 8.78589H12.0934C12.0172 8.78589 11.9533 8.84958 11.9533 8.92535V9.97942C11.9533 9.14327 11.064 8.78589 10.5433 8.78589C9.3772 8.78589 8.59659 9.55433 8.35354 10.7226C8.34037 9.94758 8.27598 9.66987 8.06732 9.38546C7.97147 9.24612 7.83293 9.12899 7.68208 9.03211C7.37147 8.85007 7.09257 8.78589 6.49318 8.78589H5.78939C5.78939 8.78589 5.6622 8.78589 5.61732 8.89741L4.97695 10.4852V8.92535C4.97695 8.84958 4.91354 8.78589 4.83744 8.78589H3.20891C3.20891 8.78589 3.08317 8.78589 3.03744 8.89741L2.37171 10.5484C2.37171 10.5484 2.30525 10.7135 2.4572 10.7135H3.08317V13.8594C3.08317 13.9375 3.14464 13.9994 3.22305 13.9994H4.83744C4.91354 13.9994 4.97695 13.9375 4.97695 13.8594V10.7135H5.60622C5.96732 10.7135 6.04378 10.7233 6.18427 10.7889C6.26891 10.8208 6.34513 10.8855 6.38671 10.96C6.47183 11.1204 6.49318 11.3129 6.49318 11.8806V13.8594C6.49318 13.9375 6.55586 13.9994 6.6333 13.9994H8.18062C8.18062 13.9994 8.35549 13.9994 8.42464 13.8266L8.76757 12.9786C9.22354 13.6176 9.97403 13.9994 10.9067 13.9994H11.1105C11.1105 13.9994 11.2865 13.9994 11.3561 13.8266L11.9533 12.3468V13.8594C11.9533 13.9375 12.0172 13.9994 12.0934 13.9994H13.6729C13.6729 13.9994 13.8472 13.9994 13.9172 13.8266C13.9172 13.8266 14.5489 12.2574 14.5514 12.2456H14.5523C14.5766 12.115 14.4117 12.115 14.4117 12.115H13.8479V9.42243L15.6217 13.8266C15.691 13.9994 15.8656 13.9994 15.8656 13.9994H17.7316C17.7316 13.9994 17.9072 13.9994 17.9765 13.8266L19.9429 8.95475C20.011 8.78589 19.814 8.78589 19.814 8.78589ZM11.9531 12.115H10.8921C10.4698 12.115 10.1263 11.7729 10.1263 11.3499C10.1263 10.9276 10.4698 10.5833 10.8921 10.5833H11.1888C11.61 10.5833 11.9531 10.9276 11.9531 11.3499V12.115Z" fill="white"/></svg></div>` : ''}
    <div class="fs-overlay" id="fsOverlay">
        <div class="fs-icon">🎤</div>
        <div class="fs-title">${escapeHtml(name)}</div>
        <div class="fs-hint">Klikk hvor som helst for å starte i fullskjerm</div>
        <div class="fs-skip">Esc lukker presentasjonen</div>
    </div>
    <div class="reveal">
        <div class="slides">
            <section data-markdown data-separator="^---$" data-separator-vertical="^--$" data-separator-notes="^Note:">
                <textarea data-template>${escapeHtml(safeContent)}</textarea>
            </section>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/markdown/markdown.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/highlight.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/notes/notes.js"></script>
    <script>
        Reveal.initialize({
            hash: true,
            slideNumber: 'c/t',
            controls: true,
            progress: true,
            transition: 'slide',
            plugins: [ RevealMarkdown, RevealHighlight, RevealNotes ]
        });
        (function() {
            var params = new URLSearchParams(window.location.search);
            if (params.get('fs') !== '1') return;
            var overlay = document.getElementById('fsOverlay');
            overlay.classList.add('show');
            function enterFs() {
                overlay.classList.remove('show');
                var el = document.documentElement;
                var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
                if (req) {
                    try { req.call(el).catch(function(){}); } catch (e) {}
                }
                overlay.removeEventListener('click', enterFs);
                document.removeEventListener('keydown', onStartKey);
            }
            function onStartKey(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterFs(); } }
            overlay.addEventListener('click', enterFs);
            document.addEventListener('keydown', onStartKey);
            // Esc closes the chromeless presentation window
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.close();
                }
            }, true);
        })();
        ${style === 'matrix' ? `
        (function() {
            var canvas = document.getElementById('matrixRain');
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>/=*+-'.split('');
            var fontSize = 16;
            var columns, drops;
            function resize() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                columns = Math.floor(canvas.width / fontSize);
                drops = new Array(columns).fill(0).map(function(){ return Math.random() * -50; });
            }
            resize();
            window.addEventListener('resize', resize);
            function draw() {
                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = fontSize + 'px "Courier New", monospace';
                for (var i = 0; i < drops.length; i++) {
                    var ch = chars[Math.floor(Math.random() * chars.length)];
                    var y = drops[i] * fontSize;
                    ctx.fillStyle = y < fontSize * 2 ? '#ccffd6' : '#00ff41';
                    ctx.fillText(ch, i * fontSize, y);
                    if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
                    drops[i] += 1;
                }
            }
            setInterval(draw, 55);
        })();
        ` : ''}
    </script>
</body>
</html>`;
}


function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Replace @name in already-escaped/rendered HTML with a link to /people (no @).
// Uses people + companies registries for display name and type-specific anchor.
// Markdown pre-processor for task reference markers.
// Behaviour:
//   - A run of 2+ adjacent '{{?id}}'/'{{!id}}' markers (separated
//     only by whitespace) is rewritten as an ordered task list, so
//     marked renders a single <ol> with one <inline-task> per item.
//   - A single marker is left inline as raw <inline-task> HTML,
//     which marked passes through inside the surrounding paragraph.
function preTaskMarkers(md) {
    if (!md) return md;
    const taskTag = (kind, id) => {
        const state = kind === '!' ? 'done' : 'open';
        return `<inline-task task-id="${escapeHtml(id)}" state="${state}"></inline-task>`;
    };
    // Match runs of 2+ markers separated only by whitespace.
    const runRe = /\{\{[!?][^{}\s]+\}\}(?:\s+\{\{[!?][^{}\s]+\}\})+/g;
    let out = md.replace(runRe, run => {
        const items = run.match(/\{\{([!?])([^{}\s]+)\}\}/g) || [];
        const lines = items.map(m => {
            const km = m.match(/\{\{([!?])([^{}\s]+)\}\}/);
            return `1. ${taskTag(km[1], km[2])}`;
        }).join('\n');
        return `\n\n${lines}\n\n`;
    });
    // Remaining single markers stay inline.
    out = out.replace(/\{\{([!?])([^{}\s]+)\}\}/g, (_m, kind, id) => taskTag(kind, id));
    return out;
}

function linkMentions(html, people, companies) {
    if (!html) return html;
    people = people || loadPeople();
    companies = companies || loadCompanies();
    // Reference forms first: {{?<id>}} (open) and {{!<id>}} (closed).
    // These render as interactive checkboxes via <inline-task>. When
    // the input is raw markdown, preTaskMarkers (called before marked)
    // already converted these into '1. <inline-task...>' list items;
    // this branch handles cases where linkMentions runs without the
    // pre-step (e.g. mentions inside task text).
    let out = html.replace(/\{\{([!?])([^{}\s]+)\}\}/g, (_m, kind, id) => {
        const state = kind === '!' ? 'done' : 'open';
        return `<inline-task task-id="${escapeHtml(id)}" state="${state}"></inline-task>`;
    });
    out = out.replace(/\{\{([^{}]+)\}\}/g, (_m, inner) => {
        const t = inner.trim();
        if (!t) return '';
        return `<inline-action kind="task" label="${escapeHtml(t)}"></inline-action>`;
    });
    out = out.replace(/\[\[\?([^\[\]\s]+)\]\]/g, (_m, id) => {
        return `<inline-result result-id="${escapeHtml(id)}"></inline-result>`;
    });
    out = out.replace(/\[\[([^\[\]]+)\]\]/g, (_m, inner) => {
        const t = inner.trim();
        if (!t) return '';
        return `<inline-action kind="result" label="${escapeHtml(t)}"></inline-action>`;
    });
    return out.replace(/(^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, (m, pre, name) => {
        let lc = name.toLowerCase();
        let displayName = name;
        if (lc === 'me') {
            // Server-side substitution: @me → mapped person key for the active context.
            // Mapping lives in data/user.json (per-machine, outside any context's git).
            const mapped = getMePersonKey(getActiveContext());
            if (!mapped) {
                return pre + `<entity-mention kind="person" key="" label="@me"></entity-mention>`;
            }
            lc = mapped;
            displayName = mapped;
        }
        const c = companies.find(x => x.key === lc);
        if (c) {
            return pre + `<entity-mention kind="company" key="${escapeHtml(c.key)}" label="${escapeHtml(c.name || displayName)}"></entity-mention>`;
        }
        const p = people.find(x => x.name === displayName || x.key === lc);
        const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : displayName;
        const key = p ? (p.key || (p.name || '').toLowerCase()) : lc;
        return pre + `<entity-mention kind="person" key="${escapeHtml(key)}" label="${escapeHtml(display)}"></entity-mention>`;
    });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// ---- Search worker (worker_threads) ----
let searchWorker = null;
const pendingSearches = new Map(); // requestId -> { resolve, reject, timer }
let searchReqSeq = 0;

function startSearchWorker() {
    if (!getAppSettings().searchIndex.enabled) return;
    try {
        searchWorker = new Worker(path.join(ROOT_DIR, 'search-worker.js'));
    } catch (e) {
        console.error('search-worker start failed', e.message);
        searchWorker = null;
        return;
    }
    searchWorker.on('message', (msg) => {
        if (msg.type === 'indexed') {
            console.log(`🔎 søkeindeks: ${msg.docCount} dok, ${msg.tokenCount} tokens (${msg.ms}ms, ${msg.trigger || 'manual'}${msg.source ? ', ' + msg.source : ''})`);
        } else if (msg.type === 'result') {
            const p = pendingSearches.get(msg.requestId);
            if (p) {
                clearTimeout(p.timer);
                pendingSearches.delete(msg.requestId);
                p.resolve(msg.results);
            }
        } else if (msg.type === 'error') {
            if (msg.requestId != null) {
                const p = pendingSearches.get(msg.requestId);
                if (p) {
                    clearTimeout(p.timer);
                    pendingSearches.delete(msg.requestId);
                    p.reject(new Error(msg.error));
                }
            } else {
                console.error('search-worker:', msg.error);
            }
        }
    });
    searchWorker.on('error', (e) => console.error('search-worker error', e));
    searchWorker.on('exit', (code) => {
        console.error('search-worker exited with code', code);
        searchWorker = null;
        for (const [, p] of pendingSearches) { clearTimeout(p.timer); p.reject(new Error('worker died')); }
        pendingSearches.clear();
    });
    reindexSearch();
}

function reindexSearch() {
    if (!searchWorker) return;
    try { searchWorker.postMessage({ type: 'reindex', contextDir: dataDir() }); }
    catch (e) { console.error('reindex post failed', e.message); }
}

function stopSearchWorker() {
    if (!searchWorker) return;
    try { searchWorker.terminate(); } catch {}
    searchWorker = null;
    for (const [, p] of pendingSearches) { clearTimeout(p.timer); p.reject(new Error('søkemotor stoppet')); }
    pendingSearches.clear();
}

function restartSearchWorker() {
    stopSearchWorker();
    if (getAppSettings().searchIndex.enabled) startSearchWorker();
}

function searchViaWorker(q, timeoutMs = 5000) {
    if (!searchWorker) {
        // Fallback to in-process search if worker isn't available
        try { return Promise.resolve(searchAll(q)); }
        catch (e) { return Promise.reject(e); }
    }
    return new Promise((resolve, reject) => {
        const requestId = ++searchReqSeq;
        const timer = setTimeout(() => {
            if (pendingSearches.has(requestId)) {
                pendingSearches.delete(requestId);
                reject(new Error('Søketid utløp'));
            }
        }, timeoutMs);
        pendingSearches.set(requestId, { resolve, reject, timer });
        try { searchWorker.postMessage({ type: 'query', q, requestId }); }
        catch (e) {
            clearTimeout(timer);
            pendingSearches.delete(requestId);
            reject(e);
        }
    });
}

// ---- Embedding worker (experimental — vector search) ----
let embedWorker = null;
let embedReady = false;
function isEmbedReady() { return embedReady; }
let embedState = { phase: 'disabled', model: null, progress: null, error: null, docCount: 0 };
const embedSseClients = new Set();
const pendingEmbed = new Map();
let embedReqSeq = 0;

function embedEmit(state) {
    embedState = Object.assign({}, embedState, state);
    const data = JSON.stringify(embedState);
    for (const res of embedSseClients) {
        try { res.write(`data: ${data}\n\n`); } catch {}
    }
}

// Pull "relations" out of a markdown note: @mentions, {{tasks}}, [[results]].
// Used to enrich the searchable blob so a note that mentions @anna surfaces
// when searching for "anna", and tasks/results referenced inline ride along.
function extractNoteRelations(text) {
    const out = [];
    if (!text) return out;
    const mentionRe = /(?:^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g;
    let m;
    while ((m = mentionRe.exec(text)) !== null) out.push('@' + m[1]);
    const taskRe = /\{\{([^{}]+)\}\}/g;
    while ((m = taskRe.exec(text)) !== null) out.push(m[1].trim());
    const resultRe = /\[\[([^\[\]]+)\]\]/g;
    while ((m = resultRe.exec(text)) !== null) out.push(m[1].trim());
    return out;
}

// Extract structured cross-entity references from a note's raw text.
// Returns { tasks, results, meetings, people, companies, places } where
// each is a sorted, deduped list of stable IDs/keys. Used by setNoteMeta
// in /api/save-note so each note's sidecar carries a manifest of what
// it references — feeds the relations panel and per-entity backlinks.
function computeNoteReferences(text) {
    const refs = { tasks: [], results: [], meetings: [], people: [], companies: [], places: [] };
    if (!text) return refs;

    // Task reference markers: {{!id}} (closed) and {{?id}} (open).
    const taskIds = new Set();
    let m;
    const taskRefRe = /\{\{[!?]([^{}\s]+)\}\}/g;
    while ((m = taskRefRe.exec(text)) !== null) taskIds.add(m[1].trim());

    // Result reference markers: [[?id]] (linked) and [[label]] (legacy /
    // pre-save). Linked form maps directly to an id; label form falls back
    // to text-matching against existing results.
    const resultIds = new Set();
    const resultRefRe = /\[\[\?([^\[\]\s]+)\]\]/g;
    while ((m = resultRefRe.exec(text)) !== null) resultIds.add(m[1].trim());

    const resultLabels = [];
    const resultLabelRe = /\[\[([^\[\]]+)\]\]/g;
    while ((m = resultLabelRe.exec(text)) !== null) {
        const t = m[1].trim();
        if (!t || t.startsWith('?') || t.startsWith('!')) continue;
        resultLabels.push(t);
    }
    if (resultLabels.length > 0) {
        try {
            const all = loadResults();
            const byText = new Map();
            for (const r of all) {
                if (!r || !r.text) continue;
                byText.set(String(r.text).trim().toLowerCase(), r.id);
            }
            for (const lbl of resultLabels) {
                const id = byText.get(lbl.toLowerCase());
                if (id) resultIds.add(id);
            }
        } catch {}
    }

    // @mentions resolve to one of: company, person, place. Companies win
    // first (linkMentions does the same), then people, then places.
    const mentionNames = extractMentions(text);
    const peopleKeys = new Set();
    const companyKeys = new Set();
    const placeKeys = new Set();
    if (mentionNames.length > 0) {
        let people = [], companies = [], places = [];
        try { people = loadPeople(); } catch {}
        try { companies = loadCompanies(); } catch {}
        try { places = loadPlaces(); } catch {}
        const compByKey = new Map(companies.filter(c => !c.deleted).map(c => [c.key, c]));
        const placeByKey = new Map(places.filter(p => !p.deleted).map(p => [p.key, p]));
        for (const name of mentionNames) {
            const lc = name.toLowerCase();
            if (compByKey.has(lc)) { companyKeys.add(lc); continue; }
            const p = people.find(x => x.name === name || x.key === lc);
            if (p) { peopleKeys.add(p.key || lc); continue; }
            if (placeByKey.has(lc)) { placeKeys.add(lc); continue; }
            // Unresolved mention — syncMentions will create a person
            // stub elsewhere; record the lowercased name so later lookups
            // can still find it.
            peopleKeys.add(lc);
        }
    }

    refs.tasks = [...taskIds].sort();
    refs.results = [...resultIds].sort();
    refs.meetings = [];
    refs.people = [...peopleKeys].sort();
    refs.companies = [...companyKeys].sort();
    refs.places = [...placeKeys].sort();
    return refs;
}

function buildEmbedDocs() {
    // Whole-record vectors for v1 (no chunking). Each doc gets a stable
    // key + content hash so the worker only re-embeds what changed.
    const docs = [];
    const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

    // Notes
    try {
        const dRoot = dataDir();
        const notesMeta = loadNotesMeta();
        for (const e of fs.readdirSync(dRoot, { withFileTypes: true })) {
            if (!e.isDirectory() || !/^\d{4}-W\d{2}$/.test(e.name)) continue;
            const wkDir = path.join(dRoot, e.name);
            for (const f of fs.readdirSync(wkDir)) {
                if (!f.endsWith('.md')) continue;
                let text = '';
                try { text = fs.readFileSync(path.join(wkDir, f), 'utf-8'); } catch { continue; }
                const title = f.replace(/\.md$/, '');
                const m = notesMeta[e.name + '/' + f] || {};
                const tags = Array.isArray(m.tags) ? m.tags
                    : (Array.isArray(m.themes) ? m.themes : []);
                const relations = extractNoteRelations(text);
                const relBlob = [...tags.map(t => '#' + t), ...relations].join(' ');
                const fullText = title + '\n\n' + (relBlob ? relBlob + '\n\n' : '') + text;
                docs.push({
                    key: 'note:' + e.name + '/' + f,
                    hash: sha(fullText),
                    text: fullText,
                    meta: { type: 'note', week: e.name, file: f, title },
                });
            }
        }
    } catch {}

    try {
        for (const t of loadTasks()) {
            const text = [t.text, t.comment, t.notes].filter(Boolean).join('\n');
            if (!text.trim()) continue;
            docs.push({
                key: 'task:' + t.id,
                hash: sha(text + (t.done ? '|done' : '|open')),
                text,
                meta: { type: 'task', id: t.id, title: t.text || '', done: !!t.done, week: t.completedWeek || t.week || '' },
            });
        }
    } catch {}

    try {
        for (const m of loadMeetings()) {
            const text = [m.title, m.location, m.notes, (m.attendees || []).join(' ')].filter(Boolean).join('\n');
            if (!text.trim()) continue;
            const week = m.date ? dateToIsoWeek(new Date(m.date + 'T00:00:00Z')) : '';
            docs.push({
                key: 'meeting:' + m.id,
                hash: sha(text + '|' + (m.date || '') + '|' + (m.start || '')),
                text,
                meta: { type: 'meeting', id: m.id, title: m.title || '', date: m.date || '', start: m.start || '', week },
            });
        }
    } catch {}

    try {
        for (const p of loadPeople()) {
            const text = [p.name, p.firstName, p.lastName, p.title, p.email, p.phone, p.notes].filter(Boolean).join('\n');
            if (!text.trim()) continue;
            const display = p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : (p.name || p.key);
            docs.push({
                key: 'person:' + (p.key || ''),
                hash: sha(text),
                text,
                meta: { type: 'person', key: p.key || '', title: display, subtitle: p.title || p.email || '@' + (p.key || '') },
            });
        }
    } catch {}

    try {
        for (const r of loadResults()) {
            if (!r.text) continue;
            docs.push({
                key: 'result:' + r.id,
                hash: sha(String(r.text)),
                text: String(r.text),
                meta: { type: 'result', id: r.id, title: r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text, week: r.week || '' },
            });
        }
    } catch {}

    return docs;
}

// docKey -> meta (kept so vector results can be hydrated to the same shape
// /api/search returns).
const embedMeta = new Map();

function stopEmbedWorker() {
    if (!embedWorker) { embedReady = false; return; }
    try { embedWorker.terminate(); } catch {}
    embedWorker = null;
    embedReady = false;
    for (const [, p] of pendingEmbed) { clearTimeout(p.timer); p.reject(new Error('embed-worker stopped')); }
    pendingEmbed.clear();
}

function startEmbedWorker() {
    if (embedWorker) return;
    const app = getAppSettings();
    if (!app.vectorSearch.enabled) {
        embedEmit({ phase: 'disabled', model: app.vectorSearch.model, progress: null, error: null, docCount: 0 });
        return;
    }
    const model = app.vectorSearch.model || DEFAULT_EMBED_MODEL;
    try {
        embedWorker = new Worker(path.join(ROOT_DIR, 'embed-worker.js'));
    } catch (e) {
        console.error('embed-worker start failed', e.message);
        embedWorker = null;
        embedEmit({ phase: 'error', model, error: e.message });
        return;
    }
    embedEmit({ phase: 'loading', model, progress: null, error: null });
    embedWorker.on('message', (msg) => {
        if (msg.type === 'ready') {
            embedReady = true;
            console.log(`🧠 embed-worker klar (${msg.model}, ${msg.cached} cachet, ${msg.ms}ms)`);
            embedEmit({ phase: 'ready', model: msg.model, progress: null, error: null, docCount: msg.docCount });
            reindexEmbeddings();
        } else if (msg.type === 'modelProgress') {
            // transformers.js progress callback emits a few statuses.
            //   initiate / download / done / ready: no pct
            //   progress:        pct is 0..100 for the named file
            //   progress_total:  pct is 0..1 fraction of total bytes
            // Normalize to 0..100 here so the UI can display it directly.
            let pct = null;
            if (typeof msg.progress === 'number') {
                pct = msg.status === 'progress_total' ? msg.progress * 100 : msg.progress;
            }
            embedEmit({ phase: 'loading', model: msg.model, progress: { status: msg.status, file: msg.file, pct } });
        } else if (msg.type === 'indexed') {
            console.log(`🧠 embed-indeks: ${msg.total} dok (+${msg.changed} embedded i ${msg.ms}ms)`);
            embedEmit({ phase: 'ready', docCount: msg.total });
        } else if (msg.type === 'queryResult') {
            const p = pendingEmbed.get(msg.requestId);
            if (p) { clearTimeout(p.timer); pendingEmbed.delete(msg.requestId); p.resolve(msg.hits || []); }
        } else if (msg.type === 'error') {
            if (msg.requestId != null) {
                const p = pendingEmbed.get(msg.requestId);
                if (p) { clearTimeout(p.timer); pendingEmbed.delete(msg.requestId); p.reject(new Error(msg.error)); }
            } else {
                console.error('embed-worker:', msg.error);
                embedEmit({ phase: 'error', error: msg.error });
            }
        }
    });
    embedWorker.on('error', (e) => {
        console.error('embed-worker error', e);
        embedEmit({ phase: 'error', error: e.message });
    });
    embedWorker.on('exit', (code) => {
        if (code !== 0) console.error('embed-worker exited with code', code);
        embedWorker = null; embedReady = false;
        for (const [, p] of pendingEmbed) { clearTimeout(p.timer); p.reject(new Error('embed-worker died')); }
        pendingEmbed.clear();
    });
    try { embedWorker.postMessage({ type: 'init', contextDir: dataDir(), model }); }
    catch (e) {
        console.error('embed init post failed', e.message);
        embedEmit({ phase: 'error', error: e.message });
    }
}

function restartEmbedWorker() {
    stopEmbedWorker();
    embedMeta.clear();
    startEmbedWorker();
}

function reindexEmbeddings() {
    if (!embedWorker || !embedReady) return;
    const docs = buildEmbedDocs();
    embedMeta.clear();
    for (const d of docs) embedMeta.set(d.key, d.meta);
    try { embedWorker.postMessage({ type: 'index', docs: docs.map(({ meta, ...rest }) => rest) }); }
    catch (e) { console.error('embed index post failed', e.message); }
}

function vectorSearchViaWorker(q, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!embedWorker || !embedReady) return reject(new Error('embed-worker ikke klar'));
        const requestId = ++embedReqSeq;
        const timer = setTimeout(() => {
            if (pendingEmbed.has(requestId)) { pendingEmbed.delete(requestId); reject(new Error('embed-søket utløp')); }
        }, timeoutMs);
        pendingEmbed.set(requestId, { resolve, reject, timer });
        try { embedWorker.postMessage({ type: 'query', q, requestId }); }
        catch (e) { clearTimeout(timer); pendingEmbed.delete(requestId); reject(e); }
    });
}

// ---- Summarize worker (local seq2seq summarization) ----
let summarizeWorker = null;
let summarizeReady = false;
let summarizeState = { phase: 'disabled', model: null, progress: null, error: null };
const summarizeSseClients = new Set();
const pendingSummarize = new Map();
let summarizeReqSeq = 0;

function summarizeEmit(state) {
    summarizeState = Object.assign({}, summarizeState, state);
    const data = JSON.stringify(summarizeState);
    for (const res of summarizeSseClients) {
        try { res.write(`data: ${data}\n\n`); } catch {}
    }
}

function isRemoteSummarizeModel(id) {
    const m = SUMMARIZE_MODELS.find(x => x.id === id);
    return !!(m && m.remote);
}

function stopSummarizeWorker() {
    if (!summarizeWorker) { summarizeReady = false; return; }
    try { summarizeWorker.terminate(); } catch {}
    summarizeWorker = null;
    summarizeReady = false;
    for (const [, p] of pendingSummarize) { clearTimeout(p.timer); p.reject(new Error('summarize-worker stopped')); }
    pendingSummarize.clear();
}

function startSummarizeWorker() {
    if (summarizeWorker) return;
    const app = getAppSettings();
    if (!app.summarization.enabled) {
        summarizeEmit({ phase: 'disabled', model: app.summarization.model, progress: null, error: null });
        return;
    }
    const model = app.summarization.model || DEFAULT_SUMMARIZE_MODEL;
    if (isRemoteSummarizeModel(model)) {
        // Remote model has nothing to load. Mark ready immediately.
        summarizeReady = true;
        summarizeEmit({ phase: 'ready', model, progress: null, error: null });
        return;
    }
    try {
        summarizeWorker = new Worker(path.join(ROOT_DIR, 'summarize-worker.js'));
    } catch (e) {
        console.error('summarize-worker start failed', e.message);
        summarizeWorker = null;
        summarizeEmit({ phase: 'error', model, error: e.message });
        return;
    }
    summarizeEmit({ phase: 'loading', model, progress: null, error: null });
    summarizeWorker.on('message', (msg) => {
        if (msg.type === 'ready') {
            summarizeReady = true;
            console.log(`📝 summarize-worker klar (${msg.model}, ${msg.ms}ms)`);
            summarizeEmit({ phase: 'ready', model: msg.model, progress: null, error: null });
        } else if (msg.type === 'modelProgress') {
            let pct = null;
            if (typeof msg.progress === 'number') {
                pct = msg.status === 'progress_total' ? msg.progress * 100 : msg.progress;
            }
            summarizeEmit({ phase: 'loading', model: msg.model, progress: { status: msg.status, file: msg.file, pct } });
        } else if (msg.type === 'summaryResult') {
            const p = pendingSummarize.get(msg.requestId);
            if (p) { clearTimeout(p.timer); pendingSummarize.delete(msg.requestId); p.resolve(msg.text || ''); }
        } else if (msg.type === 'error') {
            if (msg.requestId != null) {
                const p = pendingSummarize.get(msg.requestId);
                if (p) { clearTimeout(p.timer); pendingSummarize.delete(msg.requestId); p.reject(new Error(msg.error)); }
            } else {
                console.error('summarize-worker:', msg.error);
                summarizeEmit({ phase: 'error', error: msg.error });
            }
        }
    });
    summarizeWorker.on('error', (e) => {
        console.error('summarize-worker error', e);
        summarizeEmit({ phase: 'error', error: e.message });
    });
    summarizeWorker.on('exit', (code) => {
        if (code !== 0) console.error('summarize-worker exited with code', code);
        summarizeWorker = null; summarizeReady = false;
        for (const [, p] of pendingSummarize) { clearTimeout(p.timer); p.reject(new Error('summarize-worker died')); }
        pendingSummarize.clear();
    });
    try { summarizeWorker.postMessage({ type: 'init', model }); }
    catch (e) {
        console.error('summarize init post failed', e.message);
        summarizeEmit({ phase: 'error', error: e.message });
    }
}

function restartSummarizeWorker() {
    stopSummarizeWorker();
    startSummarizeWorker();
}

function summarizeViaLocalWorker(text, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        if (!summarizeWorker || !summarizeReady) return reject(new Error('summarize-worker ikke klar'));
        const requestId = ++summarizeReqSeq;
        const timer = setTimeout(() => {
            if (pendingSummarize.has(requestId)) { pendingSummarize.delete(requestId); reject(new Error('summarize utløp')); }
        }, timeoutMs);
        pendingSummarize.set(requestId, { resolve, reject, timer });
        try { summarizeWorker.postMessage({ type: 'summarize', text, requestId }); }
        catch (e) { clearTimeout(timer); pendingSummarize.delete(requestId); reject(e); }
    });
}


function vectorHitToSearchResult(hit) {
    const m = embedMeta.get(hit.key);
    if (!m) return null;
    if (m.type === 'note') {
        return {
            type: 'note',
            identifier: m.week + '/' + encodeURIComponent(m.file),
            title: m.title,
            subtitle: m.week + '/' + m.file,
            href: '/' + m.week + '/' + encodeURIComponent(m.file),
            snippet: '',
            score: hit.score,
        };
    }
    if (m.type === 'task') {
        return {
            type: 'task', identifier: m.id, title: m.title || '(uten tittel)',
            subtitle: (m.done ? '✓ ' : '☐ ') + (m.week || ''),
            href: '/tasks', snippet: '', score: hit.score,
        };
    }
    if (m.type === 'meeting') {
        return {
            type: 'meeting', identifier: m.id, title: m.title || '(uten tittel)',
            subtitle: (m.date || '') + (m.start ? ' ' + m.start : ''),
            href: m.week ? `/calendar/${m.week}#m-${encodeURIComponent(m.id)}` : '/calendar',
            snippet: '', score: hit.score,
        };
    }
    if (m.type === 'person') {
        return {
            type: 'person', identifier: m.key, title: m.title, subtitle: m.subtitle,
            href: '/people#' + encodeURIComponent(m.key),
            snippet: '', score: hit.score,
        };
    }
    if (m.type === 'result') {
        return {
            type: 'result', identifier: m.id, title: m.title, subtitle: m.week,
            href: '/results', snippet: '', score: hit.score,
        };
    }
    return null;
}

module.exports = {
  ACTIVE_FILE,
  APP_SETTINGS_FILE,
  CONTEXTS_DIR,
  CONTEXT_ICONS,
  CUSTOM_THEMES_DIR,
  DEFAULT_EMBED_MODEL,
  DEFAULT_MEETING_TYPES,
  DEFAULT_SUMMARIZE_MODEL,
  DISCONNECTED_FILE,
  EMBED_MODELS,
  PORT,
  SUMMARIZE_MODELS,
  THEMES,
  THEME_LABELS,
  THEME_VAR_NAMES,
  USER_FILE,
  WEEK_NOTES_MARKER,
  WEEK_NOTES_VERSION,
  Worker,
  _cacheGetCollection,
  _cacheInvalidateCollection,
  _cacheInvalidateContext,
  _cacheInvalidateNotesMeta,
  _cacheInvalidateSettings,
  _cacheSetCollection,
  _cloneArray,
  _ctxCache,
  _ctxCacheBucket,
  _ensureNotesMetaBucket,
  _loadWeekNotesMeta,
  _mdFilesCache,
  _noteContentCache,
  _statMtime,
  _weekDirsCache,
  buildEmbedDocs,
  checkExternalTools,
  clearTaskNoteRef,
  cloneContext,
  commentModalHtml,
  companiesFile,
  computeNoteReferences,
  contextSwitcherHtml,
  createContext,
  crypto,
  currentIsoWeek,
  currentReleaseTag,
  dataDir,
  dateToIsoWeek,
  deleteCustomTheme,
  deleteNoteMeta,
  disconnectContext,
  embedEmit,
  embedMeta,
  embedReady,
  embedReqSeq,
  embedSseClients,
  embedState,
  embedWorker,
  ensureAllContextsInitialised,
  entityDir,
  entityLegacyFile,
  escapeHtml,
  execSync,
  extractCloseMarkers,
  extractInlineTasks,
  extractMentions,
  extractNoteRelations,
  extractResults,
  extractTaskRefs,
  findTheme,
  forgetDisconnected,
  fs,
  getActiveContext,
  getActiveTheme,
  getAppSettings,
  getCalendarActivity,
  getContextSettings,
  getContextThemes,
  getCurrentYearWeek,
  getDefaultMeetingMinutes,
  getGhToken,
  getMdFiles,
  getMePersonKey,
  getNoteMeta,
  getUpcomingMeetingsDays,
  getUser,
  getWeekDirs,
  getWorkHours,
  git,
  gitCommitAll,
  gitCurrentBranch,
  gitGetRemote,
  gitInitIfNeeded,
  gitIsDirty,
  gitIsRepo,
  gitLastCommit,
  gitPull,
  gitPullInitial,
  gitPush,
  gitRemoteHasFile,
  http,
  https,
  iconPickerHtml,
  isEmbedReady,
  isRemoteSummarizeModel,
  isValidThemeId,
  isoToLocalDateTime,
  isoWeekMonday,
  isoWeekToDateRange,
  itemStem,
  linkMentions,
  listAllThemes,
  listBuiltinThemes,
  listContexts,
  listCustomThemes,
  loadAllCompanies,
  loadAllPeople,
  loadAllPlaces,
  loadAllTasks,
  loadCollection,
  loadCompanies,
  loadDisconnected,
  loadMeetingTypes,
  loadMeetings,
  loadNotesMeta,
  loadPeople,
  loadPlaces,
  loadResults,
  loadTasks,
  marked,
  meetingId,
  meetingTypeIcon,
  meetingTypeLabel,
  meetingTypesFile,
  meetingsFile,
  navLinksHtml,
  navbarHtml,
  noteModalHtml,
  noteSnippet,
  noteSnippetCached,
  notesMetaDir,
  notesMetaFile,
  notesMetaSidecarPath,
  pageHtml,
  parseThemeCss,
  path,
  pendingEmbed,
  pendingSearches,
  pendingSummarize,
  peopleFile,
  placesFile,
  preTaskMarkers,
  presentationPageHtml,
  presentationStyleCss,
  processInlineResults,
  pullContextRemote,
  readBody,
  readBuiltinTheme,
  readCustomTheme,
  readJsonDirAll,
  readMarker,
  readNoteCached,
  rebuildTaskNoteRefs,
  rebuildTaskNoteRefsScript,
  reindexEmbeddings,
  reindexSearch,
  restartEmbedWorker,
  restartSearchWorker,
  restartSummarizeWorker,
  resultsFile,
  safeName,
  safeThemeId,
  sanitizeItemFilename,
  saveCompanies,
  saveDisconnected,
  saveMeetingTypes,
  saveMeetings,
  saveNotesMeta,
  savePeople,
  savePlaces,
  saveResults,
  saveTasks,
  searchAll,
  searchMdFiles,
  searchReqSeq,
  searchSnippet,
  searchViaWorker,
  searchWorker,
  setActiveContext,
  setAppSettings,
  setContextSettings,
  setMePersonKey,
  setNoteMeta,
  shiftIsoWeek,
  startEmbedWorker,
  startSearchWorker,
  startSummarizeWorker,
  stopEmbedWorker,
  stopSearchWorker,
  stopSummarizeWorker,
  summarizeEmit,
  summarizeReady,
  summarizeReqSeq,
  summarizeSseClients,
  summarizeState,
  summarizeViaLocalWorker,
  summarizeWeek,
  summarizeWorker,
  syncCollection,
  syncMentions,
  syncTaskNote,
  syncTaskNoteRefs,
  tasksFile,
  themeCssFor,
  uniqueThemeId,
  vectorHitToSearchResult,
  vectorSearchViaWorker,
  writeCustomTheme,
  writeMarker
};
