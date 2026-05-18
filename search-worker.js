// Search worker thread: holds an in-memory inverted index of all
// searchable items (notes, tasks, meetings, people, results) for
// the currently active context.
//
// Protocol (parent → worker):
//   { type: 'reindex', contextDir }
//   { type: 'query',   q, requestId }
//
// Replies (worker → parent):
//   { type: 'indexed', contextDir, docCount, tokenCount, ms }
//   { type: 'result',  requestId, results, ms }
//   { type: 'error',   requestId?, error }

const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let docs = [];
let invertedIndex = new Map(); // token -> Set<docIdx>
let currentContextDir = null;
let watcher = null;
let rebuildTimer = null;

// Bump when the cache shape changes (e.g. doc fields added, tokenization
// rules changed). Mismatched cache files are silently rebuilt.
const CACHE_VERSION = 2;

function cachePathFor(contextDir) {
    return path.join(contextDir, '.cache', 'search-index.json');
}

function tokenize(s) {
    return String(s || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}_]+/u)
        .filter(t => t.length >= 2);
}

function addToIndex(idx, text) {
    if (!text) return;
    for (const tok of tokenize(text)) {
        let set = invertedIndex.get(tok);
        if (!set) { set = new Set(); invertedIndex.set(tok, set); }
        set.add(idx);
    }
}

function readJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

// Read a per-entity directory (one JSON per item), falling back to legacy
// flat file. Mirrors loadCollection() in lib/core.js.
function readCollection(contextDir, name) {
    const dir = path.join(contextDir, name);
    let entries;
    try { entries = fs.readdirSync(dir); } catch { entries = null; }
    if (entries) {
        const items = [];
        for (const f of entries) {
            if (!f.endsWith('.json')) continue;
            try { items.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))); } catch {}
        }
        return items;
    }
    // Fallback: legacy single-file
    const arr = readJson(path.join(contextDir, name + '.json'));
    return Array.isArray(arr) ? arr : [];
}

// Pull "relations" out of a markdown note: @mentions (people/companies),
// {{task}} references, [[result]] references. Returns a flat array of
// strings. Used to enrich the searchable blob for a note so e.g. searching
// for a person's name surfaces the notes that mention them.
function extractRelations(text) {
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

function isWeekDir(name) {
    return /^\d{4}-W\d{2}$/.test(name);
}

function dateToIsoWeek(d) {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

function pushDoc(doc) {
    const idx = docs.length;
    docs.push(doc);
    return idx;
}

// Cheap fingerprint of all source files that feed the index. mtime+size is
// good enough for invalidation in a single-process cache; collisions only
// matter if a file is replaced at exactly the same byte length within the
// fs mtime resolution and is also semantically different — vanishingly rare.
function computeSignature(contextDir) {
    const parts = [];
    let entries;
    try { entries = fs.readdirSync(contextDir, { withFileTypes: true }); } catch { return ''; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
        if (!e.isDirectory() || !isWeekDir(e.name)) continue;
        let files;
        try { files = fs.readdirSync(path.join(contextDir, e.name)); } catch { continue; }
        files.sort();
        for (const f of files) {
            if (!f.endsWith('.md')) continue;
            try {
                const st = fs.statSync(path.join(contextDir, e.name, f));
                parts.push(`${e.name}/${f}:${st.size}:${st.mtimeMs}`);
            } catch {}
        }
    }
    for (const part of notesMetaSignatureParts(contextDir)) parts.push(part);
    for (const j of ['tasks.json', 'meetings.json', 'people.json', 'results.json']) {
        try {
            const st = fs.statSync(path.join(contextDir, j));
            parts.push(`${j}:${st.size}:${st.mtimeMs}`);
        } catch {
            parts.push(`${j}:absent`);
        }
    }
    // Per-entity directories (new storage format)
    for (const dirName of ['tasks', 'meetings', 'people', 'results']) {
        const dir = path.join(contextDir, dirName);
        let dirEntries;
        try { dirEntries = fs.readdirSync(dir); } catch { dirEntries = null; }
        if (dirEntries) {
            dirEntries.sort();
            for (const f of dirEntries) {
                if (!f.endsWith('.json')) continue;
                try {
                    const st = fs.statSync(path.join(dir, f));
                    parts.push(`${dirName}/${f}:${st.size}:${st.mtimeMs}`);
                } catch {}
            }
        }
    }
    return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

function loadNotesMetaFromDisk(contextDir) {
    // Mirrors server.js loadNotesMeta(): prefer notes-meta/<week>/<file>.json
    // sidecars; fall back to legacy notes-meta.json.
    const dir = path.join(contextDir, 'notes-meta');
    if (fs.existsSync(dir)) {
        const out = {};
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
                try {
                    out[wd.name + '/' + fname.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(wdir, fname), 'utf-8'));
                } catch {}
            }
        }
        return out;
    }
    return readJson(path.join(contextDir, 'notes-meta.json')) || {};
}

