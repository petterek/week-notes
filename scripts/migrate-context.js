#!/usr/bin/env node
/**
 * migrate-context.js — bring a per-context data dir up to the current
 * week-notes app version.
 *
 * Each context root (data/<id>/) carries a `.week-notes` marker:
 *
 *   { "type": "week-notes", "version": "<git sha of week-notes app>" }
 *
 * This script reads that hash, runs every registered migration whose
 * `appliesTo(markerHash, dir)` returns truthy, then rewrites the
 * marker to the running app's HEAD. Migrations are also data-shape
 * defensive (idempotent re-runs are safe).
 *
 * Usage:
 *   node scripts/migrate-context.js --ctx <id>
 *   node scripts/migrate-context.js --all
 *   node scripts/migrate-context.js --ctx <id> --dry-run
 *   node scripts/migrate-context.js --ctx <id> --commit   # also git-commit the changes
 *
 * Add a new migration: append an entry to MIGRATIONS below. Each
 * migration receives (ctxDir, { dryRun, log }) and returns a count
 * of changes (or 0 if it had nothing to do).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(REPO_ROOT, 'data');
const MARKER = '.week-notes';

function currentHead() {
    try {
        return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    } catch { return 'unknown'; }
}

function isAncestor(maybeAncestor, descendant) {
    // Returns true if `maybeAncestor` is reachable from `descendant`.
    // Used to decide whether a migration with a `since` cutoff applies.
    try {
        execSync(`git merge-base --is-ancestor ${maybeAncestor} ${descendant}`, { cwd: REPO_ROOT, stdio: 'ignore' });
        return true;
    } catch { return false; }
}

function readMarker(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf-8'));
    } catch { return null; }
}

function writeMarker(dir, hash) {
    fs.writeFileSync(
        path.join(dir, MARKER),
        JSON.stringify({ type: 'week-notes', version: hash }, null, 2) + '\n'
    );
}

// ------------------------------------------------------------------
// Migrations
// ------------------------------------------------------------------

function fixWeek(week) {
    if (!week || typeof week !== 'string') return week;
    if (/^\d{4}-W\d{2}$/.test(week)) return week;
    const m = week.match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return week;
    return `${m[1]}-W${m[2].padStart(2, '0')}`;
}
function fixWeekPath(p) {
    if (!p || typeof p !== 'string') return p;
    return p.replace(/^(\d{4})-(\d{1,2})\//, (_, y, n) => `${y}-W${n.padStart(2, '0')}/`);
}

function migrateWeekIsoFormat(ctxDir, opts) {
    const log = opts.log;
    let changes = 0;

    // Detect: any YYYY-NN directories present?
    const legacyDirs = fs.readdirSync(ctxDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{4}-\d{1,2}$/.test(d.name))
        .map(d => d.name);
    if (legacyDirs.length === 0) {
        // Also check JSON files for any unmigrated legacy refs.
        const hasLegacyRef = ['tasks.json', 'results.json', 'meetings.json'].some(f => {
            try {
                const raw = fs.readFileSync(path.join(ctxDir, f), 'utf-8');
                return /"\d{4}-\d{1,2}"/.test(raw) && !/"\d{4}-W\d{2}"/.test(raw)
                    || /"week"\s*:\s*"\d{4}-\d{1,2}"/.test(raw);
            } catch { return false; }
        });
        if (!hasLegacyRef) return 0;
    }

    // 1. Rename week directories
    for (const name of legacyDirs) {
        const m = name.match(/^(\d{4})-(\d{1,2})$/);
        const newName = `${m[1]}-W${m[2].padStart(2, '0')}`;
        if (name === newName) continue;
        const from = path.join(ctxDir, name);
        const to = path.join(ctxDir, newName);
        if (fs.existsSync(to)) { log(`  SKIP rename ${name} → ${newName} (target exists)`); continue; }
        if (!opts.dryRun) fs.renameSync(from, to);
        log(`  rename ${name} → ${newName}`);
        changes++;
    }

    // 2. tasks.json
    changes += rewriteJsonArray(ctxDir, 'tasks.json', (t) => {
        let n = 0;
        for (const k of ['week', 'completedWeek']) {
            if (t[k]) { const f = fixWeek(t[k]); if (f !== t[k]) { t[k] = f; n++; } }
        }
        if (t.commentFile) { const f = fixWeekPath(t.commentFile); if (f !== t.commentFile) { t.commentFile = f; n++; } }
        return n;
    }, opts);

    // 3. results.json
    changes += rewriteJsonArray(ctxDir, 'results.json', (r) => {
        if (r.week) { const f = fixWeek(r.week); if (f !== r.week) { r.week = f; return 1; } }
        return 0;
    }, opts);

    // 4. notes-meta.json — top-level keys are paths
    {
        const p = path.join(ctxDir, 'notes-meta.json');
        if (fs.existsSync(p)) {
            const obj = JSON.parse(fs.readFileSync(p, 'utf-8'));
            const out = {};
            let n = 0;
            for (const k of Object.keys(obj)) {
                const nk = fixWeekPath(k);
                if (nk !== k) n++;
                out[nk] = obj[k];
            }
            if (n > 0) {
                if (!opts.dryRun) fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
                log(`  notes-meta.json: ${n} key(s) remapped`);
                changes += n;
            }
        }
    }

    // 5. meetings.json — defensive (date-based usually, but check)
    changes += rewriteJsonArray(ctxDir, 'meetings.json', (m) => {
        let n = 0;
        if (m.week) { const f = fixWeek(m.week); if (f !== m.week) { m.week = f; n++; } }
        if (m.notePath) { const f = fixWeekPath(m.notePath); if (f !== m.notePath) { m.notePath = f; n++; } }
        return n;
    }, opts);

    return changes;
}

function rewriteJsonArray(ctxDir, file, fixer, opts) {
    const p = path.join(ctxDir, file);
    if (!fs.existsSync(p)) return 0;
    let arr;
    try { arr = JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch { return 0; }
    if (!Array.isArray(arr)) return 0;
    let total = 0;
    for (const item of arr) total += fixer(item) || 0;
    if (total > 0) {
        if (!opts.dryRun) fs.writeFileSync(p, JSON.stringify(arr, null, 2) + '\n');
        opts.log(`  ${file}: ${total} field(s) updated`);
    }
    return total;
}

const MIGRATIONS = [
    {
        id: 'week-iso-format',
        description: 'Convert YYYY-NN week folders/refs to YYYY-WNN (ISO 8601 with W).',
        // Data-shape detection: applies whenever any YYYY-NN dir or
        // ref still exists. No hash check needed.
        appliesTo: (_hash, dir) => {
            try {
                const legacy = fs.readdirSync(dir, { withFileTypes: true })
                    .some(d => d.isDirectory() && /^\d{4}-\d{1,2}$/.test(d.name));
                return legacy;
            } catch { return false; }
        },
        run: migrateWeekIsoFormat,
    },
    // Future migrations: append here. Each can use `appliesTo: (hash, dir) => …`
    // with `isAncestor(hash, currentHead())`-style cutoffs if needed.
];

// ------------------------------------------------------------------
// Driver
// ------------------------------------------------------------------

function migrateCtx(ctxId, opts) {
    const dir = path.join(DATA_ROOT, ctxId);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        console.error(`Context not found: ${ctxId}`);
        return false;
    }
    const log = (...args) => console.log(...args);
    const head = currentHead();
    const marker = readMarker(dir);
    const fromHash = (marker && marker.version) || 'unknown';
    log(`\n— ${ctxId} —`);
    log(`  marker: ${fromHash}`);
    log(`  target: ${head}`);
    if (fromHash === head && marker) {
        log(`  ✓ already at HEAD; checking migrations defensively…`);
    }

    let totalChanges = 0;
    const ranIds = [];
    for (const mig of MIGRATIONS) {
        if (!mig.appliesTo(fromHash, dir)) continue;
        log(`  → ${mig.id}: ${mig.description}`);
        const n = mig.run(dir, { dryRun: !!opts.dryRun, log });
        log(`    (${n} change${n === 1 ? '' : 's'})`);
        totalChanges += n;
        if (n > 0) ranIds.push(mig.id);
    }

    if (totalChanges === 0) {
        log(`  no changes needed.`);
    }

    if (!opts.dryRun && head !== 'unknown') {
        writeMarker(dir, head);
        log(`  marker → ${head}`);
    } else if (opts.dryRun) {
        log(`  (dry-run: marker not updated)`);
    }

    if (opts.commit && !opts.dryRun && totalChanges > 0) {
        try {
            execSync(`git add -A`, { cwd: dir });
            execSync(`git -c user.email="ukenotater@local" -c user.name="Ukenotater" commit -m "Migrer kontekst (${ranIds.join(', ') || 'ingen migreringer'}) til ${head.slice(0, 7)}" --no-verify`, { cwd: dir });
            log(`  ✓ committed in ${ctxId}`);
        } catch (e) {
            log(`  (git commit failed or nothing to commit: ${e.message.split('\n')[0]})`);
        }
    }

    return true;
}

function main() {
    const args = process.argv.slice(2);
    const opts = {
        ctx: null,
        all: false,
        dryRun: false,
        commit: false,
    };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--ctx') opts.ctx = args[++i];
        else if (a === '--all') opts.all = true;
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--commit') opts.commit = true;
        else if (a === '-h' || a === '--help') {
            console.log('Usage: node scripts/migrate-context.js [--ctx <id> | --all] [--dry-run] [--commit]');
            return;
        } else {
            console.error(`Unknown arg: ${a}`);
            process.exit(2);
        }
    }
    if (!opts.ctx && !opts.all) {
        console.error('Specify --ctx <id> or --all');
        process.exit(2);
    }

    const targets = opts.all
        ? fs.readdirSync(DATA_ROOT, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
            .map(d => d.name)
        : [opts.ctx];

    for (const id of targets) migrateCtx(id, opts);
}

main();
