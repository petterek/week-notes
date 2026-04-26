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

let docs = [];
let invertedIndex = new Map(); // token -> Set<docIdx>
let currentContextDir = null;
let watcher = null;
let rebuildTimer = null;

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

function isWeekDir(name) {
    return /^\d{4}-\d{2}$/.test(name);
}

function dateToIsoWeek(d) {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-' + String(weekNum).padStart(2, '0');
}

function pushDoc(doc) {
    const idx = docs.length;
    docs.push(doc);
    return idx;
}

function buildIndex(contextDir) {
    docs = [];
    invertedIndex = new Map();
    currentContextDir = contextDir;

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
            const idx = pushDoc({
                type: 'note',
                title: name,
                subtitle: week + '/' + f,
                href: '/' + week + '/' + encodeURIComponent(f),
                searchText: f + '\n' + content,
                body: content
            });
            addToIndex(idx, f);
            addToIndex(idx, content);
        }
    }

    // ---- Tasks ----
    const tasks = readJson(path.join(contextDir, 'tasks.json'));
    if (Array.isArray(tasks)) {
        for (const t of tasks) {
            const blob = [t.text, t.comment, t.notes].filter(Boolean).join('\n');
            if (!blob) continue;
            const idx = pushDoc({
                type: 'task',
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
    const meetings = readJson(path.join(contextDir, 'meetings.json'));
    if (Array.isArray(meetings)) {
        for (const m of meetings) {
            const att = (m.attendees || []).join(' ');
            const blob = [m.title, m.location, m.notes, att].filter(Boolean).join('\n');
            if (!blob) continue;
            let week = '';
            try { if (m.date) week = dateToIsoWeek(new Date(m.date + 'T00:00:00Z')); } catch {}
            const idx = pushDoc({
                type: 'meeting',
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
    const people = readJson(path.join(contextDir, 'people.json'));
    if (Array.isArray(people)) {
        for (const p of people) {
            if (p.deleted) continue;
            const blob = [p.name, p.firstName, p.lastName, p.title, p.email, p.phone, p.notes].filter(Boolean).join('\n');
            if (!blob) continue;
            const display = p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : (p.name || p.key);
            const idx = pushDoc({
                type: 'person',
                title: display,
                subtitle: p.title || p.email || ('@' + (p.key || '')),
                href: '/people#' + encodeURIComponent(p.key || ''),
                searchText: blob,
                body: blob
            });
            addToIndex(idx, blob);
        }
    }

    // ---- Results ----
    const results = readJson(path.join(contextDir, 'results.json'));
    if (Array.isArray(results)) {
        for (const r of results) {
            if (!r.text) continue;
            const idx = pushDoc({
                type: 'result',
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
            buildIndex(dir);
            parentPort.postMessage({
                type: 'indexed',
                contextDir: dir,
                docCount: docs.length,
                tokenCount: invertedIndex.size,
                ms: Date.now() - t0,
                trigger: 'watch'
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

function runQuery(q) {
    const raw = String(q || '').trim();
    if (!raw) return [];
    const qLower = raw.toLowerCase();

    // Use the inverted index when the query splits into clean tokens that
    // all exist in the index (AND semantics). Otherwise fall back to a
    // full scan so partial-token / substring queries still work.
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
            buildIndex(msg.contextDir);
            startWatcher(msg.contextDir);
            parentPort.postMessage({
                type: 'indexed',
                contextDir: msg.contextDir,
                docCount: docs.length,
                tokenCount: invertedIndex.size,
                ms: Date.now() - t0,
                trigger: 'manual'
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