function notesMetaSignatureParts(contextDir) {
    // For cache invalidation: hash the sidecar layout if present, else
    // the legacy single file's stat.
    const dir = path.join(contextDir, 'notes-meta');
    if (fs.existsSync(dir)) {
        const parts = ['notes-meta/'];
        let weekDirs;
        try { weekDirs = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { weekDirs = []; }
        weekDirs.sort((a, b) => a.name.localeCompare(b.name));
        for (const wd of weekDirs) {
            if (!wd.isDirectory()) continue;
            const wdir = path.join(dir, wd.name);
            let files;
            try { files = fs.readdirSync(wdir); } catch { continue; }
            files.sort();
            for (const fname of files) {
                if (!fname.endsWith('.json')) continue;
                try {
                    const st = fs.statSync(path.join(wdir, fname));
                    parts.push(`notes-meta/${wd.name}/${fname}:${st.size}:${st.mtimeMs}`);
                } catch {}
            }
        }
        return parts;
    }
    try {
        const st = fs.statSync(path.join(contextDir, 'notes-meta.json'));
        return [`notes-meta.json:${st.size}:${st.mtimeMs}`];
    } catch {
        return ['notes-meta.json:absent'];
    }
}

function loadCache(contextDir, signature) {
    const p = cachePathFor(contextDir);
    if (!fs.existsSync(p)) return false;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (raw.version !== CACHE_VERSION) return false;
        if (raw.signature !== signature) return false;
        if (!Array.isArray(raw.docs) || !raw.tokens) return false;
        docs = raw.docs;
        invertedIndex = new Map();
        for (const tok of Object.keys(raw.tokens)) {
            invertedIndex.set(tok, new Set(raw.tokens[tok]));
        }
        return true;
    } catch {
        return false;
    }
}

function saveCache(contextDir, signature) {
    const p = cachePathFor(contextDir);
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const tokens = {};
        for (const [tok, set] of invertedIndex) tokens[tok] = Array.from(set);
        const data = { version: CACHE_VERSION, signature, docs, tokens };
        const tmp = p + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data));
        fs.renameSync(tmp, p);
    } catch (e) {
        // Cache writes are best-effort; never fail the build.
        parentPort.postMessage({ type: 'error', error: 'search cache save: ' + e.message });
    }
}

