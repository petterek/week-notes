const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { execSync } = require('child_process');
const { Worker } = require('worker_threads');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const CONTEXTS_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACTIVE_FILE = path.join(CONTEXTS_DIR, '.active');
const APP_SETTINGS_FILE = path.join(CONTEXTS_DIR, 'app-settings.json');

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

const WEEK_NOTES_MARKER = '.week-notes';
const WEEK_NOTES_VERSION = (() => {
    try {
        return require('child_process')
            .execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
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
            cwd: __dirname,
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
    if (b) delete b.notesMeta;
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

function dateToIsoWeek(d) {
    // Canonical ISO 8601 week: target = Thursday of d's week
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoWeekMonday(yearWeek) {
    const parts = (yearWeek || '').split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    return monday;
}

function currentIsoWeek() {
    return dateToIsoWeek(new Date());
}

function shiftIsoWeek(yearWeek, delta) {
    const mon = isoWeekMonday(yearWeek);
    if (!mon) return yearWeek;
    mon.setUTCDate(mon.getUTCDate() + delta * 7);
    return dateToIsoWeek(mon);
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

// Extract [bracketed text] from a note, return { results: string[], cleanNote: string }
function extractResults(noteText) {
    if (!noteText) return { results: [], cleanNote: noteText || '' };
    const extracted = [];
    // [[X]] — double-bracket result marker. Inner text becomes a new
    // result entity, the brackets are stripped on save (keeps inner text).
    const clean = noteText.replace(/\[\[([^\[\]]+)\]\]/g, (_, inner) => {
        const trimmed = inner.trim();
        if (trimmed) extracted.push(trimmed);
        return trimmed;
    });
    return { results: extracted, cleanNote: clean };
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

function loadNotesMeta() {
    const ctx = getActiveContext();
    const bucket = _ctxCacheBucket(ctx);
    if (bucket && bucket.notesMeta) {
        // Shallow-clone keys so callers can mutate.
        const out = {};
        for (const k of Object.keys(bucket.notesMeta)) out[k] = { ...bucket.notesMeta[k] };
        return out;
    }
    // New layout: notes-meta/<week>/<file>.json. Falls back to legacy
    // single-file notes-meta.json for unmigrated contexts.
    const dir = notesMetaDir();
    let result;
    if (fs.existsSync(dir)) {
        result = {};
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
                const noteFile = fname.slice(0, -5);
                try {
                    result[wd.name + '/' + noteFile] = JSON.parse(fs.readFileSync(path.join(wdir, fname), 'utf-8'));
                } catch {}
            }
        }
    } else {
        try { result = JSON.parse(fs.readFileSync(notesMetaFile(), 'utf-8')); }
        catch { result = {}; }
    }
    if (bucket) {
        // Cache a deep-ish copy.
        const cached = {};
        for (const k of Object.keys(result)) cached[k] = { ...result[k] };
        bucket.notesMeta = cached;
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
    // Cache-fast path: read from the in-memory map if present.
    const ctx = getActiveContext();
    const bucket = _ctxCacheBucket(ctx);
    if (bucket && bucket.notesMeta) {
        const v = bucket.notesMeta[week + '/' + file];
        if (v) return { ...v };
    }
    // Read the sidecar directly when present — O(1) lookup.
    try {
        return JSON.parse(fs.readFileSync(notesMetaSidecarPath(week, file), 'utf-8'));
    } catch {}
    // Fallback: scan the legacy single-file shape if the sidecar
    // doesn't exist (unmigrated context).
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
    _cacheInvalidateNotesMeta();
}

function deleteNoteMeta(week, file) {
    try { fs.unlinkSync(notesMetaSidecarPath(week, file)); } catch {}
    // Tidy empty week dir.
    try {
        const wdir = path.join(notesMetaDir(), week);
        if (fs.readdirSync(wdir).length === 0) fs.rmdirSync(wdir);
    } catch {}
    // Legacy fallback: also strip the entry from the single-file map.
    if (fs.existsSync(notesMetaFile())) {
        try {
            const meta = JSON.parse(fs.readFileSync(notesMetaFile(), 'utf-8'));
            delete meta[week + '/' + file];
            fs.writeFileSync(notesMetaFile(), JSON.stringify(meta, null, 2), 'utf-8');
        } catch {}
    }
    _cacheInvalidateNotesMeta();
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
            const ts = m.modified || (Array.isArray(m.saves) && m.saves.length ? m.saves[m.saves.length - 1] : null);
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

function getWeekDirs() {
    return fs.readdirSync(dataDir(), { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{4}-\d{1,2}$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => b.localeCompare(a));
}

function getMdFiles(weekDir) {
    try {
        return fs.readdirSync(path.join(dataDir(), weekDir))
            .filter(f => f.endsWith('.md'))
            .sort();
    } catch {
        return [];
    }
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
            const filePath = path.join(dataDir(), week, file);
            let content;
            try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }
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
            try {
                const content = fs.readFileSync(path.join(dataDir(), week, f), 'utf-8');
                context += `--- ${f} ---\n${content}\n\n`;
            } catch {}
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
        const file = path.join(__dirname, 'themes', id + '.css');
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
                <a href="#" id="navSearchBtn" data-key="/" title="Søk (Ctrl+K eller /)">🔎 Søk <kbd>Ctrl+K</kbd></a>
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
<body><header id="appHeader">${nav}</header><main id="content">${body}</main><entity-callout id="appEntityCallout"></entity-callout><help-modal></help-modal><footer id="shortcutsBar" class="shortcuts-bar" aria-label="Hurtigtaster"><span><kbd>Alt</kbd>+<kbd>H</kbd> Hjem</span><span><kbd>Alt</kbd>+<kbd>O</kbd> Oppgaver</span><span><kbd>Alt</kbd>+<kbd>K</kbd> Kalender</span><span><kbd>Alt</kbd>+<kbd>P</kbd> Personer</span><span><kbd>Alt</kbd>+<kbd>R</kbd> Resultater</span><span><kbd>Alt</kbd>+<kbd>N</kbd> Nytt notat</span><span><kbd>Alt</kbd>+<kbd>S</kbd> Innstillinger</span><span><kbd>Esc</kbd> Lukk</span><span><kbd>?</kbd> Hjelp</span></footer><script>
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
        content.innerHTML = html;
        if (pushPath) {
            history.pushState({ spa: true }, '', pushPath);
        }
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
    function splitFp(detail){
        var fp = (detail && detail.filePath) || '';
        var i = fp.indexOf('/');
        if (i < 0) return null;
        return { week: fp.slice(0, i), fileEnc: fp.slice(i + 1) };
    }
    function handleView(e){
        var p = splitFp(e.detail); if (!p) return;
        e.preventDefault();
        if (typeof window.openNoteViewModal === 'function') window.openNoteViewModal(p.week, p.fileEnc);
        else go('/note/' + p.week + '/' + p.fileEnc);
    }
    function handlePresent(e){
        var p = splitFp(e.detail); if (!p) return;
        e.preventDefault();
        if (typeof window.openPresentation === 'function') window.openPresentation(p.week, p.fileEnc);
        else window.open('/present/' + p.week + '/' + p.fileEnc + '?fs=1', '_blank');
    }
    function handleEdit(e){
        var p = splitFp(e.detail); if (!p) return;
        e.preventDefault();
        go('/editor/' + p.week + '/' + p.fileEnc);
    }
    function handleDelete(e){
        var p = splitFp(e.detail); if (!p) return;
        e.preventDefault();
        var name = decodeURIComponent(p.fileEnc).replace(/\.md$/, '');
        if (typeof window.deleteNoteFromHome === 'function') window.deleteNoteFromHome(p.week, p.fileEnc, name);
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
    document.dispatchEvent(new CustomEvent('week-note-services:ready', { detail: registry }));
</script>
<script type="module" src="/components/nav-meta.js"></script>
<script type="module" src="/components/nav-button.js"></script>
<script type="module" src="/components/ctx-switcher.js"></script>
<script type="module" src="/components/markdown-preview.js"></script>
<script type="module" src="/components/help-modal.js"></script>
<script type="module" src="/components/note-card.js"></script>
<script type="module" src="/components/note-meta-view.js"></script>
<script type="module" src="/components/note-view.js"></script>
<script type="module" src="/components/note-editor.js"></script>
<script type="module" src="/components/task-open-list.js"></script>
<script type="module" src="/components/task-create.js"></script>
<script type="module" src="/components/task-complete-modal.js"></script>
<script type="module" src="/components/upcoming-meetings.js"></script>
<script type="module" src="/components/today-calendar.js"></script>
<script type="module" src="/components/meeting-create.js"></script>
<script type="module" src="/components/week-results.js"></script>
<script type="module" src="/components/task-completed.js"></script>
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
<script type="module" src="/components/icon-picker.js"></script>
<script type="module" src="/components/tag-editor.js"></script>
<script type="module" src="/components/people-page.js"></script>
<script type="module" src="/components/results-page.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</body>
</html>`;
}

function getCurrentYearWeek() {
    return dateToIsoWeek(new Date());
}

function isoWeekToDateRange(yearWeek) {
    if (!yearWeek) return '';
    const parts = yearWeek.split('-');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return '';
    // Monday of ISO week
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7; // 0 = Mon
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const months = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
    const dM = monday.getUTCDate(), mM = monday.getUTCMonth();
    const dS = sunday.getUTCDate(), mS = sunday.getUTCMonth();
    if (mM === mS) return `${dM}.– ${dS}. ${months[mS]}`;
    return `${dM}. ${months[mM]} – ${dS}. ${months[mS]}`;
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
    out = out.replace(/\[\[([^\[\]]+)\]\]/g, (_m, inner) => {
        const t = inner.trim();
        if (!t) return '';
        return `<inline-action kind="result" label="${escapeHtml(t)}"></inline-action>`;
    });
    return out.replace(/(^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, (m, pre, name) => {
        const lc = name.toLowerCase();
        const c = companies.find(x => x.key === lc);
        if (c) {
            return pre + `<entity-mention kind="company" key="${escapeHtml(c.key)}" label="${escapeHtml(c.name || name)}"></entity-mention>`;
        }
        const p = people.find(x => x.name === name || x.key === lc);
        const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
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
        searchWorker = new Worker(path.join(__dirname, 'search-worker.js'));
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

    // Result markers: [[label]] — match against existing results by text.
    const resultLabels = [];
    const resultLabelRe = /\[\[([^\[\]]+)\]\]/g;
    while ((m = resultLabelRe.exec(text)) !== null) {
        const t = m[1].trim();
        if (t) resultLabels.push(t);
    }
    const resultIds = new Set();
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
        embedWorker = new Worker(path.join(__dirname, 'embed-worker.js'));
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
        summarizeWorker = new Worker(path.join(__dirname, 'summarize-worker.js'));
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


const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Guard: if no contexts exist, force the user onto the welcome page
    if (listContexts().length === 0) {
        const allowed = pathname === '/welcome'
            || pathname === '/welcome.css'
            || pathname.startsWith('/themes/')
            || pathname.startsWith('/api/contexts')
            || pathname === '/_layouts' || pathname === '/_layouts.html';
        if (!allowed) {
            res.writeHead(302, { Location: '/welcome' });
            res.end();
            return;
        }
    }

    // Welcome page (first-run, no contexts yet) — its own minimal HTML+CSS
    if (pathname === '/welcome.css') {
        fs.readFile(path.join(__dirname, 'welcome.css'), (err, data) => {
            if (err) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
            res.end(data);
        });
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
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); res.end('Theme not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(data);
        });
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
        fs.readFile(file, 'utf-8', (err, data) => {
            if (err) { res.writeHead(404); res.end('Page not found'); return; }
            const subs = {
                UPCOMING_MEETINGS_DAYS: String(getUpcomingMeetingsDays())
            };
            const out = data.replace(/\{\{(\w+)\}\}/g, (m, k) =>
                Object.prototype.hasOwnProperty.call(subs, k) ? subs[k] : m
            );
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(out);
        });
        return;
    }

    // Root: SPA shell. The home fragment is injected client-side from /pages/home.html.
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

    // (Old home route below — kept for reference but unreachable.)
    if (false && (pathname === '/' || pathname === '/index.html')) {
        const body =
            '<div class="home-layout" data-layout-id="div.home-layout">' +
                '<div class="main-content" data-layout-id="div.main-content">' +
                    '<aside id="taskSidebar" class="task-sidebar" data-layout-id="aside.task-sidebar">' +
                        '<div class="task-sidebar-inner"></div>' +
                    '</aside>' +
                    '<main id="homeMain" class="home-main" data-layout-id="main.home-main"></main>' +
                '</div>' +
            '</div>';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Ukenotater', body));
        return;
    }

    // Results page
    // ---------- /debug component playground ----------
    if (pathname === '/debug/_mock-services.js') {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'domains', '_mock-services.js'));
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) {
            res.writeHead(404); res.end('Not found');
        }
        return;
    }

    // Serve production service files at /services/<name>.js (used in pageHtml,
    // editor, etc. so components can resolve `service="XService"` via window)
    // and at /debug/services/<name>.js (used by the services debug page,
    // which imports them as ES modules). Also serves shared helpers at
    // /services/_shared/<file>.js → domains/_shared/<file>.js.
    {
        const sharedM = pathname.match(/^\/(?:debug\/)?services\/_shared\/([a-z_]+)\.js$/);
        if (sharedM) {
            const file = path.join(__dirname, 'domains', '_shared', sharedM[1] + '.js');
            try {
                const data = fs.readFileSync(file);
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
                res.end(data);
            } catch (e) {
                res.writeHead(404); res.end('Not found');
            }
            return;
        }
        const m = pathname.match(/^\/(?:debug\/)?services\/([a-z]+)\.js$/);
        if (m) {
            const file = path.join(__dirname, 'domains', m[1], 'service.js');
            try {
                const data = fs.readFileSync(file);
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
                res.end(data);
            } catch (e) {
                res.writeHead(404); res.end('Not found');
            }
            return;
        }
    }

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

    if (pathname === '/debug' || pathname.startsWith('/debug/')) {
        const COMPONENT_GROUPS = [
            ['Shared',    ['help-modal', 'icon-picker', 'nav-button', 'nav-meta', 'time-picker', 'week-calendar', 'week-pill']],
            ['Context',   ['ctx-switcher']],
            ['Search',    ['global-search']],
            ['Notes',     ['markdown-preview', 'note-card', 'note-editor', 'note-view']],
            ['Tasks',     ['task-complete-modal', 'task-note-modal', 'task-open-list', 'task-completed', 'task-create', 'task-create-modal']],
            ['Meetings',  ['meeting-create', 'upcoming-meetings', 'today-calendar', 'week-notes-calendar']],
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
                    <p><strong>Actions.</strong> Header buttons emit cancelable bubbling/composed events: <code>view</code>, <code>present</code> (only for <code>type=presentation</code>), <code>edit</code> and <code>delete</code>. Each carries <code>{ filePath: "WEEK/encoded-file.md" }</code>. The edit action also renders a real <code>&lt;a href="/editor/…"&gt;</code> for fallback navigation; <code>preventDefault()</code> on the event also blocks that.</p>`,
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
                    <p><strong>Lifecycle.</strong> <code>_load()</code> fetches tasks, people and companies in parallel. Renders &ldquo;Laster…&rdquo; → list / &ldquo;Ingen åpne oppgaver&rdquo; / &ldquo;Kunne ikke laste oppgaver&rdquo;. The header shows the open-task count.</p>
                    <p><strong>Interactions.</strong> Toggling a checkbox first tries the legacy global <code>window.showCommentModal(cb)</code> (so the home page's existing comment-prompt flow keeps working); if it isn't defined the component emits a fallback event. The note button works the same way against <code>window.openNoteModal(id)</code>.</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>task-open-list:toggle</code> with <code>{ id, checkbox }</code> &mdash; fallback when no global comment modal exists</li>
                        <li><code>task-open-list:note</code> with <code>{ id }</code> &mdash; fallback when no global note modal exists</li>
                        <li><code>mention-clicked</code> &mdash; bubbled from rendered <code>@mentions</code></li>
                    </ul>`,
                tag: 'task-open-list',
                attrs: [
                    { name: 'tasks_service', type: 'text', default: 'MockTaskService' },
                    { name: 'people_service', type: 'text', default: 'MockPeopleService' },
                    { name: 'companies_service', type: 'text', default: 'MockCompaniesService' },
                ],
            },
            'task-create': {
                desc: `<p><strong>&lt;task-create&gt;</strong> is a small reusable form &mdash; one input, one submit button &mdash; for creating a task. Used standalone in the tasks page and embedded inside <code>&lt;task-create-modal&gt;</code>.</p>
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
            'task-create-modal': {
                desc: `<p><strong>&lt;task-create-modal&gt;</strong> is a dumb modal hosting a <code>&lt;task-create&gt;</code> form. No trigger button — the host opens it imperatively via the callback API.</p>
                    <p><strong>Domain:</strong> <code>tasks</code> (forwarded as <code>tasks_service</code> to the embedded <code>&lt;task-create&gt;</code>).</p>
                    <p><strong>Attributes:</strong> <code>modal-title</code>, <code>placeholder</code>, <code>endpoint</code>.</p>
                    <p><strong>Callback API:</strong> <code>modal.open(callback)</code> shows the modal. The callback is invoked once with <code>{ created: true, task, tasks }</code> on a successful create or <code>{ created: false }</code> on Esc / backdrop / ✕. <code>modal.close()</code> closes silently without firing the callback. The inner <code>&lt;task-create&gt;</code> still emits <code>task:created</code> (composed/bubbles) so any global listener (e.g. the SPA shell&apos;s task-list refresh wiring) keeps working.</p>`,
                tag: 'task-create-modal',
                attrs: [
                    { name: 'modal-title', type: 'text', default: 'Ny oppgave' },
                    { name: 'placeholder', type: 'text', default: 'Beskriv oppgaven…' },
                    { name: 'endpoint', type: 'text', default: '/api/tasks' },
                ],
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
                    <p><strong>Events.</strong> Cancelable bubbling/composed <code>week-clicked</code> with <code>{ week }</code> on click.</p>`,
                tag: 'week-pill',
                attrs: [{ name: 'week', type: 'select', options: weeks, default: weeks[0] || '' }],
            },
            'global-search': {
                desc: `<p><strong>&lt;global-search&gt;</strong> is the singleton command-bar / search modal triggered from the navbar's 🔍 button or <kbd>Ctrl+K</kbd>. Light-DOM via <code>&lt;slot&gt;</code> so server-rendered shell HTML stays styled.</p>
                    <p><strong>Domain:</strong> <code>search</code> &mdash; from <code>search_service</code>. The service is expected to expose <code>query(text) → results</code>.</p>
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
                    <p><strong>Events.</strong> <code>markdown-preview:scroll</code> with <code>{ offset }</code> on user-initiated scroll &mdash; suppressed when the host writes <code>offset</code> programmatically. This lets editors implement two-pane scroll-sync without feedback loops.</p>
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
                    <p><strong>Lifecycle.</strong> Loads existing content via <code>service.load(week, file)</code> when both are present, otherwise starts blank. Save is via <code>service.save({ week, file, body, themes })</code>; cancel emits an event.</p>
                    <p><strong>Scroll-sync.</strong> Listens for <code>markdown-preview:scroll</code> from the preview and reflects scroll position back to the textarea (and vice versa).</p>
                    <p><strong>Events</strong> (cancelable, bubbling, composed):</p>
                    <ul>
                        <li><code>note-editor:saved</code> with <code>{ week, file, body }</code></li>
                        <li><code>note-editor:cancel</code></li>
                    </ul>`,
                rawHtml: `<note-editor notes_service="MockNotesService" preview_service="MockNotesService"></note-editor>`,
            },
            'week-notes-calendar': {
                desc: `<p><strong>&lt;week-notes-calendar&gt;</strong> is the calendar <em>page</em> component: a toolbar (title, ISO-week badge, date range, prev/today/next nav buttons) wrapping an embedded <code>&lt;week-calendar&gt;</code>. Used on <code>/calendar</code> and <code>/calendar/&lt;week&gt;</code>.</p>
                    <p><strong>Domain:</strong> <code>meetings</code> &mdash; from <code>meetings_service</code>. The service supplies the meeting items for the current week.</p>
                    <p><strong>Settings.</strong> When the host injects a <code>settings</code> attribute (JSON), the component reads <code>workHours</code> from it directly to avoid a roundtrip; otherwise it falls back to <code>service.getSettings()</code>.</p>
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
                desc: `<p><strong>&lt;settings-page&gt;</strong> is the master/detail editor on <code>/settings</code>: a list of contexts on the left, a form on the right for the selected context (name, icon, description, theme, working hours per weekday, default meeting length, meeting types).</p>
                    <p><strong>Domains:</strong></p>
                    <ul>
                        <li><code>settings</code> &mdash; from <code>settings_service</code>; <code>list()</code>, <code>load(id)</code>, <code>saveSettings(id, data)</code>, <code>create()</code>, <code>delete(id)</code></li>
                        <li><code>context</code> &mdash; from <code>context_service</code>; used to switch the active context after rename/create/delete</li>
                    </ul>
                    <p><strong>Working hours block.</strong> Horizontal cards, one per weekday (Mon-Sun). Each card has a <code>HH:MM-HH:MM</code> text input (regex parsed) or empty for &ldquo;ledig&rdquo;. The form serializes to a length-7 array before saving.</p>
                    <p><strong>Møtetyper editor.</strong> One row per type with: icon, color (<code>&lt;input type="color"&gt;</code>), key (lowercased, used as <code>typeId</code>), label. Saved as <code>settings.meetingTypes = [{key, icon, label, color}]</code>. Falls back to <code>DEFAULT_MEETING_TYPES</code> when empty. The color is consumed by <code>&lt;week-calendar&gt;</code> via its <code>eventTypes</code> property to colorize meeting blocks.</p>
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
            'markdown-preview:scroll',
            'calendar:week-changed',
            'context-selected',
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
    <script src="https://cdn.jsdelivr.net/npm/jsoneditor@10.1.0/dist/jsoneditor.min.js"></script>
    <script type="module" src="/components/_shared.js"></script>
    <script defer src="/debug/_mock-services.js"></script>
    <script type="module" src="/components/nav-meta.js"></script>
    <script type="module" src="/components/nav-button.js"></script>
    <script type="module" src="/components/ctx-switcher.js"></script>
    <script type="module" src="/components/help-modal.js"></script>
    <script type="module" src="/components/note-card.js"></script>
    <script type="module" src="/components/note-view.js"></script>
    <script type="module" src="/components/task-open-list.js"></script>
    <script type="module" src="/components/task-create.js"></script>
    <script type="module" src="/components/task-create-modal.js"></script>
    <script type="module" src="/components/task-complete-modal.js"></script>
    <script type="module" src="/components/task-note-modal.js"></script>
    <script type="module" src="/components/meeting-create.js"></script>
    <script type="module" src="/components/upcoming-meetings.js"></script>
    <script type="module" src="/components/today-calendar.js"></script>
    <script type="module" src="/components/week-results.js"></script>
    <script type="module" src="/components/task-completed.js"></script>
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
<script type="module" src="/components/icon-picker.js"></script>
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
        setNoteMeta(week, file, { type: 'meeting', meetingId: mid, created: now, modified: now });
        res.writeHead(302, { Location: `/editor/${week}/${encodeURIComponent(file)}` });
        res.end();
        return;
    }

    // Calendar page (week view)
    const calMatch = pathname.match(/^\/calendar(?:\/(\d{4}-W\d{2}))?$/);
    if (calMatch) {
        const week = calMatch[1] || currentIsoWeek();
        const monday = isoWeekMonday(week);
        if (!monday) {
            res.writeHead(404); res.end('Bad week'); return;
        }
        const days = [];
        const dayNames = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
        const todayStr = new Date().toISOString().slice(0, 10);
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setUTCDate(monday.getUTCDate() + i);
            const iso = d.toISOString().slice(0, 10);
            days.push({ iso, label: dayNames[i], dayNum: String(d.getUTCDate()).padStart(2, '0'), month: String(d.getUTCMonth() + 1).padStart(2, '0'), isToday: iso === todayStr });
        }
        const meetings = loadMeetings().filter(m => m.date >= days[0].iso && m.date <= days[6].iso);
        const placesByKey = {};
        loadPlaces().filter(p => !p.deleted).forEach(p => { placesByKey[p.key] = p; });
        const activity = getCalendarActivity(days[0].iso, days[6].iso);
        const prevWeek = shiftIsoWeek(week, -1);
        const nextWeek = shiftIsoWeek(week, 1);
        const HOUR_START = 0, HOUR_END = 23, HOUR_PX = 36;
        const work = getWorkHours();
        const hourLabels = [];
        for (let h = HOUR_START; h <= HOUR_END; h++) hourLabels.push(h);
        const dayColumns = days.map((d, i) => {
            const wh = work.hours[i];
            let workBand = '';
            if (wh) {
                const [wsH, wsM] = wh.start.split(':').map(n => parseInt(n, 10));
                const [weH, weM] = wh.end.split(':').map(n => parseInt(n, 10));
                const workTop = ((wsH - HOUR_START) + (wsM || 0) / 60) * HOUR_PX;
                const workH = Math.max(0, ((weH + (weM || 0) / 60) - (wsH + (wsM || 0) / 60)) * HOUR_PX);
                if (workH > 0) workBand = `<div class="work-band" style="top:${workTop}px;height:${workH}px"></div>`;
            }
            const dayMeetings = meetings.filter(m => m.date === d.iso);
            const dayActivity = activity.filter(a => a.date === d.iso);
            const ACT_H = 18;
            const actItems = dayActivity.map(a => {
                const [ah, am] = a.time.split(':').map(n => parseInt(n, 10));
                const top = Math.max(0, ((ah - HOUR_START) + (am || 0) / 60) * HOUR_PX);
                return { ...a, top, bottom: top + ACT_H };
            }).sort((x, y) => x.top - y.top);
            // Assign each item to a lane; items whose vertical spans overlap go to different lanes.
            // A "group" is a chain of overlapping items; all share the same lane count for width.
            const laneEnds = [];
            let groupStart = 0, groupMaxLane = 0;
            const placed = [];
            const flush = (until) => {
                const total = groupMaxLane + 1;
                for (let i = groupStart; i < until; i++) placed[i].total = total;
                groupStart = until; groupMaxLane = 0; laneEnds.length = 0;
            };
            actItems.forEach((it, i) => {
                if (laneEnds.length && laneEnds.every(b => b <= it.top)) flush(i);
                let lane = laneEnds.findIndex(b => b <= it.top);
                if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.bottom); }
                else laneEnds[lane] = it.bottom;
                placed.push({ ...it, lane });
                if (lane > groupMaxLane) groupMaxLane = lane;
            });
            flush(placed.length);
            const activityHtml = placed.map(a => {
                const widthPct = 100 / a.total;
                const leftPct = a.lane * widthPct;
                const titleAttr = `${a.time} · ${a.title}`;
                return `<a class="cal-activity act-${a.kind}" href="${a.href}" style="top:${a.top}px;height:${ACT_H}px;left:${leftPct.toFixed(3)}%;width:calc(${widthPct.toFixed(3)}% - 2px);right:auto" title="${escapeHtml(titleAttr)}" onclick="event.stopPropagation()">
                    <span class="cal-act-icon">${a.icon}</span>
                    <span class="cal-act-time">${escapeHtml(a.time)}</span>
                    <span class="cal-act-t">${escapeHtml(a.title)}</span>
                </a>`;
            }).join('');
            const blocks = dayMeetings.map(m => {
                let top = 0, height = HOUR_PX;
                if (m.start) {
                    const [sh, sm] = m.start.split(':').map(n => parseInt(n, 10));
                    top = ((sh - HOUR_START) + (sm || 0) / 60) * HOUR_PX;
                    if (m.end) {
                        const [eh, em] = m.end.split(':').map(n => parseInt(n, 10));
                        const dur = (eh + (em || 0) / 60) - (sh + (sm || 0) / 60);
                        height = Math.max(20, dur * HOUR_PX);
                    }
                }
                const att = (m.attendees || []).slice(0, 3).map(a => '@' + a).join(' ');
                const more = (m.attendees || []).length > 3 ? ' +' + ((m.attendees.length - 3)) : '';
                const typeIcon = meetingTypeIcon(m.type);
                return `<div class="mtg" id="m-${escapeHtml(m.id)}" data-mid="${escapeHtml(m.id)}" data-date="${escapeHtml(m.date)}" data-start="${escapeHtml(m.start || '')}" data-end="${escapeHtml(m.end || '')}" style="top:${Math.max(0, top)}px;height:${height}px">
                    <a class="mtg-note" href="/meeting-note/${encodeURIComponent(m.id)}" title="Åpne møtenotat" onclick="event.stopPropagation()">📝</a>
                    <div class="mtg-time">${escapeHtml(m.start || '')}${m.end ? '–' + escapeHtml(m.end) : ''}</div>
                    <div class="mtg-t">${typeIcon ? `<span class="mtg-type-icon" title="${escapeHtml(meetingTypeLabel(m.type))}">${typeIcon}</span> ` : ''}${escapeHtml(m.title)}</div>
                    ${att ? `<div class="mtg-att">${escapeHtml(att + more)}</div>` : ''}
                    ${(() => {
                        const place = m.placeKey && placesByKey[m.placeKey];
                        if (place) {
                            const hasC = Number.isFinite(place.lat) && Number.isFinite(place.lng);
                            const link = hasC ? `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}` : '';
                            const inner = `📍 ${escapeHtml(place.name)}`;
                            return hasC
                                ? `<div class="mtg-l"><a href="${link}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none">${inner}</a></div>`
                                : `<div class="mtg-l">${inner}</div>`;
                        }
                        return m.location ? `<div class="mtg-l">📍 ${escapeHtml(m.location)}</div>` : '';
                    })()}
                    <div class="mtg-resize" title="Dra for å endre varighet"></div>
                </div>`;
            }).join('');
            let nowLineHtml = '';
            if (d.isToday) {
                const now = new Date();
                const nowTop = ((now.getHours() - HOUR_START) + now.getMinutes() / 60) * HOUR_PX;
                nowLineHtml = `<div class="now-line" id="nowLine" style="top:${nowTop}px"></div>`;
            }
            return `<div class="cal-col${d.isToday ? ' today' : ''}" data-date="${d.iso}">
                <div class="cal-col-head"><strong>${d.label}</strong><span>${d.dayNum}.${d.month}</span></div>
                <div class="cal-col-body" style="height:${(HOUR_END - HOUR_START + 1) * HOUR_PX}px">${workBand}${activityHtml}${blocks}${nowLineHtml}</div>
            </div>`;
        }).join('');
        const hoursCol = `<div class="cal-hours"><div class="cal-col-head"></div><div class="cal-col-body" style="height:${(HOUR_END - HOUR_START + 1) * HOUR_PX}px">${hourLabels.map(h => `<div class="hour-line" style="top:${(h - HOUR_START) * HOUR_PX}px">${String(h).padStart(2,'0')}:00</div>`).join('')}</div></div>`;
        const meetingTypes = loadMeetingTypes();
        const dateRange = isoWeekToDateRange(week);
        const body = `
            <div class="cal-page">
            <div class="cal-toolbar">
                <h1 style="margin:0">📅 Kalender · Uke ${week.split('-W')[1]}</h1>
                <span style="color:var(--text-subtle)">${escapeHtml(dateRange)}</span>
                <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
                    <div class="cal-filters" title="Vis/skjul aktivitet">
                        <button type="button" class="cal-chip" data-kind="task" title="Oppgaver">✅</button>
                        <button type="button" class="cal-chip" data-kind="note" title="Notater">📝</button>
                        <button type="button" class="cal-chip" data-kind="result" title="Resultater">🏁</button>
                    </div>
                    <button type="button" class="cal-nav-btn cal-add-btn" onclick="newMeeting()" title="Nytt møte">+ Nytt møte</button>
                    <button type="button" class="cal-nav-btn" onclick="openTypesModal()" title="Rediger møtetyper">✏️ Typer</button>
                    <a href="/calendar/${prevWeek}" class="cal-nav-btn">‹ Forrige</a>
                    <a href="/calendar" class="cal-nav-btn">I dag</a>
                    <a href="/calendar/${nextWeek}" class="cal-nav-btn">Neste ›</a>
                </div>
            </div>
            <div class="cal-grid">
                ${hoursCol}
                ${dayColumns}
            </div>
            <div id="calCtxMenu" class="cal-ctx-menu"></div>
            <div id="mtgModal" class="mtg-modal" onclick="if(event.target===this)closeMtgModal()">
                <div class="mtg-modal-card">
                    <div class="mtg-modal-head">
                        <h3 id="mtgModalTitle" style="margin:0">Nytt møte</h3>
                        <button type="button" onclick="closeMtgModal()" class="mtg-x">✕</button>
                    </div>
                    <form id="mtgForm">
                        <input type="hidden" id="mtgId">
                        <label class="mtg-fld-full">Tittel<input type="text" id="mtgTitle" required autofocus placeholder="Hva handler møtet om?"></label>
                        <div class="mtg-row">
                            <label style="flex:1">Type<select id="mtgType">
                                ${meetingTypes.map(t => `<option value="${escapeHtml(t.key)}">${t.icon || ''} ${escapeHtml(t.label)}</option>`).join('')}
                            </select></label>
                            <label style="flex:1">Dato<input type="date" id="mtgDate" required></label>
                        </div>
                        <div class="mtg-row mtg-row-times">
                            <label>Fra<span class="time-pick"><select id="mtgStartH" class="t-h"></select><span class="t-sep">:</span><select id="mtgStartM" class="t-m"></select></span></label>
                            <span class="mtg-time-arrow">→</span>
                            <label>Til<span class="time-pick"><select id="mtgEndH" class="t-h"></select><span class="t-sep">:</span><select id="mtgEndM" class="t-m"></select></span></label>
                        </div>
                        <label>Deltakere <span class="mtg-hint">(kommaseparert eller @navn)</span><input type="text" id="mtgAttendees" placeholder="@kari, @ola"></label>
                        <label>Sted (fritekst)<input type="text" id="mtgLocation" placeholder="Møterom, Teams, …"></label>
                        <label>Knytt til registrert sted<select id="mtgPlaceKey"><option value="">— ingen —</option></select></label>
                        <label>Notater<textarea id="mtgNotes" rows="6" placeholder="Agenda, lenker, …"></textarea></label>
                        <div class="mtg-modal-actions">
                            <button type="button" id="mtgDelete" class="mtg-btn-del" style="display:none">🗑️ Slett</button>
                            <span style="flex:1"></span>
                            <button type="button" onclick="closeMtgModal()" class="mtg-btn-cancel">Avbryt</button>
                            <button type="submit" class="mtg-btn-save">💾 Lagre</button>
                        </div>
                    </form>
                </div>
            </div>
            <div id="typesModal" class="mtg-modal" onclick="if(event.target===this)closeTypesModal()">
                <div class="mtg-modal-card" style="width:480px">
                    <div class="mtg-modal-head">
                        <h3 style="margin:0">✏️ Møtetyper</h3>
                        <button type="button" onclick="closeTypesModal()" class="mtg-x">✕</button>
                    </div>
                    <p style="font-size:0.85em;color:var(--text-muted-warm);margin:0 0 12px">Klikk på et ikon for å bytte. Slett fjerner typen (eksisterende møter beholdes uten ikon).</p>
                    <div id="typesList"></div>
                    <button type="button" class="cal-nav-btn" onclick="addType()" style="margin-top:8px">+ Ny type</button>
                    <div class="mtg-modal-actions">
                        <span style="flex:1"></span>
                        <button type="button" onclick="closeTypesModal()" class="mtg-btn-cancel">Avbryt</button>
                        <button type="button" class="mtg-btn-save" onclick="saveTypes()">💾 Lagre</button>
                    </div>
                </div>
            </div>
            <div id="iconPicker" class="icon-picker" onclick="if(event.target===this)closeIconPicker()">
                <div class="icon-picker-card">
                    <div class="mtg-modal-head">
                        <h4 style="margin:0">Velg ikon</h4>
                        <button type="button" onclick="closeIconPicker()" class="mtg-x">✕</button>
                    </div>
                    <div id="iconGrid" class="icon-grid"></div>
                </div>
            </div>
            </div>
            <style>
                body:has(.cal-page) { max-width: none; }
                .cal-page { width: 100%; }
                .cal-toolbar { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
                .cal-nav-btn { background:var(--surface); border:1px solid var(--border); padding:6px 12px; border-radius:4px; text-decoration:none; color:var(--accent); font-size:0.9em; cursor:pointer; font-family:inherit; }
                .cal-nav-btn:hover { background:var(--surface-alt); text-decoration:none; }
                .cal-add-btn { background:var(--accent); color:var(--surface); border-color:var(--accent); font-weight:600; }
                .cal-add-btn:hover { background:var(--accent-strong); color:var(--surface); }
                .cal-ctx-menu { display:none; position:fixed; background:var(--surface); border:1px solid var(--border); border-radius:6px; box-shadow:0 8px 24px rgba(26,54,93,0.18); padding:4px; z-index:1200; min-width:180px; }
                .cal-ctx-menu.open { display:block; }
                .cal-ctx-menu .cm-h { font-size:0.7em; font-weight:600; color:var(--text-muted-warm); text-transform:uppercase; letter-spacing:0.08em; padding:6px 10px 4px; }
                .cal-ctx-menu .cm-item { display:flex; align-items:center; gap:10px; width:100%; background:none; border:none; padding:7px 10px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:0.9em; color:var(--accent); text-align:left; }
                .cal-ctx-menu .cm-item:hover { background:var(--surface-alt); }
                .cal-ctx-menu .cm-item .cm-icon { font-size:1.15em; }
                .cal-grid { display:grid; grid-template-columns: 56px repeat(7, 1fr); gap:0; background:var(--surface); border:1px solid var(--border); border-radius:6px; overflow:hidden; }
                .cal-col, .cal-hours { border-right:1px solid var(--border-faint); }
                .cal-col:last-child { border-right:none; }
                .cal-col-head { background:var(--surface-head); padding:8px 10px; border-bottom:1px solid var(--border); font-size:0.85em; color:var(--text); display:flex; justify-content:space-between; align-items:baseline; gap:6px; height:36px; box-sizing:border-box; overflow:hidden; }
                .cal-col-head span { color:var(--text-subtle); }
                .cal-col.today .cal-col-head { background:#fff5d1; }
                .cal-col.today .cal-col-head strong { color:#8a5a00; }
                .cal-col-body { position:relative; cursor:crosshair; }
                .cal-col-body:hover { background:var(--bg); }
                .work-band { position:absolute; left:0; right:0; background:rgba(43,108,176,0.07); border-top:1px dashed rgba(43,108,176,0.35); border-bottom:1px dashed rgba(43,108,176,0.35); pointer-events:none; z-index:0; }
                .cal-hours .cal-col-body { cursor:default; }
                .cal-hours .cal-col-body:hover { background:transparent; }
                .hour-line { position:absolute; left:0; right:0; height:0; padding:0 6px; font-size:0.7em; color:var(--text-subtle); text-align:right; line-height:1; display:flex; align-items:center; justify-content:flex-end; }
                .hour-line:first-child { align-items:flex-start; padding-top:2px; }
                .cal-col-body { background-image: repeating-linear-gradient(to bottom, var(--border-faint) 0, var(--border-faint) 1px, transparent 1px, transparent 48px); }
                .mtg { position:absolute; left:2px; right:2px; background:#e6efff; border:1px solid #b9c8e0; border-left:3px solid #2b6cb0; border-radius:3px; padding:3px 6px; font-size:0.78em; color:var(--accent); cursor:pointer; overflow:hidden; box-shadow:0 1px 2px rgba(26,54,93,0.1); z-index:2; }
                .mtg.targeted { box-shadow:0 0 0 2px #f6ad55, 0 1px 4px rgba(26,54,93,0.2); animation: mtgPulse 1.6s ease-in-out 2; }
                @keyframes mtgPulse { 0%,100% { background:#e6efff; } 50% { background:#fff3d6; } }
                .mtg:hover { background:#d9e5fb; z-index:5; }
                .cal-activity { position:absolute; left:2px; right:2px; display:flex; align-items:center; gap:5px; padding:0 5px; border-radius:3px; font-size:0.72em; line-height:1; color:var(--text); text-decoration:none; cursor:pointer; overflow:hidden; white-space:nowrap; z-index:1; background:#f4ecd6; border:1px solid #ddd0a8; border-left:3px solid #b8956b; opacity:0.85; }
                .cal-activity:hover { opacity:1; z-index:5; background:#ffe9b3; text-decoration:none; color:var(--text); }
                .cal-activity .cal-act-icon { font-size:0.95em; }
                .cal-activity .cal-act-time { color:var(--text-muted-warm); font-variant-numeric:tabular-nums; font-weight:600; }
                .cal-activity .cal-act-t { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
                .cal-activity.act-task { background:#e3f1e6; border-color:#b8d8bf; border-left-color:#38a169; }
                .cal-activity.act-task:hover { background:#cfe9d6; }
                .cal-activity.act-note { background:#e6efff; border-color:#b9c8e0; border-left-color:#5a72a8; }
                .cal-activity.act-note:hover { background:#d4e0fb; }
                .cal-activity.act-result { background:#fdebd0; border-color:#f1c98a; border-left-color:#d69e2e; }
                .cal-activity.act-result:hover { background:#fadcae; }
                .cal-grid.hide-task .cal-activity.act-task { display:none; }
                .cal-grid.hide-note .cal-activity.act-note { display:none; }
                .cal-grid.hide-result .cal-activity.act-result { display:none; }
                .cal-filters { display:inline-flex; gap:2px; padding:2px; background:#f4ecd6; border:1px solid var(--border); border-radius:5px; margin-right:4px; }
                .cal-chip { background:transparent; border:none; padding:3px 7px; font-size:0.95em; cursor:pointer; border-radius:3px; line-height:1; opacity:0.35; filter:grayscale(0.6); transition:all 0.12s; }
                .cal-chip.on { opacity:1; filter:none; background:var(--surface); box-shadow:0 1px 2px rgba(60,58,48,0.12); }
                .cal-chip:hover { opacity:0.85; }
                .cal-chip.on:hover { opacity:1; }
                .now-line { position:absolute; left:0; right:0; height:0; border-top:2px solid #e53e3e; z-index:3; pointer-events:none; }
                .now-line::before { content:''; position:absolute; left:-4px; top:-5px; width:8px; height:8px; background:#e53e3e; border-radius:50%; box-shadow:0 0 0 2px var(--surface); }
                .mtg { cursor:move; user-select:none; }
                .mtg.dragging { opacity:0.85; box-shadow:0 4px 12px rgba(26,54,93,0.25); z-index:10; }
                .mtg-resize { position:absolute; left:0; right:0; bottom:0; height:6px; cursor:ns-resize; background:transparent; }
                .mtg-resize:hover { background:rgba(43,108,176,0.25); }
                .mtg-time { font-weight:600; font-size:0.85em; }
                .mtg-t { font-weight:500; line-height:1.2; }
                .mtg-type-icon { font-size:0.95em; }
                .mtg-att, .mtg-l { color:var(--text-muted); font-size:0.92em; }
                .mtg-note { position:absolute; top:2px; right:3px; font-size:0.95em; text-decoration:none; padding:0 3px; opacity:0.55; line-height:1; border-radius:3px; }
                .mtg-note:hover { opacity:1; background:var(--surface); }
                .mtg-modal { display:none; position:fixed; inset:0; background:rgba(26,32,44,0.45); z-index:1000; align-items:flex-start; justify-content:center; padding:5vh 0; backdrop-filter:blur(2px); }
                .mtg-modal.open { display:flex; }
                .mtg-modal-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:22px 26px 20px; width:560px; max-width:92vw; max-height:90vh; overflow:auto; box-shadow:0 12px 36px rgba(26,32,44,0.25); }
                .mtg-modal-head { display:flex; justify-content:space-between; align-items:center; margin:-22px -26px 16px; padding:14px 22px 12px; border-bottom:1px solid var(--border-faint); background:var(--surface-head); border-radius:10px 10px 0 0; }
                .mtg-modal-head h3 { font-size:1.05em; color:var(--text); font-weight:600; letter-spacing:0.01em; }
                .mtg-x { background:none; border:none; font-size:1.25em; cursor:pointer; color:var(--text-subtle); padding:2px 8px; border-radius:4px; line-height:1; }
                .mtg-x:hover { background:var(--border-faint); color:var(--text); }
                #mtgForm label { display:block; margin-bottom:12px; font-size:0.78em; color:var(--text-muted-warm); font-weight:600; text-transform:uppercase; letter-spacing:0.04em; }
                .mtg-hint { color:var(--text-subtle); font-weight:400; text-transform:none; letter-spacing:0; font-size:0.95em; }
                #mtgForm input[type=text], #mtgForm input[type=date], #mtgForm input[type=time], #mtgForm select, #mtgForm textarea { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--border); border-radius:5px; font-family:inherit; font-size:0.95em; margin-top:5px; background:var(--bg); color:var(--text-strong); text-transform:none; letter-spacing:normal; transition:border-color 0.12s, box-shadow 0.12s; }
                #mtgForm input[type=text]:focus, #mtgForm input[type=date]:focus, #mtgForm select:focus, #mtgForm textarea:focus { outline:none; border-color:#b8956b; box-shadow:0 0 0 3px rgba(184,149,107,0.18); background:var(--surface); }
                #mtgForm select { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='%237a6f4d'><path d='M0 0l6 8 6-8z'/></svg>"); background-repeat:no-repeat; background-position:right 10px center; background-size:9px; padding-right:28px; }
                #mtgForm textarea { font-family: ui-monospace, monospace; font-size:0.88em; resize:vertical; min-height:96px; }
                .mtg-row { display:flex; gap:12px; }
                .mtg-row > label { flex:1; }
                .mtg-row-times { align-items:flex-end; gap:10px; margin-bottom:12px; }
                .mtg-row-times > label { flex:0 0 auto; margin-bottom:0; }
                .mtg-time-arrow { color:var(--text-subtle); padding-bottom:9px; font-size:1.1em; }
                .time-pick { display:inline-flex; align-items:stretch; gap:0; margin-top:0; background:var(--surface-alt); border:1px solid var(--border-soft); border-radius:8px; padding:0; overflow:hidden; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.04); }
                .time-pick:hover { border-color:var(--border); }
                .time-pick:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft), inset 0 1px 0 rgba(255,255,255,0.4); background:var(--surface); }
                .time-pick select { -webkit-appearance:none; appearance:none; background:transparent; border:none; box-shadow:none; outline:none; margin:0; padding:7px 10px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric:tabular-nums; font-size:1em; font-weight:600; letter-spacing:0.02em; color:var(--text-strong); cursor:pointer; text-align:center; text-align-last:center; min-width:46px; line-height:1.1; transition:background 0.12s, color 0.12s; }
                .time-pick select:hover { background:var(--surface); color:var(--accent); }
                .time-pick select:focus { background:var(--surface); color:var(--accent-strong); }
                .time-pick .t-sep { display:inline-flex; align-items:center; justify-content:center; color:var(--text-subtle); font-weight:700; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; pointer-events:none; padding:0 1px; }
                .mtg-modal-actions { display:flex; align-items:center; gap:8px; margin:18px -26px -20px; padding:14px 22px; border-top:1px solid var(--border-faint); background:var(--bg); border-radius:0 0 10px 10px; }
                .mtg-btn-save { background:#b8956b; color:var(--surface); border:1px solid #a07e54; padding:8px 18px; border-radius:5px; cursor:pointer; font-weight:600; font-family:inherit; box-shadow:0 1px 2px rgba(60,58,48,0.15); }
                .mtg-btn-save:hover { background:#a07e54; }
                .mtg-btn-cancel { background:var(--surface); border:1px solid var(--border); padding:7px 14px; border-radius:5px; cursor:pointer; font-family:inherit; color:var(--text-muted-warm); }
                .mtg-btn-cancel:hover { background:#f4ecd6; color:var(--text); }
                .mtg-btn-del { background:#fef0c7; border:1px solid #f0d589; color:#8a5a00; padding:7px 12px; border-radius:5px; cursor:pointer; font-family:inherit; font-size:0.9em; }
                .mtg-btn-del:hover { background:#f7e2a3; }
                .types-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:6px; border:1px solid var(--border-faint); border-radius:4px; background:var(--bg); }
                .types-row .ti-icon { width:38px; height:38px; font-size:1.4em; cursor:pointer; background:var(--surface); border:1px solid var(--border); border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
                .types-row .ti-icon:hover { background:var(--surface-alt); }
                .types-row input[type=text] { flex:1; padding:7px 10px; border:1px solid var(--border); border-radius:4px; font-family:inherit; font-size:0.95em; background:var(--surface); color:var(--text-strong); }
                .types-row .ti-del { background:#fff5f5; color:#c53030; border:1px solid #fed7d7; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:0.9em; }
                .types-row .ti-del:hover { background:#fed7d7; }
                .icon-picker { display:none; position:fixed; inset:0; background:rgba(26,32,44,0.55); z-index:1100; align-items:center; justify-content:center; }
                .icon-picker.open { display:flex; }
                .icon-picker-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:16px 20px; }
                .icon-grid { display:grid; grid-template-columns: repeat(8, 42px); gap:6px; max-height:70vh; overflow-y:auto; }
                .icon-grid button { width:42px; height:42px; font-size:1.5em; background:var(--bg); border:1px solid var(--border-faint); border-radius:4px; cursor:pointer; padding:0; line-height:1; }
                .icon-grid button:hover { background:var(--surface-alt); border-color:var(--accent); }
                .icon-grid .ig-grp-label { grid-column: 1 / -1; font-size:0.72em; font-weight:600; color:var(--text-muted-warm); text-transform:uppercase; letter-spacing:0.08em; padding:6px 2px 2px; border-bottom:1px solid var(--border-faint); }
                .icon-grid .ig-grp-label:first-child { padding-top:0; }
            </style>
            <script>
                (function(){
                    const HOUR_PX = ${HOUR_PX}, HOUR_START = ${HOUR_START}, HOUR_END = ${HOUR_END};
                    const MEETING_TYPES = ${JSON.stringify(meetingTypes)};
                    const MEETING_PLACES = ${JSON.stringify(loadPlaces().filter(p => !p.deleted).map(p => ({ key: p.key, name: p.name })))};
                    (function fillPlaces(){
                        const sel = document.getElementById('mtgPlaceKey');
                        if (!sel) return;
                        sel.innerHTML = '<option value="">— ingen —</option>' + MEETING_PLACES.map(p => '<option value="' + p.key + '">' + p.name + '</option>').join('');
                    })();
                    function minsForType(key) {
                        const t = MEETING_TYPES.find(x => x.key === key);
                        const m = t && parseInt(t.mins, 10);
                        return (m > 0 && m <= 600) ? m : 60;
                    }
                    const modal = document.getElementById('mtgModal');
                    const $ = id => document.getElementById(id);
                    function addMinutesToTime(t, mins) {
                        if (!t) return '';
                        const [h, m] = t.split(':').map(n => parseInt(n, 10));
                        let total = h * 60 + (m || 0) + mins;
                        total = Math.max(0, Math.min(24 * 60 - 1, total));
                        return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
                    }
                    function fillTimeSelects() {
                        const hOpts = [];
                        for (let h = 0; h < 24; h++) hOpts.push('<option value="' + String(h).padStart(2, '0') + '">' + String(h).padStart(2, '0') + '</option>');
                        const mOpts = [];
                        for (let m = 0; m < 60; m += 5) mOpts.push('<option value="' + String(m).padStart(2, '0') + '">' + String(m).padStart(2, '0') + '</option>');
                        ['mtgStartH', 'mtgEndH'].forEach(id => { $(id).innerHTML = hOpts.join(''); });
                        ['mtgStartM', 'mtgEndM'].forEach(id => { $(id).innerHTML = mOpts.join(''); });
                    }
                    function setTime(prefix, val) {
                        if (!val) { $(prefix + 'H').value = ''; $(prefix + 'M').value = ''; return; }
                        const [h, m] = val.split(':');
                        $(prefix + 'H').value = (h || '00').padStart(2, '0');
                        const mi = Math.round(parseInt(m || '0', 10) / 5) * 5;
                        $(prefix + 'M').value = String(Math.min(55, mi)).padStart(2, '0');
                    }
                    function getTime(prefix) {
                        const h = $(prefix + 'H').value;
                        const m = $(prefix + 'M').value;
                        if (!h || !m) return '';
                        return h + ':' + m;
                    }
                    fillTimeSelects();
                    $('mtgType').addEventListener('change', () => {
                        if ($('mtgId').value) return;
                        const start = getTime('mtgStart');
                        if (start) setTime('mtgEnd', addMinutesToTime(start, minsForType($('mtgType').value)));
                    });
                    function openModal(meeting, prefillDate, prefillStart) {
                        $('mtgForm').reset();
                        if (meeting) {
                            $('mtgModalTitle').textContent = 'Rediger møte';
                            $('mtgId').value = meeting.id;
                            $('mtgTitle').value = meeting.title || '';
                            $('mtgType').value = meeting.type || 'meeting';
                            $('mtgDate').value = meeting.date || '';
                            setTime('mtgStart', meeting.start || '');
                            setTime('mtgEnd', meeting.end || '');
                            $('mtgAttendees').value = (meeting.attendees || []).map(a => '@' + a).join(', ');
                            $('mtgLocation').value = meeting.location || '';
                            if ($('mtgPlaceKey')) $('mtgPlaceKey').value = meeting.placeKey || '';
                            $('mtgNotes').value = meeting.notes || '';
                            $('mtgDelete').style.display = '';
                        } else {
                            $('mtgModalTitle').textContent = 'Nytt møte';
                            $('mtgId').value = '';
                            const initialType = (MEETING_TYPES[0] && MEETING_TYPES[0].key) || 'meeting';
                            $('mtgType').value = initialType;
                            $('mtgDate').value = prefillDate || '';
                            setTime('mtgStart', prefillStart || '');
                            setTime('mtgEnd', prefillStart ? addMinutesToTime(prefillStart, minsForType(initialType)) : '');
                            $('mtgDelete').style.display = 'none';
                        }
                        modal.classList.add('open');
                        setTimeout(() => $('mtgTitle').focus(), 50);
                    }
                    window.closeMtgModal = function(){ modal.classList.remove('open'); };
                    window.newMeeting = function() {
                        const cols = document.querySelectorAll('.cal-col[data-date]');
                        if (!cols.length) { openModal(null, '', ''); return; }
                        const dates = Array.from(cols).map(c => c.getAttribute('data-date'));
                        const today = new Date().toISOString().slice(0, 10);
                        const date = dates.includes(today) ? today : dates[0];
                        const now = new Date();
                        let hh = now.getHours();
                        if (date !== today) hh = 9;
                        else hh = Math.min(Math.max(hh, HOUR_START), HOUR_END - 1);
                        openModal(null, date, String(hh).padStart(2, '0') + ':00');
                    };
                    document.querySelectorAll('.cal-col-body').forEach(body => {
                        body.addEventListener('click', e => {
                            if (e.target.closest('.mtg')) return;
                            const col = body.closest('.cal-col');
                            if (!col) return;
                            const rect = body.getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            const hour = Math.max(HOUR_START, Math.min(HOUR_END, HOUR_START + Math.floor(y / HOUR_PX)));
                            const date = col.getAttribute('data-date');
                            openModal(null, date, String(hour).padStart(2,'0') + ':00');
                        });
                        body.addEventListener('contextmenu', e => {
                            if (e.target.closest('.mtg')) return;
                            const col = body.closest('.cal-col');
                            if (!col) return;
                            e.preventDefault();
                            const rect = body.getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            const hour = Math.max(HOUR_START, Math.min(HOUR_END, HOUR_START + Math.floor(y / HOUR_PX)));
                            const date = col.getAttribute('data-date');
                            const start = String(hour).padStart(2, '0') + ':00';
                            showTypeMenu(e.clientX, e.clientY, date, start);
                        });
                    });
                    const ctxMenu = document.getElementById('calCtxMenu');
                    function showTypeMenu(x, y, date, start) {
                        ctxMenu.innerHTML = '';
                        const h = document.createElement('div');
                        h.className = 'cm-h';
                        h.textContent = 'Nytt møte · type';
                        ctxMenu.appendChild(h);
                        MEETING_TYPES.forEach(t => {
                            const b = document.createElement('button');
                            b.type = 'button';
                            b.className = 'cm-item';
                            b.innerHTML = '<span class="cm-icon">' + (t.icon || '👥') + '</span><span>' + (t.label || t.key) + '</span>';
                            b.onclick = () => {
                                hideTypeMenu();
                                openModal(null, date, start);
                                document.getElementById('mtgType').value = t.key;
                            };
                            ctxMenu.appendChild(b);
                        });
                        ctxMenu.style.left = '0px';
                        ctxMenu.style.top = '0px';
                        ctxMenu.classList.add('open');
                        const w = ctxMenu.offsetWidth, h2 = ctxMenu.offsetHeight;
                        const vw = window.innerWidth, vh = window.innerHeight;
                        ctxMenu.style.left = Math.min(x, vw - w - 8) + 'px';
                        ctxMenu.style.top = Math.min(y, vh - h2 - 8) + 'px';
                    }
                    function hideTypeMenu() { ctxMenu.classList.remove('open'); }
                    document.addEventListener('click', e => {
                        if (!ctxMenu.contains(e.target)) hideTypeMenu();
                    });
                    document.addEventListener('keydown', e => {
                        if (e.key === 'Escape') hideTypeMenu();
                    });
                    document.querySelectorAll('.mtg').forEach(el => {
                        el.addEventListener('mousedown', e => {
                            if (e.button !== 0) return;
                            if (e.target.closest('.mtg-note')) return;
                            e.stopPropagation();
                            e.preventDefault();
                            const id = el.getAttribute('data-mid');
                            const startDate = el.getAttribute('data-date');
                            const startStart = el.getAttribute('data-start') || '';
                            const startEnd = el.getAttribute('data-end') || '';
                            const isResize = !!e.target.closest('.mtg-resize');
                            const startY = e.clientY, startX = e.clientX;
                            const origTop = parseFloat(el.style.top) || 0;
                            const origHeight = parseFloat(el.style.height) || HOUR_PX;
                            const origParent = el.parentElement;
                            const cols = Array.from(document.querySelectorAll('.cal-col[data-date] .cal-col-body'));
                            const SNAP_PX = HOUR_PX / 12; // 5-min snap
                            let moved = false;
                            let curTop = origTop, curHeight = origHeight, curBody = origParent;
                            el.classList.add('dragging');
                            function pxToHHMM(px) {
                                const totalMin = Math.round(px / HOUR_PX * 60 / 5) * 5;
                                const minClamped = Math.max(0, Math.min(24 * 60 - 5, totalMin + HOUR_START * 60));
                                const h = Math.floor(minClamped / 60), m = minClamped % 60;
                                return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
                            }
                            function onMove(ev) {
                                const dy = ev.clientY - startY;
                                const dx = ev.clientX - startX;
                                if (!moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
                                moved = true;
                                if (isResize) {
                                    const snapped = Math.round(dy / SNAP_PX) * SNAP_PX;
                                    curHeight = Math.max(SNAP_PX * 3, origHeight + snapped); // min 15min
                                    el.style.height = curHeight + 'px';
                                } else {
                                    const snapped = Math.round(dy / SNAP_PX) * SNAP_PX;
                                    curTop = Math.max(0, Math.min((HOUR_END - HOUR_START + 1) * HOUR_PX - curHeight, origTop + snapped));
                                    el.style.top = curTop + 'px';
                                    // hit-test horizontal columns for cross-day move
                                    const target = cols.find(b => {
                                        const r = b.getBoundingClientRect();
                                        return ev.clientX >= r.left && ev.clientX <= r.right;
                                    });
                                    if (target && target !== curBody) {
                                        target.appendChild(el);
                                        curBody = target;
                                    }
                                }
                            }
                            function onUp() {
                                document.removeEventListener('mousemove', onMove);
                                document.removeEventListener('mouseup', onUp);
                                el.classList.remove('dragging');
                                if (!moved) {
                                    // treat as click → open modal
                                    fetch('/api/meetings').then(r => r.json()).then(all => {
                                        const m = all.find(x => x.id === id);
                                        if (m) openModal(m);
                                    });
                                    return;
                                }
                                let newDate = startDate, newStart = startStart, newEnd = startEnd;
                                const newCol = curBody.closest('.cal-col[data-date]');
                                if (newCol) newDate = newCol.getAttribute('data-date');
                                if (isResize) {
                                    newEnd = pxToHHMM(curTop + curHeight);
                                } else {
                                    newStart = pxToHHMM(curTop);
                                    newEnd = pxToHHMM(curTop + curHeight);
                                }
                                el.setAttribute('data-date', newDate);
                                el.setAttribute('data-start', newStart);
                                el.setAttribute('data-end', newEnd);
                                const timeEl = el.querySelector('.mtg-time');
                                if (timeEl) timeEl.textContent = newStart + (newEnd ? '–' + newEnd : '');
                                fetch('/api/meetings/' + encodeURIComponent(id), {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ date: newDate, start: newStart, end: newEnd })
                                }).then(r => r.json()).then(d => {
                                    if (!d.ok) { alert('Kunne ikke flytte møte: ' + (d.error || '')); location.reload(); }
                                }).catch(() => location.reload());
                            }
                            document.addEventListener('mousemove', onMove);
                            document.addEventListener('mouseup', onUp);
                        });
                    });
                    // Now-line auto-update
                    function updateNowLine() {
                        const nl = document.getElementById('nowLine');
                        if (!nl) return;
                        const now = new Date();
                        const top = ((now.getHours() - HOUR_START) + now.getMinutes() / 60) * HOUR_PX;
                        nl.style.top = top + 'px';
                    }
                    updateNowLine();
                    setInterval(updateNowLine, 60000);
                    // Activity filter chips
                    (function(){
                        const grid = document.querySelector('.cal-grid');
                        const KEY = 'calActivityFilter';
                        let st;
                        try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch(_) { st = {}; }
                        const apply = () => {
                            ['task','note','result'].forEach(k => {
                                const on = st[k] !== false;
                                grid.classList.toggle('hide-' + k, !on);
                                const chip = document.querySelector('.cal-chip[data-kind="' + k + '"]');
                                if (chip) chip.classList.toggle('on', on);
                            });
                        };
                        apply();
                        document.querySelectorAll('.cal-chip').forEach(chip => {
                            chip.addEventListener('click', () => {
                                const k = chip.getAttribute('data-kind');
                                st[k] = !(st[k] !== false); // toggle (default true)
                                localStorage.setItem(KEY, JSON.stringify(st));
                                apply();
                            });
                        });
                    })();
                    $('mtgForm').addEventListener('submit', e => {
                        e.preventDefault();
                        const id = $('mtgId').value;
                        const attendeesRaw = $('mtgAttendees').value || '';
                        const attendees = attendeesRaw.split(/[,\\s]+/).map(s => s.replace(/^@/, '').toLowerCase()).filter(Boolean);
                        const data = {
                            title: $('mtgTitle').value.trim(),
                            type: $('mtgType').value,
                            date: $('mtgDate').value,
                            start: getTime('mtgStart'),
                            end: getTime('mtgEnd'),
                            attendees,
                            location: $('mtgLocation').value.trim(),
                            placeKey: ($('mtgPlaceKey') ? $('mtgPlaceKey').value : '') || '',
                            notes: $('mtgNotes').value
                        };
                        const url = id ? '/api/meetings/' + encodeURIComponent(id) : '/api/meetings';
                        const method = id ? 'PUT' : 'POST';
                        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
                            .then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert('Feil: ' + (d.error || '')); });
                    });
                    $('mtgDelete').addEventListener('click', () => {
                        const id = $('mtgId').value;
                        if (!id || !confirm('Slette dette møtet?')) return;
                        fetch('/api/meetings/' + encodeURIComponent(id), { method: 'DELETE' })
                            .then(r => r.json()).then(() => location.reload());
                    });
                    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMtgModal(); });
                    function focusFromHash() {
                        const m = (location.hash || '').match(/^#m-(.+)$/);
                        if (!m) return;
                        const el = document.getElementById('m-' + decodeURIComponent(m[1]));
                        if (!el) return;
                        document.querySelectorAll('.mtg.targeted').forEach(x => x.classList.remove('targeted'));
                        el.classList.add('targeted');
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    window.addEventListener('hashchange', focusFromHash);
                    setTimeout(focusFromHash, 50);
                })();
            </script>
            <script src="/mention-autocomplete.js"></script>
            <script>
                (function(){
                    ['mtgTitle','mtgAttendees','mtgNotes'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) initMentionAutocomplete(el);
                    });
                })();
            </script>
            <script>
                (function(){
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
                    let currentTypes = ${JSON.stringify(meetingTypes)};
                    let pickerTarget = null;

                    function slugKey(label) {
                        const base = (label || 'type').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type';
                        return base + '-' + Math.random().toString(36).slice(2, 6);
                    }
                    function renderTypes() {
                        const list = document.getElementById('typesList');
                        list.innerHTML = '';
                        currentTypes.forEach((t, i) => {
                            const row = document.createElement('div');
                            row.className = 'types-row';
                            row.innerHTML = '<button type="button" class="ti-icon" data-i="' + i + '" title="Velg ikon">' + (t.icon || '·') + '</button>'
                                + '<input type="text" data-i="' + i + '" value="' + (t.label || '').replace(/"/g, '&quot;') + '" placeholder="Navn">'
                                + '<button type="button" class="ti-del" data-i="' + i + '" title="Slett">🗑️</button>';
                            list.appendChild(row);
                        });
                        list.querySelectorAll('.ti-icon').forEach(b => b.onclick = () => openIconPicker(parseInt(b.dataset.i, 10)));
                        list.querySelectorAll('input[type=text]').forEach(inp => inp.oninput = () => { currentTypes[parseInt(inp.dataset.i, 10)].label = inp.value; });
                        list.querySelectorAll('.ti-del').forEach(b => b.onclick = () => { currentTypes.splice(parseInt(b.dataset.i, 10), 1); renderTypes(); });
                    }
                    function renderIconGrid() {
                        const grid = document.getElementById('iconGrid');
                        grid.innerHTML = '';
                        ICON_GROUPS.forEach(grp => {
                            const h = document.createElement('div');
                            h.className = 'ig-grp-label';
                            h.textContent = grp.label;
                            grid.appendChild(h);
                            grp.icons.forEach(ic => {
                                const b = document.createElement('button');
                                b.type = 'button';
                                b.textContent = ic;
                                b.onclick = () => {
                                    if (pickerTarget != null && currentTypes[pickerTarget]) {
                                        currentTypes[pickerTarget].icon = ic;
                                        renderTypes();
                                    }
                                    closeIconPicker();
                                };
                                grid.appendChild(b);
                            });
                        });
                    }
                    window.openTypesModal = function() {
                        renderTypes();
                        document.getElementById('typesModal').classList.add('open');
                    };
                    window.closeTypesModal = function() {
                        document.getElementById('typesModal').classList.remove('open');
                    };
                    window.addType = function() {
                        currentTypes.push({ key: slugKey('ny'), icon: '👥', label: 'Ny type' });
                        renderTypes();
                    };
                    window.openIconPicker = function(i) {
                        pickerTarget = i;
                        document.getElementById('iconPicker').classList.add('open');
                    };
                    window.closeIconPicker = function() {
                        pickerTarget = null;
                        document.getElementById('iconPicker').classList.remove('open');
                    };
                    window.saveTypes = function() {
                        const cleaned = currentTypes
                            .map(t => ({ key: t.key || slugKey(t.label), icon: (t.icon || '').trim(), label: (t.label || '').trim() }))
                            .filter(t => t.label);
                        fetch('/api/meeting-types', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleaned) })
                            .then(r => r.json()).then(d => { if (d.ok) location.reload(); else alert('Feil ved lagring'); });
                    };
                    document.addEventListener('keydown', e => {
                        if (e.key !== 'Escape') return;
                        if (document.getElementById('iconPicker').classList.contains('open')) closeIconPicker();
                        else if (document.getElementById('typesModal').classList.contains('open')) closeTypesModal();
                    });
                    renderIconGrid();
                })();
            </script>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Kalender', body));
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


    // API: summarize week
    if (pathname === '/api/summarize' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { week } = body;
            if (!week || week.includes('/') || week.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig uke' }));
                return;
            }
            const summary = await summarizeWeek(week);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, summary }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: search md files
    if (pathname === '/api/search' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('[]');
            return;
        }
        try {
            const results = await searchViaWorker(q.trim());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) {
            // Last-ditch fallback to synchronous in-process search
            try {
                const results = searchAll(q.trim());
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            } catch {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        }
        return;
    }

    if (pathname === '/api/embed-search' && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
        if (!embedReady) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'embed-worker ikke klar' })); return; }
        try {
            const hits = await vectorSearchViaWorker(q);
            const results = hits.map(vectorHitToSearchResult).filter(Boolean);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // App-wide settings (currently just vector-search). Per-context settings
    // remain at /api/contexts/:id/settings.
    if (pathname === '/api/app-settings' && req.method === 'GET') {
        const annotateLocal = (m) => {
            const dir = path.join(__dirname, 'models', m.id.replace(/\//g, path.sep));
            let downloaded = false;
            try {
                downloaded = fs.existsSync(path.join(dir, 'onnx', 'model_quantized.onnx'))
                          || fs.existsSync(path.join(dir, 'onnx', 'model.onnx'));
            } catch {}
            return Object.assign({}, m, { downloaded });
        };
        const modelsAnnotated = EMBED_MODELS.map(annotateLocal);
        // Remote summarize entries are always "downloaded:true" (no-op).
        const summarizeModelsAnnotated = SUMMARIZE_MODELS.map(m =>
            m.remote ? Object.assign({}, m, { downloaded: true }) : annotateLocal(m)
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            settings: getAppSettings(),
            models: modelsAnnotated,
            summarizeModels: summarizeModelsAnnotated,
        }));
        return;
    }
    if (pathname.match(/^\/api\/app-settings\/models\/(.+)$/) && req.method === 'DELETE') {
        try {
            const modelId = decodeURIComponent(pathname.match(/^\/api\/app-settings\/models\/(.+)$/)[1]);
            const inEmbed = EMBED_MODELS.some(m => m.id === modelId);
            const inSummarize = SUMMARIZE_MODELS.some(m => m.id === modelId);
            if (!inEmbed && !inSummarize) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Ukjent modell' }));
                return;
            }
            if (isRemoteSummarizeModel(modelId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Ekstern modell kan ikke slettes.' }));
                return;
            }
            const settings = getAppSettings();
            if (inEmbed && settings.vectorSearch.enabled && settings.vectorSearch.model === modelId) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Kan ikke slette aktiv modell. Slå av først eller bytt modell.' }));
                return;
            }
            if (inSummarize && settings.summarization.enabled && settings.summarization.model === modelId) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Kan ikke slette aktiv modell. Slå av først eller bytt modell.' }));
                return;
            }
            const dir = path.join(__dirname, 'models', modelId.replace(/\//g, path.sep));
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.warn('rm model failed', e); }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }
    if (pathname === '/api/app-settings' && req.method === 'PUT') {
        try {
            const body = JSON.parse(await readBody(req) || '{}');
            const before = getAppSettings();
            const next = setAppSettings(body);
            const vsChanged = before.vectorSearch.enabled !== next.vectorSearch.enabled
                           || before.vectorSearch.model   !== next.vectorSearch.model;
            if (vsChanged) {
                if (next.vectorSearch.enabled) restartEmbedWorker();
                else { stopEmbedWorker(); embedEmit({ phase: 'disabled', model: next.vectorSearch.model, progress: null, error: null, docCount: 0 }); }
            }
            const siChanged = before.searchIndex.enabled !== next.searchIndex.enabled;
            if (siChanged) {
                if (next.searchIndex.enabled) restartSearchWorker();
                else stopSearchWorker();
            }
            const sumChanged = before.summarization.enabled !== next.summarization.enabled
                            || before.summarization.model   !== next.summarization.model;
            if (sumChanged) {
                if (next.summarization.enabled) restartSummarizeWorker();
                else { stopSummarizeWorker(); summarizeEmit({ phase: 'disabled', model: next.summarization.model, progress: null, error: null }); }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, settings: next }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }
    if (pathname === '/api/embed/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ ok: true }, embedState)));
        return;
    }
    if (pathname === '/api/summarize/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ ok: true }, summarizeState)));
        return;
    }
    if (pathname === '/api/summarize/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(summarizeState)}\n\n`);
        summarizeSseClients.add(res);
        const keepalive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 30000);
        const cleanup = () => { clearInterval(keepalive); summarizeSseClients.delete(res); };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }
    // Per-context index stats: read on-disk caches and report sizes.
    {
        const m = pathname.match(/^\/api\/contexts\/([^/]+)\/index-stats$/);
        if (m && req.method === 'GET') {
            const id = decodeURIComponent(m[1]);
            const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
            const ctxDir = path.join(CONTEXTS_DIR, safe);
            const cacheDir = path.join(ctxDir, '.cache');
            const readCache = (file) => {
                const p = path.join(cacheDir, file);
                try {
                    const st = fs.statSync(p);
                    let json = null;
                    try { json = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
                    return { exists: true, sizeBytes: st.size, mtime: st.mtimeMs, data: json };
                } catch {
                    return { exists: false };
                }
            };
            const search = readCache('search-index.json');
            const embed  = readCache('embeddings.json');
            const isActive = id === getActiveContext();
            const out = {
                ok: true,
                contextId: id,
                isActive,
                search: {
                    cacheExists: search.exists,
                    sizeBytes:   search.exists ? search.sizeBytes : 0,
                    mtime:       search.exists ? search.mtime : null,
                    docs:        search.exists && search.data && search.data.docs ? Object.keys(search.data.docs).length : null,
                    tokens:      search.exists && search.data && search.data.tokens ? Object.keys(search.data.tokens).length : null,
                    version:     search.exists && search.data ? search.data.version : null,
                },
                embed: {
                    cacheExists: embed.exists,
                    sizeBytes:   embed.exists ? embed.sizeBytes : 0,
                    mtime:       embed.exists ? embed.mtime : null,
                    docs:        embed.exists && embed.data && embed.data.entries ? Object.keys(embed.data.entries).length : null,
                    model:       embed.exists && embed.data ? embed.data.model || null : null,
                    dim:         embed.exists && embed.data ? embed.data.dim || null : null,
                },
                liveEmbed: isActive ? { phase: embedState.phase, docCount: embedState.docCount, model: embedState.model } : null,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
            return;
        }
    }
    // SSE: stream live embed-worker state (load progress, ready, errors).
    // The same payload as /api/embed/status is emitted on every change.
    if (pathname === '/api/embed/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(embedState)}\n\n`);
        embedSseClients.add(res);
        const keepalive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 30000);
        const cleanup = () => { clearInterval(keepalive); embedSseClients.delete(res); };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }


    if (pathname === '/api/save/autosave' && req.method === 'DELETE') {
        try {
            const body = JSON.parse(await readBody(req) || '{}');
            const { folder, file } = body;
            if (!folder || !file || file.includes('/') || file.includes('\\') || folder.includes('/') || folder.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig mappe eller filnavn' }));
                return;
            }
            const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
            const resolved = path.resolve(tmpPath);
            if (!resolved.startsWith(path.resolve(dataDir()))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }
            let removed = false;
            try { if (fs.existsSync(tmpPath)) { fs.unlinkSync(tmpPath); removed = true; } } catch (_) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, removed }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Serverfeil: ' + e.message }));
        }
        return;
    }

    // API: save file
    if (pathname === '/api/save' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { folder, file, content, append, type, presentationStyle, autosave, themes, tags } = body;

            if (!folder || !file || typeof content !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Mangler mappe, filnavn eller innhold' }));
                return;
            }
            if (!file.endsWith('.md') || file.includes('/') || file.includes('\\') || folder.includes('/') || folder.includes('\\')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ugyldig mappe eller filnavn' }));
                return;
            }

            const dirPath = path.resolve(dataDir(), folder);
            if (!dirPath.startsWith(path.resolve(dataDir()))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
            }

            fs.mkdirSync(path.join(dataDir(), folder), { recursive: true });
            const filePath = path.join(dataDir(), folder, file);

            // On EXPLICIT save (not autosave), process inline-create markers:
            //   {{X}} → create a new task with text X
            //   [[X]] → create a new result with text X
            // Both have their markers stripped (inner text kept) before
            // the file is written, so the on-disk content is clean.
            let finalContent = content;
            let createdTasks = 0;
            let createdResults = 0;
            let closedTasks = 0;
            if (!autosave) {
                const noteWeek = (typeof folder === 'string' && /^\d{4}-W\d{2}$/.test(folder)) ? folder : getCurrentYearWeek();
                const inline = extractInlineTasks(finalContent);
                if (inline.tasks.length > 0) {
                    const allTasks = loadTasks();
                    const noteRef = `${folder}/${file}`;
                    const newIds = [];
                    inline.tasks.forEach(text => {
                        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                        allTasks.push({
                            id,
                            text,
                            done: false,
                            week: noteWeek,
                            noteRef,
                            created: new Date().toISOString(),
                        });
                        newIds.push(id);
                    });
                    saveTasks(allTasks);
                    createdTasks = inline.tasks.length;
                    // Rewrite each {{X}} marker (in order) to {{?<newId>}}
                    // so the saved file keeps a stable ref to the new task.
                    // Preserve the link so the note can render an interactive
                    // checkbox and close-from-note works.
                    let i = 0;
                    finalContent = finalContent.replace(/\{\{([^{}!?][^{}]*)\}\}/g, (m) => {
                        if (i >= newIds.length) return m;
                        return `{{?${newIds[i++]}}}`;
                    });
                }
                // Process '{{!<id>}}' close markers: close the matching open
                // task. The marker is left in the file so the rendered note
                // can show a checked checkbox with the task text, and so
                // close-from-note can flip {{?id}} → {{!id}} in place.
                {
                    const allTasks = loadTasks();
                    const re = /\{\{!\s*([^{}\s]+)\s*\}\}/g;
                    const seen = new Set();
                    let m;
                    while ((m = re.exec(finalContent)) !== null) {
                        const id = m[1];
                        const t = allTasks.find(x => x.id === id);
                        if (!t) continue;
                        if (!t.done) {
                            t.done = true;
                            t.completedWeek = noteWeek;
                            t.completedAt = new Date().toISOString();
                            if (!seen.has(id)) { closedTasks++; seen.add(id); }
                        }
                    }
                    if (seen.size > 0) saveTasks(allTasks);
                }
                // Also close any open task whose text appears verbatim as
                // '~~<task text>~~' (e.g. user-typed strikethrough or the
                // already-substituted marker on a re-save). The marker is
                // left in place.
                {
                    const allTasks = loadTasks();
                    const openByText = allTasks.filter(t => !t.done && t.text);
                    if (openByText.length) {
                        let changed = false;
                        const nowIso = new Date().toISOString();
                        for (const t of openByText) {
                            const marker = `~~${t.text}~~`;
                            if (finalContent.includes(marker)) {
                                t.done = true;
                                t.completedWeek = noteWeek;
                                t.completedAt = nowIso;
                                changed = true;
                                closedTasks++;
                            }
                        }
                        if (changed) saveTasks(allTasks);
                    }
                }
                const ext = extractResults(finalContent);
                if (ext.results.length > 0) {
                    const noteMentions = extractMentions(content);
                    let allResults = loadResults();
                    ext.results.forEach(text => {
                        const textMentions = extractMentions(text);
                        const allMentions = [...new Set([...noteMentions, ...textMentions])];
                        allResults.push({
                            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                            text,
                            week: noteWeek,
                            people: allMentions,
                            created: new Date().toISOString(),
                        });
                    });
                    saveResults(allResults);
                    createdResults = ext.results.length;
                    finalContent = ext.cleanNote;
                }
            }

            if (autosave) {
                // Autosave goes to a sibling temp file so the real note isn't
                // touched until the user explicitly saves. The temp file is
                // a hidden dotfile next to the real file: `.<file>.autosave`.
                const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
                fs.writeFileSync(tmpPath, finalContent, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, autosave: true, path: `/${folder}/${file}`, tmp: true }));
                return;
            }

            if (append && fs.existsSync(filePath)) {
                fs.appendFileSync(filePath, '\n\n' + finalContent, 'utf-8');
            } else {
                fs.writeFileSync(filePath, finalContent, 'utf-8');
            }
            // Remove any stale autosave temp file now that we've persisted.
            try {
                const tmpPath = path.join(dataDir(), folder, '.' + file + '.autosave');
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch (_) {}

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: `/${folder}/${file}`, content: finalContent, createdTasks, createdResults, closedTasks }));

            const now = new Date().toISOString();
            const existing = getNoteMeta(folder, file);
            const saves = existing.saves || [];
            if (!autosave) saves.push(now);
            const updates = { type: type || existing.type || 'note', modified: now, saves };
            if (presentationStyle) updates.presentationStyle = presentationStyle;
            const incomingTags = Array.isArray(tags) ? tags : (Array.isArray(themes) ? themes : null);
            if (incomingTags) {
                const norm = incomingTags
                    .map(t => String(t || '').trim())
                    .filter(Boolean)
                    .filter((t, i, arr) => arr.indexOf(t) === i);
                updates.tags = norm;
                updates.themes = norm;
            }
            if (!existing.created) updates.created = now;
            // Cross-entity references — recomputed from finalContent on
            // each save so the sidecar always reflects what the note
            // currently links to. Meeting notes carry meetingId as a
            // first-class field; surface it here too for symmetry.
            const references = computeNoteReferences(finalContent);
            const meetingIdForRef = updates.meetingId || existing.meetingId;
            if (meetingIdForRef && !references.meetings.includes(meetingIdForRef)) {
                references.meetings = [meetingIdForRef, ...references.meetings];
            }
            updates.references = references;
            setNoteMeta(folder, file, updates);
            syncMentions(content);

            // Commit the note (and its sidecar metadata) to the per-context
            // git repo so we keep history. Best-effort, never blocks the
            // response. Only runs on explicit save.
            try {
                const repo = dataDir();
                // Lazy-write the .week-notes marker on first explicit save
                // (was previously written eagerly on context create/clone).
                if (!fs.existsSync(path.join(repo, WEEK_NOTES_MARKER))) writeMarker(repo);
                if (gitIsRepo(repo)) {
                    // Ensure autosave dotfiles and the embed sidecar never end up in commits.
                    const giPath = path.join(repo, '.gitignore');
                    const want = ['.*.autosave', '.cache/'];
                    let cur = '';
                    try { cur = fs.readFileSync(giPath, 'utf-8'); } catch (_) {}
                    const have = new Set(cur.split(/\r?\n/).map(s => s.trim()));
                    const missing = want.filter(w => !have.has(w));
                    if (missing.length > 0) {
                        const next = (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + missing.join('\n') + '\n';
                        fs.writeFileSync(giPath, next, 'utf-8');
                    }
                    const action = (!existing.created) ? 'Opprett' : 'Oppdater';
                    const subject = `${action} ${folder}/${file}`;
                    gitCommitAll(repo, subject);
                }
            } catch (_) {}
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Serverfeil: ' + e.message }));
        }
        return;
    }

    // Match /:week/:file.md — render markdown
    const match = pathname.match(/^\/([^/]+)\/([^/]+\.md)$/);
    if (match) {
        const [, week, file] = match;
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, 'utf-8', (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(pageHtml('Ikke funnet', '<h1>404</h1><p>Filen ble ikke funnet.</p><p><a href="/">← Tilbake</a></p>'));
                return;
            }

            const rendered = linkMentions(marked(preTaskMarkers(content)));
            const name = file.replace('.md', '');
            const editLink = `/editor/${week}/${encodeURIComponent(file)}`;
            const body = `<div class="md-content">${rendered}</div>`;

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pageHtml(`${name} — ${week}`, body, `<a href="${editLink}">✏️ Rediger</a>`));
        });
        return;
    }

    // Tasks page
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
                const p = mentionPeople.find(x => x.name === name || (x.key && x.key === name.toLowerCase()));
                const display = p ? (p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : p.name) : name;
                const key = p ? (p.key || (p.name || '').toLowerCase()) : name.toLowerCase();
                return pre + '<entity-mention kind="person" key="' + escapeHtml(key) + '" label="' + escapeHtml(display) + '"></entity-mention>';
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

    // API: merge tasks
    if (pathname === '/api/tasks/merge' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const src = tasks.find(t => t.id === body.srcId);
        const tgt = tasks.find(t => t.id === body.tgtId);
        if (src && tgt) {
            const parts = [tgt.note, src.text, src.note].filter(Boolean);
            const mergedNote = parts.join('\n');
            syncTaskNote(tgt, mergedNote, tasks);
            const filtered = tasks.filter(t => t.id !== body.srcId);
            // Remove results for deleted src task
            saveResults(loadResults().filter(r => r.taskId !== body.srcId));
            saveTasks(filtered);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(filtered));
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found' }));
        }
        return;
    }

    // API: reorder tasks
    if (pathname === '/api/tasks/reorder' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const ids = body.ids;
        const tasks = loadTasks();
        const ordered = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean);
        const rest = tasks.filter(t => !ids.includes(t.id));
        saveTasks([...ordered, ...rest]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: get all results
    if (pathname === '/api/results' && req.method === 'GET') {
        const week = new URL('http://x' + req.url).searchParams.get('week');
        let results = loadResults();
        if (week) results = results.filter(r => r.week === week);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
        return;
    }

    // API: create a free-form result (not tied to a task)
    if (pathname === '/api/results' && req.method === 'POST') {
        const data = JSON.parse(await readBody(req) || '{}');
        const text = String(data.text || '').trim();
        if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'text required' })); return; }
        const week = String(data.week || '').trim() || getCurrentYearWeek();
        const people = extractMentions(text);
        const all = loadResults();
        const r = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            text,
            week,
            people,
            created: new Date().toISOString()
        };
        all.push(r);
        saveResults(all);
        try { syncMentions(text); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: r }));
        return;
    }

    // API: edit result
    const editResultMatch = pathname.match(/^\/api\/results\/([^/]+)$/);
    if (editResultMatch && req.method === 'PUT') {
        const data = JSON.parse(await readBody(req));
        const results = loadResults();
        const r = results.find(r => r.id === editResultMatch[1]);
        if (!r) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
        if (data.text) r.text = data.text.trim();
        saveResults(results);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: delete result
    if (editResultMatch && req.method === 'DELETE') {
        saveResults(loadResults().filter(r => r.id !== editResultMatch[1]));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: get all people
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

    // ===== Companies =====
    if (pathname === '/api/companies' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadCompanies()));
        return;
    }
    if (pathname === '/api/companies' && req.method === 'POST') {
        try {
            const data = JSON.parse(await readBody(req) || '{}');
            const name = String(data.name || '').trim();
            if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'name is required' })); return; }
            const all = loadAllCompanies();
            const baseKey = name.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '').slice(0, 24) || 'firma';
            let key = baseKey;
            const liveKeys = new Set([
                ...all.filter(c => !c.deleted).map(c => c.key),
                ...loadPeople().map(p => p.key)
            ]);
            let n = 2;
            while (liveKeys.has(key)) { key = baseKey + n; n++; }
            const company = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                key,
                name,
                orgnr: String(data.orgnr || '').trim(),
                url: String(data.url || '').trim(),
                address: String(data.address || '').trim(),
                notes: String(data.notes || '').trim(),
                created: new Date().toISOString()
            };
            all.push(company);
            saveCompanies(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, company }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }
    const companyMatch = pathname.match(/^\/api\/companies\/([^/]+)$/);
    if (companyMatch && req.method === 'PUT') {
        try {
            const data = JSON.parse(await readBody(req) || '{}');
            const all = loadAllCompanies();
            const idx = all.findIndex(c => c.id === companyMatch[1]);
            if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
            const c = all[idx];
            if (data.name !== undefined) c.name = String(data.name).trim();
            if (data.orgnr !== undefined) c.orgnr = String(data.orgnr).trim();
            if (data.url !== undefined) c.url = String(data.url).trim();
            if (data.address !== undefined) c.address = String(data.address).trim();
            if (data.notes !== undefined) c.notes = String(data.notes).trim();
            if (data.inactive !== undefined) c.inactive = !!data.inactive;
            saveCompanies(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, company: c }));
        } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false })); }
        return;
    }
    if (companyMatch && req.method === 'DELETE') {
        const all = loadAllCompanies();
        const idx = all.findIndex(c => c.id === companyMatch[1]);
        if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Not found' })); return; }
        all[idx].deleted = true;
        all[idx].deletedAt = new Date().toISOString();
        saveCompanies(all);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // ===== Places =====
    if (pathname === '/api/places' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadPlaces()));
        return;
    }
    if (pathname === '/api/places' && req.method === 'POST') {
        try {
            const data = JSON.parse(await readBody(req) || '{}');
            const name = String(data.name || '').trim();
            if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'name is required' })); return; }
            const all = loadAllPlaces();
            const baseKey = name.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '').slice(0, 24) || 'sted';
            let key = baseKey;
            const liveKeys = new Set(all.filter(p => !p.deleted).map(p => p.key));
            let n = 2;
            while (liveKeys.has(key)) { key = baseKey + n; n++; }
            const lat = data.lat !== undefined && data.lat !== null && data.lat !== '' ? parseFloat(data.lat) : null;
            const lng = data.lng !== undefined && data.lng !== null && data.lng !== '' ? parseFloat(data.lng) : null;
            const place = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                key,
                name,
                address: String(data.address || '').trim(),
                lat: Number.isFinite(lat) ? lat : null,
                lng: Number.isFinite(lng) ? lng : null,
                notes: String(data.notes || '').trim(),
                created: new Date().toISOString()
            };
            all.push(place);
            savePlaces(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, place }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }
    const placeMatch = pathname.match(/^\/api\/places\/([^/]+)$/);
    if (placeMatch && req.method === 'PUT') {
        try {
            const data = JSON.parse(await readBody(req) || '{}');
            const all = loadAllPlaces();
            const idx = all.findIndex(p => p.id === placeMatch[1]);
            if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
            const p = all[idx];
            if (data.name !== undefined) p.name = String(data.name).trim();
            if (data.address !== undefined) p.address = String(data.address).trim();
            if (data.notes !== undefined) p.notes = String(data.notes).trim();
            if (data.lat !== undefined) {
                const v = data.lat === null || data.lat === '' ? null : parseFloat(data.lat);
                p.lat = Number.isFinite(v) ? v : null;
            }
            if (data.lng !== undefined) {
                const v = data.lng === null || data.lng === '' ? null : parseFloat(data.lng);
                p.lng = Number.isFinite(v) ? v : null;
            }
            savePlaces(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, place: p }));
        } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false })); }
        return;
    }
    if (placeMatch && req.method === 'DELETE') {
        const all = loadAllPlaces();
        const idx = all.findIndex(p => p.id === placeMatch[1]);
        if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Not found' })); return; }
        all[idx].deleted = true;
        all[idx].deletedAt = new Date().toISOString();
        savePlaces(all);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }


    // API: list meetings (?week=YYYY-WNN, ?upcoming=N days)
    if (pathname === '/api/meeting-types' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes()));
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
        let meetings = loadMeetings();
        if (sp.get('week')) {
            const w = sp.get('week');
            meetings = meetings.filter(m => dateToIsoWeek(new Date(m.date + 'T00:00:00Z')) === w);
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
        if (!data.date || !data.title) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'date and title required' }));
            return;
        }
        const meetings = loadMeetings();
        const validTypes = loadMeetingTypes().map(t => t.key);
        const m = {
            id: meetingId(),
            date: data.date,
            start: data.start || '',
            end: data.end || '',
            title: String(data.title).trim(),
            type: validTypes.includes(data.type) ? data.type : 'meeting',
            attendees: Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || ''),
            location: (data.location || '').trim(),
            placeKey: (data.placeKey || '').trim().toLowerCase(),
            notes: (data.notes || '').trim(),
            created: new Date().toISOString()
        };
        meetings.push(m);
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes, (m.attendees || []).map(a => '@' + a).join(' ')); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // API: update / delete meeting
    const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
    if (meetingMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
        const id = meetingMatch[1];
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        const data = JSON.parse(await readBody(req) || '{}');
        const m = meetings[idx];
        if (data.date !== undefined) m.date = data.date;
        if (data.start !== undefined) m.start = data.start;
        if (data.end !== undefined) m.end = data.end;
        if (data.title !== undefined) m.title = String(data.title).trim();
        if (data.type !== undefined && loadMeetingTypes().some(t => t.key === data.type)) m.type = data.type;
        if (data.attendees !== undefined) m.attendees = Array.isArray(data.attendees) ? data.attendees : extractMentions(data.attendees || '');
        if (data.location !== undefined) m.location = (data.location || '').trim();
        if (data.placeKey !== undefined) m.placeKey = (data.placeKey || '').trim().toLowerCase();
        if (data.notes !== undefined) m.notes = (data.notes || '').trim();
        m.updated = new Date().toISOString();
        saveMeetings(meetings);
        try { syncMentions(m.title, m.notes, (m.attendees || []).map(a => '@' + a).join(' ')); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, meeting: m }));
        return;
    }

    // API: list all themes (built-in + custom)
    if (pathname === '/api/themes' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(listAllThemes()));
        return;
    }
    // API: clone a theme to a new custom theme
    if (pathname === '/api/themes' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { from, name } = JSON.parse(body || '{}');
                const src = findTheme(from);
                if (!src) throw new Error('Kildetema ikke funnet');
                const baseName = String(name || (src.name + ' (kopi)')).trim() || 'Nytt tema';
                const id = uniqueThemeId(baseName);
                writeCustomTheme(id, baseName, src.vars);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, theme: readCustomTheme(id) }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }
    // API: update / delete a custom theme
    const themeMatch = pathname.match(/^\/api\/themes\/([a-z0-9_-]+)$/);
    if (themeMatch && req.method === 'PUT') {
        const id = safeThemeId(themeMatch[1]);
        if (THEMES.includes(id)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Innebygde temaer kan ikke endres — klone først' }));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { name, vars } = JSON.parse(body || '{}');
                if (!vars || typeof vars !== 'object') throw new Error('Mangler variabler');
                const existing = readCustomTheme(id);
                if (!existing) throw new Error('Tema finnes ikke');
                writeCustomTheme(id, name || existing.name, vars);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, theme: readCustomTheme(id) }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }
    if (themeMatch && req.method === 'DELETE') {
        try {
            deleteCustomTheme(themeMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }

    // API: list all contexts (with active flag)
    if (pathname === '/api/contexts' && req.method === 'GET') {
        const active = getActiveContext();
        const list = listContexts().map(name => ({
            id: name,
            active: name === active,
            settings: getContextSettings(name)
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ active, contexts: list }));
        return;
    }

    // API: list previously-disconnected contexts (URL memory only)
    if (pathname === '/api/contexts/disconnected' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadDisconnected()));
        return;
    }
    // API: forget a disconnected entry
    const forgetMatch = pathname.match(/^\/api\/contexts\/disconnected\/([^/]+)$/);
    if (forgetMatch && req.method === 'DELETE') {
        try {
            forgetDisconnected(forgetMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }
    // API: disconnect (commit + push + remove + remember url)
    const disconnectMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/disconnect$/);
    if (disconnectMatch && req.method === 'POST') {
        try {
            const result = disconnectContext(disconnectMatch[1]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: result.id, remote: result.remote }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
        return;
    }

    // API: switch active context
    if (pathname === '/api/contexts/switch' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { id } = JSON.parse(body || '{}');
                // Fast path: just commit current and flip the .active pointer.
                // The git pull and the search reindex run in the background.
                const next = setActiveContext(id, { skipPull: true });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, active: next }));
                setImmediate(() => {
                    try { pullContextRemote(next); } catch (e) { console.error('bg pull', e.message); }
                    reindexSearch();
                    if (getAppSettings().vectorSearch.enabled) restartEmbedWorker();
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    // API: create new context
    if (pathname === '/api/contexts' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { name, icon, description, remote, force } = JSON.parse(body || '{}');
                if (!name) throw new Error('Mangler navn');
                const id = createContext(name, { name, icon: icon || '📁', description: description || '', remote: remote || '' }, { force: !!force });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
            }
        });
        return;
    }

    // API: clone context from a git remote
    if (pathname === '/api/contexts/clone' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { remote, name, force } = JSON.parse(body || '{}');
                const id = cloneContext(remote, name, { force: !!force });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
            }
        });
        return;
    }

    // API: read/update context settings
    const ctxMeetingTypesMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/meeting-types$/);
    if (ctxMeetingTypesMatch && req.method === 'GET') {
        const id = safeName(ctxMeetingTypesMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('[]'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadMeetingTypes(id)));
        return;
    }
    if (ctxMeetingTypesMatch && req.method === 'PUT') {
        const id = safeName(ctxMeetingTypesMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'context not found' }));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '[]');
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
                saveMeetingTypes(cleaned, id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, types: cleaned }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
            }
        });
        return;
    }

    const ctxSettingsMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/settings$/);
    if (ctxSettingsMatch && req.method === 'GET') {
        const id = safeName(ctxSettingsMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('{}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getContextSettings(id)));
        return;
    }
    if (ctxSettingsMatch && req.method === 'PUT') {
        const id = safeName(ctxSettingsMatch[1]);
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                const force = !!data.__force;
                delete data.__force;
                setContextSettings(id, data, { force });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(e.message || e), needsConfirm: !!e.needsConfirm }));
            }
        });
        return;
    }

    // API: commit pending changes in a context
    const ctxCommitMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/commit$/);
    if (ctxCommitMatch && req.method === 'POST') {
        const id = safeName(ctxCommitMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            const dir = path.join(CONTEXTS_DIR, id);
            gitInitIfNeeded(dir, getContextSettings(id).name || id);
            let message = '';
            try { message = JSON.parse(body || '{}').message || ''; } catch {}
            const result = gitCommitAll(dir, message || `Manuell commit (${new Date().toISOString()})`);
            res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
        return;
    }

    // API: git status for a context (dirty + last commit)
    const ctxStatusMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/git$/);
    if (ctxStatusMatch && req.method === 'GET') {
        const id = safeName(ctxStatusMatch[1]);
        if (!listContexts().includes(id)) { res.writeHead(404); res.end('{}'); return; }
        const dir = path.join(CONTEXTS_DIR, id);
        const isRepo = gitIsRepo(dir);
        const dirty = isRepo ? gitIsDirty(dir) : false;
        const last = isRepo ? gitLastCommit(dir) : null;
        const remote = isRepo ? gitGetRemote(dir) : null;
        const branch = isRepo ? gitCurrentBranch(dir) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ isRepo, dirty, last, remote, branch }));
        return;
    }

    // API: push a context's repo
    const ctxPushMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/push$/);
    if (ctxPushMatch && req.method === 'POST') {
        const id = safeName(ctxPushMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const dir = path.join(CONTEXTS_DIR, id);
        const result = gitPush(dir);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: pull a context's repo from origin
    const ctxPullMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/pull$/);
    if (ctxPullMatch && req.method === 'POST') {
        const id = safeName(ctxPullMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const dir = path.join(CONTEXTS_DIR, id);
        const result = gitPull(dir);
        _cacheInvalidateContext(id);
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // API: list/preview/run data migrations for a context.
    // GET  → dry-run (preview what would change).
    // POST → actually run, with optional { quarantine, commit }.
    const ctxMigrateMatch = pathname.match(/^\/api\/contexts\/([^/]+)\/migrations$/);
    if (ctxMigrateMatch && (req.method === 'GET' || req.method === 'POST')) {
        const id = safeName(ctxMigrateMatch[1]);
        if (!listContexts().includes(id)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Kontekst finnes ikke' }));
            return;
        }
        const runMigrate = (opts) => {
            const args = ['scripts/migrate-context.js', '--ctx', id, '--json'];
            if (opts.dryRun) args.push('--dry-run');
            if (opts.quarantine) args.push('--quarantine');
            if (opts.commit) args.push('--commit');
            if (opts.only && opts.only.length) args.push('--only', opts.only.join(','));
            try {
                const out = require('child_process').execFileSync(process.execPath, args, {
                    cwd: __dirname,
                    encoding: 'utf-8',
                    timeout: 120000,
                });
                let parsed = null;
                try { parsed = JSON.parse(out); } catch {}
                return parsed
                    ? Object.assign({ ok: true }, parsed)
                    : { ok: true, output: out };
            } catch (e) {
                return { ok: false, error: e.message, output: (e.stdout || '') + (e.stderr || '') };
            }
        };
        if (req.method === 'GET') {
            const r = runMigrate({ dryRun: true });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(r));
            return;
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let opts = {};
            try { opts = JSON.parse(body || '{}'); } catch {}
            const r = runMigrate({
                quarantine: !!opts.quarantine,
                commit: opts.commit !== false,
                only: Array.isArray(opts.only) ? opts.only : null,
            });
            // Migrations rewrite the on-disk shape — drop everything
            // we cached for this context so subsequent reads pick up
            // the new layout.
            _cacheInvalidateContext(id);
            res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(r));
        });
        return;
    }

    // API: get rendered note content
    const noteViewMatch = pathname.match(/^\/api\/notes\/([^/]+)\/([^/]+)\/render$/);
    if (noteViewMatch && req.method === 'GET') {
        const week = decodeURIComponent(noteViewMatch[1]);
        const file = decodeURIComponent(noteViewMatch[2]);
        const filePath = path.join(dataDir(), week, file);
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const html = linkMentions(marked(preTaskMarkers(raw)));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, html, name: file.replace(/\.md$/, ''), week }));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        }
        return;
    }

    // API: update person
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

    // API: get all tasks
    if (pathname === '/api/tasks' && req.method === 'GET') {
        const all = url.searchParams.get('all');
        const includeDeleted = all === '1' || all === 'true';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(includeDeleted ? loadAllTasks() : loadTasks()));
        return;
    }

    // API: add task
    if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        tasks.push({ id: Date.now().toString(36), text: body.text, done: false, created: new Date().toISOString(), week: body.week || getCurrentYearWeek() });
        saveTasks(tasks);
        syncMentions(body.text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: edit task text / note
    const editTaskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (editTaskMatch && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req));
        const tasks = loadTasks();
        const task = tasks.find(t => t.id === editTaskMatch[1]);
        if (task) {
            if (body.text) task.text = body.text.trim();
            if (body.note !== undefined) syncTaskNote(task, body.note, tasks);
            else syncMentions(task.text, task.note);
            saveTasks(tasks);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: toggle task
    const toggleMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/toggle$/);
    if (toggleMatch && req.method === 'PUT') {
        let comment = '';
        try {
            const body = JSON.parse(await readBody(req));
            comment = (body.comment || '').trim();
        } catch {}

        const tasks = loadTasks();
        const task = tasks.find(t => t.id === toggleMatch[1]);
        if (task) {
            task.done = !task.done;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            if (task.done) {
                task.completedAt = now.toISOString();
                task.completedWeek = getCurrentYearWeek();
            } else {
                delete task.completedAt;
                delete task.completedWeek;
            }
            if (task.done && comment) {
                const week = task.completedWeek || task.week || getCurrentYearWeek();
                const { results: resultTexts, cleanNote: cleanComment } = extractResults(comment);
                if (resultTexts.length > 0) {
                    const mentionNames = extractMentions(comment);
                    let allResults = loadResults();
                    resultTexts.forEach(text => {
                        const textMentions = extractMentions(text);
                        const allMentions = [...new Set([...mentionNames, ...textMentions])];
                        allResults.push({
                            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                            text,
                            week,
                            taskId: task.id,
                            taskText: task.text,
                            people: allMentions,
                            created: new Date().toISOString()
                        });
                    });
                    saveResults(allResults);
                    syncMentions(task.text, comment);
                }
                const fileName = `oppgave-${task.id}.md`;
                fs.mkdirSync(path.join(dataDir(), week), { recursive: true });
                fs.writeFileSync(path.join(dataDir(), week, fileName),
                    `# ✅ ${task.text}\n\n${cleanComment}\n\n---\n*Fullført: ${dateStr}*\n`, 'utf-8');
                task.commentFile = `${week}/${fileName}`;
                setNoteMeta(week, fileName, { type: 'task' });
            }
        }
        saveTasks(tasks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // API: close (or reopen) a task from a rendered note view, also
    // flipping the {{?<id>}} ↔ {{!<id>}} marker in the source note file
    // so the rendered checkbox state persists.
    const closeFromNoteMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/close-from-note$/);
    if (closeFromNoteMatch && req.method === 'POST') {
        const id = closeFromNoteMatch[1];
        let body = {};
        try { body = JSON.parse(await readBody(req)); } catch {}
        const wantDone = body.done !== undefined ? !!body.done : true;
        const tasks = loadTasks();
        const task = tasks.find(t => t.id === id);
        if (!task) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Task not found' }));
            return;
        }
        task.done = wantDone;
        if (wantDone) {
            task.completedAt = new Date().toISOString();
            task.completedWeek = getCurrentYearWeek();
        } else {
            delete task.completedAt;
            delete task.completedWeek;
        }
        saveTasks(tasks);
        // Flip the marker in the source file when noteRef is set.
        let noteUpdated = false;
        if (task.noteRef && /^[^/]+\/[^/]+\.md$/.test(task.noteRef)) {
            const filePath = path.join(dataDir(), task.noteRef);
            try {
                if (fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf-8');
                    const fromKind = wantDone ? '?' : '!';
                    const toKind = wantDone ? '!' : '?';
                    const re = new RegExp(`\\{\\{\\${fromKind}\\s*${id}\\s*\\}\\}`, 'g');
                    const next = content.replace(re, `{{${toKind}${id}}}`);
                    if (next !== content) {
                        fs.writeFileSync(filePath, next, 'utf-8');
                        noteUpdated = true;
                    }
                }
            } catch (e) { /* non-fatal */ }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, task, noteUpdated }));
        return;
    }
    const deleteMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        const all = loadAllTasks();
        const id = deleteMatch[1];
        const idx = all.findIndex(t => t.id === id);
        if (idx >= 0) {
            all[idx] = { ...all[idx], deleted: true, deletedAt: new Date().toISOString() };
            saveTasks(all);
        }
        // Remove results for deleted task
        saveResults(loadResults().filter(r => r.taskId !== id));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadTasks()));
        return;
    }

    // API: get note metadata
    const metaMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/meta$/);
    if (metaMatch && req.method === 'GET') {
        const [, week, file] = metaMatch;
        const meta = getNoteMeta(week, decodeURIComponent(file));
        const metaTags = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(meta.themes) ? meta.themes : []);
        const merged = { ...meta, tags: metaTags, themes: metaTags };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(merged));
        return;
    }

    // API: git history for a single note. Returns a list of commits that
    // touched the file, newest first.
    const historyMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/history$/);
    if (historyMatch && req.method === 'GET') {
        const [, week, fileEnc] = historyMatch;
        const file = decodeURIComponent(fileEnc);
        if (!/^\d{4}-W\d{2}$/.test(week) || !/^[^/\\]+\.md$/.test(file)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ugyldig uke eller filnavn' }));
            return;
        }
        const repo = dataDir();
        if (!gitIsRepo(repo)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
        }
        const rel = `${week}/${file}`;
        try {
            const out = git(repo, `log --format=%H%x09%cI%x09%an%x09%s -- "${rel.replace(/"/g, '\\"')}"`).trim();
            const items = out ? out.split('\n').map(line => {
                const [hash, iso, author, ...rest] = line.split('\t');
                return { hash, shortHash: hash.slice(0, 7), date: iso, author, subject: rest.join('\t') };
            }) : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(items));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: file content at a specific commit.
    const showMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/at\/([0-9a-f]{4,40})$/);
    if (showMatch && req.method === 'GET') {
        const [, week, fileEnc, hash] = showMatch;
        const file = decodeURIComponent(fileEnc);
        if (!/^\d{4}-W\d{2}$/.test(week) || !/^[^/\\]+\.md$/.test(file)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ugyldig uke eller filnavn' }));
            return;
        }
        const repo = dataDir();
        if (!gitIsRepo(repo)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ingen git-historikk' }));
            return;
        }
        const rel = `${week}/${file}`;
        try {
            const content = git(repo, `show ${hash}:"${rel.replace(/"/g, '\\"')}"`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ hash, path: rel, content }));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Fant ikke denne versjonen' }));
        }
        return;
    }

    // API: list weeks that have content (notes / results / completed tasks)
    if (pathname === '/api/weeks' && req.method === 'GET') {
        let dirWeeks = [];
        try {
            dirWeeks = fs.readdirSync(dataDir(), { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-W\d{2}$/.test(d.name))
                .map(d => d.name);
        } catch {}
        const tasks = loadTasks();
        const results = loadResults();
        const taskWeeks = new Set();
        tasks.forEach(t => { if (t.week) taskWeeks.add(t.week); });
        const all = new Set([...dirWeeks, ...taskWeeks]);
        const out = [];
        all.forEach(w => {
            const files = getMdFiles(w).filter(f => f !== 'summarize.md');
            const hasResults = results.some(r => r.week === w);
            const hasCompleted = tasks.some(t => t.done && (t.completedWeek || t.week) === w);
            if (files.length === 0 && !hasResults && !hasCompleted) return;
            out.push(w);
        });
        out.sort((a, b) => b.localeCompare(a));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
    }

    // API: aggregate index of every note across every week, metadata only.
    // Used by /notes page for filtering by type/themes/date.
    if (pathname === '/api/notes/themes' && req.method === 'GET') {
        const themes = getContextThemes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(themes));
        return;
    }
    if (pathname === '/api/notes' && req.method === 'GET') {
        let weekDirs = [];
        try {
            weekDirs = fs.readdirSync(dataDir(), { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-W\d{2}$/.test(d.name))
                .map(d => d.name);
        } catch {}
        const out = [];
        for (const week of weekDirs) {
            const files = getMdFiles(week).filter(f => f !== 'summarize.md');
            for (const file of files) {
                const meta = getNoteMeta(week, file);
                const tagsArr = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(meta.themes) ? meta.themes : []);
                out.push({
                    week,
                    file,
                    name: file.replace(/\.md$/, ''),
                    type: meta.type || 'note',
                    pinned: !!meta.pinned,
                    tags: tagsArr,
                    themes: tagsArr,
                    created: meta.created || '',
                    modified: meta.modified || '',
                });
            }
        }
        // Newest week first, then by created/modified desc, then by file name.
        out.sort((a, b) => {
            if (a.week !== b.week) return b.week.localeCompare(a.week);
            const ad = a.modified || a.created;
            const bd = b.modified || b.created;
            if (ad && bd && ad !== bd) return bd.localeCompare(ad);
            if (ad && !bd) return -1;
            if (!ad && bd) return 1;
            return a.file.localeCompare(b.file);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
    }

    // API: week summary used by <week-section>
    const weekInfoMatch = pathname.match(/^\/api\/week\/([^/]+)$/);
    if (weekInfoMatch && req.method === 'GET') {
        const week = weekInfoMatch[1];
        const files = getMdFiles(week);
        const hasSummary = files.includes('summarize.md');
        const noteFiles = files.filter(f => f !== 'summarize.md').map(f => {
            const m = getNoteMeta(week, f);
            return { file: f, pinned: !!m.pinned, created: m.created || '' };
        });
        noteFiles.sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            if (a.created && b.created) return b.created.localeCompare(a.created);
            if (a.created) return -1;
            if (b.created) return 1;
            return b.file.localeCompare(a.file);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            week,
            weekNum: (week.split('-')[1] || ''),
            dateRange: isoWeekToDateRange(week),
            notes: noteFiles,
            hasSummary,
        }));
        return;
    }

    // API: note card data (name, type, pinned, presentationStyle, snippet HTML)
    const cardMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/card$/);
    if (cardMatch && req.method === 'GET') {
        const [, week, fileEnc] = cardMatch;
        const file = decodeURIComponent(fileEnc);
        const meta = getNoteMeta(week, file);
        const filePath = path.join(dataDir(), week, file);
        let raw = '';
        try { raw = fs.readFileSync(filePath, 'utf-8'); } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
        }
        const name = file.replace(/\.md$/, '');
        const snippet = linkMentions(escapeHtml(noteSnippet(raw, 220)));
        const cardTags = Array.isArray(meta.tags) ? meta.tags : (Array.isArray(meta.themes) ? meta.themes : []);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            week, file, name,
            type: meta.type || 'note',
            pinned: !!meta.pinned,
            presentationStyle: meta.presentationStyle || null,
            tags: cardTags,
            themes: cardTags,
            snippet,
        }));
        return;
    }

    // API: toggle pin
    const pinMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/pin$/);
    if (pinMatch && req.method === 'PUT') {
        const [, week, file] = pinMatch;
        const existing = getNoteMeta(week, decodeURIComponent(file));
        setNoteMeta(week, decodeURIComponent(file), { pinned: !existing.pinned });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pinned: !existing.pinned }));
        return;
    }

    // API: get raw note content
    const rawNoteMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)\/raw$/);
    if (rawNoteMatch && req.method === 'GET') {
        const [, week, file] = rawNoteMatch;
        const fileName = decodeURIComponent(file);
        const filePath = path.join(dataDir(), week, fileName);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403); res.end('Forbidden'); return;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
        } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Filen finnes ikke' }));
        }
        return;
    }

    // API: delete note
    const deleteNoteMatch = pathname.match(/^\/api\/notes\/([^/]+)\/(.+)$/);
    if (deleteNoteMatch && req.method === 'DELETE') {
        const [, week, file] = deleteNoteMatch;
        const filePath = path.join(dataDir(), week, decodeURIComponent(file));
        try {
            fs.unlinkSync(filePath);
            deleteNoteMeta(week, decodeURIComponent(file));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Filen finnes ikke' }));
        }
        return;
    }

    // Web components (served from components/)
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
}
`);
        return;
    }

    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageHtml('Ikke funnet', '<h1>404</h1><p><a href="/">← Tilbake</a></p>'));
});

server.listen(PORT, () => {
    console.log(`Weeks server running at http://localhost:${PORT}/`);
    checkExternalTools();
    try { ensureAllContextsInitialised(); } catch (e) { console.error('ctx init', e.message); }
    startSearchWorker();
    startEmbedWorker();
    startSummarizeWorker();
    console.log('Press Ctrl+C to stop');
});
