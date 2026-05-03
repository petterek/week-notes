#!/usr/bin/env node
/**
 * rebuild-task-refs.js — scan every weekly note in a context directory
 * for inline task markers ({{?<id>}} / {{!<id>}}) and rewrite the
 * `noteRefs` array on every matching task so each task knows which
 * notes reference it.
 *
 * Tasks are stored as one JSON file per task at
 *   <ctxDir>/tasks/<id>.json
 *
 * Notes are markdown files at
 *   <ctxDir>/<YYYY-WNN>/<name>.md
 *
 * Usage:
 *   node scripts/rebuild-task-refs.js --ctx <id>
 *   node scripts/rebuild-task-refs.js --dir /abs/path/to/data/<ctx>
 *   node scripts/rebuild-task-refs.js --all
 *
 * Module API:
 *   const { rebuild } = require('./scripts/rebuild-task-refs');
 *   const summary = rebuild(ctxDir);   // { scanned, refsFound, tasksUpdated }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(REPO_ROOT, 'data');

// Match inline task markers: {{?<id>}} (open) or {{!<id>}} (closed).
// The braces and id charset mirror server.js's preTaskMarkers.
const TASK_MARKER_RE = /\{\{[!?]\s*([^{}\s]+)\s*\}\}/g;

function extractTaskRefs(content) {
    const ids = new Set();
    if (typeof content !== 'string' || !content) return ids;
    TASK_MARKER_RE.lastIndex = 0;
    let m;
    while ((m = TASK_MARKER_RE.exec(content)) !== null) ids.add(m[1]);
    return ids;
}

function scanNotes(ctxDir) {
    const refsByTask = new Map(); // id -> Set<"week/file">
    let weeks;
    try { weeks = fs.readdirSync(ctxDir, { withFileTypes: true }); } catch { return refsByTask; }
    for (const w of weeks) {
        if (!w.isDirectory() || !/^\d{4}-W\d{2}$/.test(w.name)) continue;
        let files;
        try { files = fs.readdirSync(path.join(ctxDir, w.name)); } catch { continue; }
        for (const f of files) {
            if (!/\.md$/i.test(f) || f.startsWith('.')) continue;
            let content;
            try { content = fs.readFileSync(path.join(ctxDir, w.name, f), 'utf-8'); } catch { continue; }
            const ids = extractTaskRefs(content);
            if (ids.size === 0) continue;
            const ref = `${w.name}/${f}`;
            for (const id of ids) {
                if (!refsByTask.has(id)) refsByTask.set(id, new Set());
                refsByTask.get(id).add(ref);
            }
        }
    }
    return refsByTask;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function rebuild(ctxDir) {
    const summary = { ctxDir, scanned: 0, refsFound: 0, tasksUpdated: 0 };
    if (!ctxDir || !fs.existsSync(ctxDir)) return summary;
    const refsByTask = scanNotes(ctxDir);
    summary.refsFound = Array.from(refsByTask.values())
        .reduce((acc, s) => acc + s.size, 0);

    const tasksDir = path.join(ctxDir, 'tasks');
    let taskFiles;
    try { taskFiles = fs.readdirSync(tasksDir); } catch { return summary; }
    for (const fname of taskFiles) {
        if (!fname.endsWith('.json')) continue;
        const fp = path.join(tasksDir, fname);
        let task;
        try { task = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { continue; }
        if (!task || !task.id) continue;
        summary.scanned++;
        const set = refsByTask.get(task.id);
        const next = set ? Array.from(set).sort() : [];
        const prev = Array.isArray(task.noteRefs) ? task.noteRefs.slice().sort() : [];
        if (arraysEqual(next, prev)) continue;
        if (next.length === 0) delete task.noteRefs;
        else task.noteRefs = next;
        try {
            fs.writeFileSync(fp, JSON.stringify(task, null, 2), 'utf-8');
            summary.tasksUpdated++;
        } catch {}
    }
    return summary;
}

function listAllContexts() {
    try {
        return fs.readdirSync(DATA_ROOT, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .map(d => d.name);
    } catch { return []; }
}

function parseArgs(argv) {
    const args = { ctx: null, dir: null, all: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--ctx') args.ctx = argv[++i];
        else if (a === '--dir') args.dir = argv[++i];
        else if (a === '--all') args.all = true;
        else if (a === '-h' || a === '--help') args.help = true;
    }
    return args;
}

function printSummary(s) {
    console.log(`  ${s.ctxDir}: scanned ${s.scanned} task(s), ${s.refsFound} marker(s), updated ${s.tasksUpdated}`);
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help || (!args.ctx && !args.dir && !args.all)) {
        console.log('Usage: node scripts/rebuild-task-refs.js --ctx <id> | --dir <path> | --all');
        process.exit(args.help ? 0 : 1);
    }
    const targets = [];
    if (args.dir) targets.push(path.resolve(args.dir));
    if (args.ctx) targets.push(path.join(DATA_ROOT, args.ctx));
    if (args.all) for (const c of listAllContexts()) targets.push(path.join(DATA_ROOT, c));
    if (targets.length === 0) {
        console.error('No context resolved.');
        process.exit(1);
    }
    console.log(`Rebuilding task→note refs for ${targets.length} context(s)…`);
    for (const dir of targets) {
        if (!fs.existsSync(dir)) {
            console.error(`  ${dir}: not found, skipped`);
            continue;
        }
        printSummary(rebuild(dir));
    }
}

if (require.main === module) main();

module.exports = { rebuild, scanNotes, extractTaskRefs };