function buildIndexUncached(contextDir) {
    docs = [];
    invertedIndex = new Map();

    const notesMeta = loadNotesMetaFromDisk(contextDir);

    // ---- Notes (week .md files) ----
    let entries;
    try { entries = fs.readdirSync(contextDir, { withFileTypes: true }); } catch { entries = []; }
    for (const e of entries) {
        if (!e.isDirectory() || !isWeekDir(e.name)) continue;
        const week = e.name;
        let files;
        try { files = fs.readdirSync(path.join(contextDir, week)); } catch { continue; }
        for (const f of files) {
            if (!f.endsWith('.md')) continue;
            let content = '';
            try { content = fs.readFileSync(path.join(contextDir, week, f), 'utf-8'); } catch { continue; }
            const name = f.replace(/\.md$/, '');
            const meta = notesMeta[week + '/' + f] || {};
            const tags = Array.isArray(meta.tags) ? meta.tags
                : (Array.isArray(meta.themes) ? meta.themes : []);
            const relations = extractRelations(content);
            const relBlob = [...tags.map(t => '#' + t), ...relations].join(' ');
            const idx = pushDoc({
                type: 'note',
                identifier: week + '/' + encodeURIComponent(f),
                title: name,
                subtitle: week + '/' + f,
                href: '/' + week + '/' + encodeURIComponent(f),
                searchText: f + '\n' + relBlob + '\n' + content,
                body: content
            });
            addToIndex(idx, f);
            addToIndex(idx, relBlob);
            addToIndex(idx, content);
        }
    }

    // ---- Tasks ----
    const tasks = readCollection(contextDir, 'tasks');
    if (Array.isArray(tasks)) {
        for (const t of tasks) {
            const blob = [t.text, t.comment, t.notes].filter(Boolean).join('\n');
            if (!blob) continue;
            const idx = pushDoc({
                type: 'task',
                identifier: t.id,
                title: t.text || '(uten tittel)',
                subtitle: (t.done ? '✓ ' : '☐ ') + (t.completedWeek || t.week || ''),
                href: '/tasks',
                searchText: blob,
                body: blob
            });
            addToIndex(idx, blob);
        }
    }

    // ---- Meetings ----
    const meetings = readCollection(contextDir, 'meetings');
    if (Array.isArray(meetings)) {
        for (const m of meetings) {
            const att = (m.attendees || []).join(' ');
            const blob = [m.title, m.location, m.notes, att].filter(Boolean).join('\n');
            if (!blob) continue;
            let week = '';
            try { if (m.date) week = dateToIsoWeek(new Date(m.date + 'T00:00:00Z')); } catch {}
            const idx = pushDoc({
                type: 'meeting',
                identifier: m.id,
                title: m.title || '(uten tittel)',
                subtitle: (m.date || '') + (m.start ? ' ' + m.start : ''),
                href: week ? `/calendar/${week}#m-${encodeURIComponent(m.id || '')}` : '/calendar',
                searchText: blob,
                body: blob
            });
            addToIndex(idx, blob);
        }
    }

    // ---- People (skip tombstones) ----
    const people = readCollection(contextDir, 'people');
    if (Array.isArray(people)) {
        for (const p of people) {
            if (p.deleted) continue;
            const blob = [p.name, p.firstName, p.lastName, p.title, p.email, p.phone, p.notes].filter(Boolean).join('\n');
            if (!blob) continue;
            const display = p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : (p.name || p.key);
            const idx = pushDoc({
                type: 'person',
                identifier: p.key || '',
                title: display,
                subtitle: p.title || p.email || ('@' + (p.key || '')),
                href: '/people#p-' + encodeURIComponent(p.key || ''),
                searchText: blob,
                body: blob
            });
            addToIndex(idx, blob);
        }
    }

    // ---- Results ----
    const results = readCollection(contextDir, 'results');
    if (Array.isArray(results)) {
        for (const r of results) {
            if (!r.text) continue;
            const idx = pushDoc({
                type: 'result',
                identifier: r.id,
                title: r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text,
                subtitle: r.week || '',
                href: '/results',
                searchText: r.text,
                body: r.text
            });
            addToIndex(idx, r.text);
        }
    }
}

// Reports back the source of the index for the caller's status message:
//   'cache'   — loaded from disk, no rebuild
//   'fresh'   — full rebuild (cache miss or stale)
function buildIndex(contextDir) {
    currentContextDir = contextDir;
    const sig = computeSignature(contextDir);
    if (sig && loadCache(contextDir, sig)) {
        return { source: 'cache', signature: sig };
    }
    buildIndexUncached(contextDir);
    if (sig) saveCache(contextDir, sig);
    return { source: 'fresh', signature: sig };
}

function isWatchableChange(filename) {
    if (!filename) return true; // watcher emitted without a name; rebuild to be safe
    const base = path.basename(filename);
    // Ignore git/editor noise
    if (filename.startsWith('.git/') || filename.includes('/.git/')) return false;
    if (base === '.active' || base.startsWith('.')) return false;
    if (base.endsWith('.swp') || base.endsWith('.tmp') || base.endsWith('~')) return false;
    // Care about week note .md files and the four context-level json files
    if (filename.endsWith('.md')) return true;
    if (['tasks.json', 'meetings.json', 'people.json', 'results.json'].includes(base)) return true;
    return false;
}

function scheduleRebuild() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        const dir = currentContextDir;
        if (!dir) return;
        try {
            const t0 = Date.now();
            const r = buildIndex(dir);
            parentPort.postMessage({
                type: 'indexed',
                contextDir: dir,
                docCount: docs.length,
                tokenCount: invertedIndex.size,
                ms: Date.now() - t0,
                trigger: 'watch',
                source: r.source
            });
        } catch (e) {
            parentPort.postMessage({ type: 'error', error: 'rebuild failed: ' + (e && e.message || e) });
        }
    }, 200);
}

function startWatcher(contextDir) {
    stopWatcher();
    try {
        watcher = fs.watch(contextDir, { recursive: true }, (_event, filename) => {
            if (isWatchableChange(filename)) scheduleRebuild();
        });
        watcher.on('error', (e) => {
            parentPort.postMessage({ type: 'error', error: 'watcher: ' + e.message });
        });
    } catch (e) {
        parentPort.postMessage({ type: 'error', error: 'watcher start failed: ' + e.message });
    }
}

function stopWatcher() {
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
}

function extractSnippet(content, q, pad = 60) {
    if (!content) return '';
    const idx = content.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return '';
    const start = Math.max(0, idx - pad);
    const end = Math.min(content.length, idx + q.length + pad);
    return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

// Extract snippet highlighting the best window for multiple terms.
function extractSnippetMulti(content, terms, pad = 60) {
    if (!content || !terms.length) return extractSnippet(content, terms[0] || '', pad);
    const lower = content.toLowerCase();
    // Find first occurrence of each term
    let bestIdx = -1;
    for (const t of terms) {
        const i = lower.indexOf(t.toLowerCase());
        if (i !== -1 && (bestIdx === -1 || i < bestIdx)) bestIdx = i;
    }
    if (bestIdx === -1) return content.slice(0, pad * 2);
    const start = Math.max(0, bestIdx - pad);
    const end = Math.min(content.length, bestIdx + (terms[0] || '').length + pad);
    return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

// =========================================================================
// Query parser: supports AND, OR, NOT, NEAR/N, "quoted phrases"
//
// Grammar (precedence low → high):
//   expr      = or_expr
//   or_expr   = and_expr ( OR and_expr )*
//   and_expr  = near_expr ( AND? near_expr )*
//   near_expr = unary ( NEAR(/N)? unary )?
//   unary     = NOT unary | atom
//   atom      = "phrase" | ( expr ) | TERM
//
// Default operator between bare terms is AND.
// NEAR defaults to distance 5.
// =========================================================================

const OP_AND  = 'AND';
const OP_OR   = 'OR';
const OP_NOT  = 'NOT';
const OP_NEAR = 'NEAR';
const OP_TERM = 'TERM';
const OP_PHRASE = 'PHRASE';

function parseQuery(raw) {
    const input = String(raw || '').trim();
    if (!input) return null;
    const tokens = lexQuery(input);
    if (!tokens.length) return null;
    let pos = 0;
    const peek = () => tokens[pos] || null;
    const advance = () => tokens[pos++];

    function parseExpr() { return parseOr(); }

    function parseOr() {
        let left = parseAnd();
        while (peek() && peek().type === 'OP' && peek().value === 'OR') {
            advance(); // consume OR
            const right = parseAnd();
            left = { op: OP_OR, left, right };
        }
        return left;
    }

    function parseAnd() {
        let left = parseNear();
        while (peek()) {
            const t = peek();
            // Explicit AND
            if (t.type === 'OP' && t.value === 'AND') {
                advance();
                const right = parseNear();
                left = { op: OP_AND, left, right };
                continue;
            }
            // Implicit AND: next token is a term, phrase, NOT, or open-paren
            if (t.type === 'TERM' || t.type === 'PHRASE' || t.type === 'LPAREN' ||
                (t.type === 'OP' && t.value === 'NOT')) {
                const right = parseNear();
                left = { op: OP_AND, left, right };
                continue;
            }
            break;
        }
        return left;
    }

    function parseNear() {
        let left = parseUnary();
        if (peek() && peek().type === 'OP' && peek().value.startsWith('NEAR')) {
            const nearTok = advance();
            const dist = nearTok.dist != null ? nearTok.dist : 5;
            const right = parseUnary();
            return { op: OP_NEAR, left, right, dist };
        }
        return left;
    }

    function parseUnary() {
        const t = peek();
        if (t && t.type === 'OP' && t.value === 'NOT') {
            advance();
            const operand = parseUnary();
            return { op: OP_NOT, operand };
        }
        // Handle - prefix (inline NOT)
        if (t && t.type === 'TERM' && t.value.startsWith('-') && t.value.length > 1) {
            advance();
            return { op: OP_NOT, operand: { op: OP_TERM, value: t.value.slice(1).toLowerCase() } };
        }
        return parseAtom();
    }

    function parseAtom() {
        const t = peek();
        if (!t) return { op: OP_TERM, value: '' };
        if (t.type === 'PHRASE') {
            advance();
            return { op: OP_PHRASE, tokens: tokenize(t.value), raw: t.value };
        }
        if (t.type === 'LPAREN') {
            advance(); // (
            const inner = parseExpr();
            if (peek() && peek().type === 'RPAREN') advance(); // )
            return inner;
        }
        if (t.type === 'TERM') {
            advance();
            return { op: OP_TERM, value: t.value.toLowerCase() };
        }
        // Skip unexpected tokens
        advance();
        return parseAtom();
    }

    const ast = parseExpr();
    return ast;
}

// Lexer: split query into typed tokens
function lexQuery(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        // Skip whitespace
        if (/\s/.test(input[i])) { i++; continue; }
        // Parentheses
        if (input[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
        if (input[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
        // Quoted phrase
        if (input[i] === '"') {
            const end = input.indexOf('"', i + 1);
            const val = end === -1 ? input.slice(i + 1) : input.slice(i + 1, end);
            tokens.push({ type: 'PHRASE', value: val });
            i = end === -1 ? input.length : end + 1;
            continue;
        }
        // Word
        const wordMatch = input.slice(i).match(/^[^\s()\"]+/);
        if (wordMatch) {
            const w = wordMatch[0];
            const wUpper = w.toUpperCase();
            if (wUpper === 'AND') {
                tokens.push({ type: 'OP', value: 'AND' });
            } else if (wUpper === 'OR') {
                tokens.push({ type: 'OP', value: 'OR' });
            } else if (wUpper === 'NOT') {
                tokens.push({ type: 'OP', value: 'NOT' });
            } else if (wUpper === 'NEAR' || /^NEAR\/\d+$/i.test(w)) {
                const distMatch = w.match(/\/(\d+)$/);
                tokens.push({ type: 'OP', value: 'NEAR', dist: distMatch ? parseInt(distMatch[1], 10) : 5 });
            } else {
                tokens.push({ type: 'TERM', value: w });
            }
            i += w.length;
            continue;
        }
        i++;
    }
    return tokens;
}

// Evaluate an AST node against the inverted index.
// Returns a Set<docIdx> of matching document indices.
function evalQuery(node) {
    if (!node) return new Set();
    switch (node.op) {
        case OP_TERM: {
            const t = node.value;
            if (!t) return new Set();
            // Exact token lookup
            const exact = invertedIndex.get(t);
            if (exact && exact.size > 0) return new Set(exact);
            // Prefix/substring fallback for partial matches
            const matches = new Set();
            for (const [tok, set] of invertedIndex) {
                if (tok.includes(t)) {
                    for (const idx of set) matches.add(idx);
                }
            }
            return matches;
        }
        case OP_PHRASE: {
            if (!node.tokens || !node.tokens.length) return new Set();
            // Start with docs containing all tokens (AND)
            const sets = node.tokens.map(t => invertedIndex.get(t));
            if (!sets.every(Boolean)) return new Set();
            // Intersect
            const sorted = sets.map((s, i) => ({ s, i }));
            sorted.sort((a, b) => a.s.size - b.s.size);
            const candidates = new Set();
            for (const idx of sorted[0].s) {
                if (sorted.every(x => x.s.has(idx))) candidates.add(idx);
            }
            // Filter: tokens must appear consecutively in searchText
            const result = new Set();
            for (const idx of candidates) {
                const docTokens = tokenize(docs[idx].searchText);
                if (hasConsecutive(docTokens, node.tokens)) result.add(idx);
            }
            return result;
        }
        case OP_AND: {
            const left = evalQuery(node.left);
            const right = evalQuery(node.right);
            const result = new Set();
            const smaller = left.size <= right.size ? left : right;
            const larger = left.size <= right.size ? right : left;
            for (const idx of smaller) {
                if (larger.has(idx)) result.add(idx);
            }
            return result;
        }
        case OP_OR: {
            const left = evalQuery(node.left);
            const right = evalQuery(node.right);
            const result = new Set(left);
            for (const idx of right) result.add(idx);
            return result;
        }
        case OP_NOT: {
            const excluded = evalQuery(node.operand);
            const result = new Set();
            for (let i = 0; i < docs.length; i++) {
                if (!excluded.has(i)) result.add(i);
            }
            return result;
        }
        case OP_NEAR: {
            const left = evalQuery(node.left);
            const right = evalQuery(node.right);
            // Intersect first
            const candidates = new Set();
            const smaller = left.size <= right.size ? left : right;
            const larger = left.size <= right.size ? right : left;
            for (const idx of smaller) {
                if (larger.has(idx)) candidates.add(idx);
            }
            // Filter by proximity
            const leftTerms = collectTerms(node.left);
            const rightTerms = collectTerms(node.right);
            const dist = node.dist || 5;
            const result = new Set();
            for (const idx of candidates) {
                const docTokens = tokenize(docs[idx].searchText);
                if (hasNear(docTokens, leftTerms, rightTerms, dist)) result.add(idx);
            }
            return result;
        }
        default:
            return new Set();
    }
}

// Collect leaf term values from an AST subtree
function collectTerms(node) {
    if (!node) return [];
    if (node.op === OP_TERM) return [node.value];
    if (node.op === OP_PHRASE) return node.tokens || [];
    const out = [];
    if (node.left) out.push(...collectTerms(node.left));
    if (node.right) out.push(...collectTerms(node.right));
    if (node.operand) out.push(...collectTerms(node.operand));
    return out;
}

// Check if tokens appear consecutively in docTokens
function hasConsecutive(docTokens, phraseTokens) {
    if (!phraseTokens.length) return true;
    outer: for (let i = 0; i <= docTokens.length - phraseTokens.length; i++) {
        for (let j = 0; j < phraseTokens.length; j++) {
            if (docTokens[i + j] !== phraseTokens[j]) continue outer;
        }
        return true;
    }
    return false;
}

// Check if any term from leftTerms appears within `dist` tokens of any
// term from rightTerms in docTokens
function hasNear(docTokens, leftTerms, rightTerms, dist) {
    const leftPositions = [];
    const rightPositions = [];
    for (let i = 0; i < docTokens.length; i++) {
        if (leftTerms.includes(docTokens[i])) leftPositions.push(i);
        if (rightTerms.includes(docTokens[i])) rightPositions.push(i);
    }
    for (const lp of leftPositions) {
        for (const rp of rightPositions) {
            if (Math.abs(lp - rp) <= dist) return true;
        }
    }
    return false;
}

// Detect if query uses operators (otherwise use legacy simple mode)
function hasOperators(raw) {
    // Check for explicit operators, quoted phrases, parens, or -prefix
    return /\b(AND|OR|NOT|NEAR)\b/i.test(raw) ||
           raw.includes('"') ||
           raw.includes('(') ||
           /(?:^|\s)-\S/.test(raw);
}

function runQuery(q) {
    const raw = String(q || '').trim();
    if (!raw) return [];

    // If query uses operators, use the full parser
    if (hasOperators(raw)) {
        const ast = parseQuery(raw);
        if (!ast) return [];
        const matchSet = evalQuery(ast);
        const terms = collectTerms(ast);
        const out = [];
        for (const i of matchSet) {
            const d = docs[i];
            out.push({
                type: d.type,
                identifier: d.identifier,
                title: d.title,
                subtitle: d.subtitle,
                href: d.href,
                snippet: terms.length
                    ? extractSnippetMulti(d.body || d.searchText, terms)
                    : ''
            });
        }
        return out;
    }

    // Legacy simple mode: tokenize → AND via inverted index → full scan fallback
    const qLower = raw.toLowerCase();
    const tokens = tokenize(raw);
    let candidates;
    if (tokens.length > 0) {
        const sets = tokens.map(t => invertedIndex.get(t));
        if (sets.every(Boolean)) {
            sets.sort((a, b) => a.size - b.size);
            candidates = [];
            const smallest = sets[0];
            outer: for (const idx of smallest) {
                for (let i = 1; i < sets.length; i++) {
                    if (!sets[i].has(idx)) continue outer;
                }
                candidates.push(idx);
            }
        } else {
            candidates = null; // fall back to full scan
        }
    } else {
        candidates = null;
    }

    const iter = candidates !== null ? candidates : docs.map((_, i) => i);
    const out = [];
    for (const i of iter) {
        const d = docs[i];
        if (!d.searchText.toLowerCase().includes(qLower)) continue;
        out.push({
            type: d.type,
            identifier: d.identifier,
            title: d.title,
            subtitle: d.subtitle,
            href: d.href,
            snippet: extractSnippet(d.body || d.searchText, raw)
        });
    }
    return out;
}

parentPort.on('message', (msg) => {
    try {
        if (msg.type === 'reindex') {
            const t0 = Date.now();
            const r = buildIndex(msg.contextDir);
            startWatcher(msg.contextDir);
            parentPort.postMessage({
                type: 'indexed',
                contextDir: msg.contextDir,
                docCount: docs.length,
                tokenCount: invertedIndex.size,
                ms: Date.now() - t0,
                trigger: 'manual',
                source: r.source
            });
        } else if (msg.type === 'query') {
            const t0 = Date.now();
            const results = runQuery(msg.q);
            parentPort.postMessage({
                type: 'result',
                requestId: msg.requestId,
                results,
                ms: Date.now() - t0
            });
        }
    } catch (e) {
        parentPort.postMessage({
            type: 'error',
            requestId: msg && msg.requestId,
            error: e && e.message ? e.message : String(e)
        });
    }
});
