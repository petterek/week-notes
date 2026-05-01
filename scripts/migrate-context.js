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

// Latest reachable release tag from the app repo HEAD (e.g. "v2"). Used
// to derive the migration branch name in the context repo. Returns null
// when no tag is reachable (or git not available).
function currentReleaseTag() {
    try {
        return execSync('git describe --tags --abbrev=0', { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() || null;
    } catch { return null; }
}

function isGitRepo(dir) {
    try {
        execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' });
        return true;
    } catch { return false; }
}

// Returns the porcelain status output (empty string = clean). Throws
// if dir is not a git repo.
function gitStatus(dir) {
    return execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' });
}

function gitCurrentBranch(dir) {
    try {
        const out = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
        return out === 'HEAD' ? null : out;
    } catch { return null; }
}

function gitBranchExists(dir, name) {
    try {
        execSync(`git show-ref --verify --quiet refs/heads/${name}`, { cwd: dir, stdio: 'ignore' });
        return true;
    } catch { return false; }
}

function gitCheckoutOrCreate(dir, branch) {
    if (gitBranchExists(dir, branch)) {
        execSync(`git checkout ${branch}`, { cwd: dir, stdio: 'ignore' });
    } else {
        execSync(`git checkout -b ${branch}`, { cwd: dir, stdio: 'ignore' });
    }
}

function isAncestor(maybeAncestor, descendant) {
    // Returns true if `maybeAncestor` is reachable from `descendant`.
    // Used to decide whether a migration with a `since` cutoff applies.
    try {
        execSync(`git merge-base --is-ancestor ${maybeAncestor} ${descendant}`, { cwd: REPO_ROOT, stdio: 'ignore' });
        return true;
    } catch { return false; }
}

function resolveRef(ref) {
    // Resolve a git ref (tag/branch/sha) to a full SHA. Returns null if unknown.
    try {
        return execSync(`git rev-parse ${ref}^{commit}`, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    } catch { return null; }
}

// Convention: anchor `appliesTo` cutoffs on release tags, not arbitrary
// commit hashes. Use `appliesBeforeTag('v1')` so a migration runs when
// the context's marker points at a commit *older than* the tag (or at an
// untagged/unknown state).
function appliesBeforeTag(tag) {
    const tagSha = resolveRef(tag);
    if (!tagSha) return () => false;
    return (markerHash /*, dir */) => {
        if (!markerHash || markerHash === 'unknown') return true;
        // Marker is "before tag" iff marker is an ancestor of tag AND
        // marker !== tag itself.
        if (markerHash === tagSha) return false;
        return isAncestor(markerHash, tagSha);
    };
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
// File inventory
// ------------------------------------------------------------------

const KNOWN_ROOT_FILES = new Set([
    '.week-notes',
    '.gitignore',
    '.gitattributes',
    'settings.json',
    'tasks.json',
    'results.json',
    'people.json',
    'meetings.json',
    'meeting-types.json',
    'notes-meta.json',
    'companies.json',
    'places.json',
]);
const KNOWN_ROOT_DIRS = new Set([
    '.git',
    'tasks',
    'meetings',
    'people',
    'companies',
    'places',
    'results',
]);

function classifyRootEntry(name, isDir) {
    if (isDir) {
        if (KNOWN_ROOT_DIRS.has(name)) return { kind: 'system' };
        if (/^\d{4}-W\d{2}$/.test(name)) return { kind: 'week-dir' };
        if (/^\d{4}-\d{1,2}$/.test(name)) return { kind: 'legacy-week-dir' };
        if (name === '_quarantine') return { kind: 'quarantine' };
        return { kind: 'unknown-dir' };
    }
    if (KNOWN_ROOT_FILES.has(name)) return { kind: 'known' };
    return { kind: 'unknown-file' };
}

function inventoryContext(ctxDir, opts) {
    const log = opts.log;
    const unknowns = []; // { absPath, relPath, isDir }

    const rootEntries = fs.readdirSync(ctxDir, { withFileTypes: true });
    for (const e of rootEntries) {
        const c = classifyRootEntry(e.name, e.isDirectory());
        if (c.kind === 'unknown-file' || c.kind === 'unknown-dir') {
            unknowns.push({ absPath: path.join(ctxDir, e.name), relPath: e.name, isDir: e.isDirectory() });
        }
    }

    // Inside week dirs: anything that isn't a .md file is suspect.
    for (const e of rootEntries) {
        if (!e.isDirectory()) continue;
        if (!/^\d{4}-W\d{2}$/.test(e.name)) continue;
        const weekDir = path.join(ctxDir, e.name);
        for (const sub of fs.readdirSync(weekDir, { withFileTypes: true })) {
            if (sub.isDirectory()) {
                unknowns.push({ absPath: path.join(weekDir, sub.name), relPath: `${e.name}/${sub.name}`, isDir: true });
            } else if (!sub.name.toLowerCase().endsWith('.md')) {
                unknowns.push({ absPath: path.join(weekDir, sub.name), relPath: `${e.name}/${sub.name}`, isDir: false });
            }
        }
    }

    // Validate known JSON files parse + have expected shape.
    const jsonChecks = [
        { file: 'settings.json', expect: 'object' },
        { file: 'tasks.json', expect: 'array' },
        { file: 'results.json', expect: 'array' },
        { file: 'people.json', expect: 'array' },
        { file: 'meetings.json', expect: 'array' },
        { file: 'meeting-types.json', expect: 'array' },
        { file: 'notes-meta.json', expect: 'object' },
        { file: 'companies.json', expect: 'array' },
        { file: 'places.json', expect: 'array' },
    ];
    const jsonProblems = [];
    for (const c of jsonChecks) {
        const p = path.join(ctxDir, c.file);
        if (!fs.existsSync(p)) continue;
        try {
            const v = JSON.parse(fs.readFileSync(p, 'utf-8'));
            const ok = c.expect === 'array' ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v));
            if (!ok) jsonProblems.push(`  ⚠ ${c.file}: expected ${c.expect}`);
        } catch (e) {
            jsonProblems.push(`  ⚠ ${c.file}: parse error (${e.message.split('\n')[0]})`);
        }
    }

    if (unknowns.length === 0 && jsonProblems.length === 0) {
        log('  inventory: ✓ no issues');
        return { unknowns, jsonProblems };
    }
    log('  inventory:');
    for (const u of unknowns) log(`    • unknown ${u.isDir ? 'dir ' : 'file'} ${u.relPath}`);
    for (const p of jsonProblems) log(p);

    if (opts.quarantine && !opts.dryRun && unknowns.length > 0) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const qDir = path.join(ctxDir, '_quarantine', stamp);
        fs.mkdirSync(qDir, { recursive: true });
        for (const u of unknowns) {
            const dest = path.join(qDir, u.relPath);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.renameSync(u.absPath, dest);
            log(`    → quarantined ${u.relPath} → _quarantine/${stamp}/${u.relPath}`);
        }
    } else if (unknowns.length > 0) {
        log('    (use --quarantine to move these into _quarantine/<timestamp>/)');
    }

    return { unknowns, jsonProblems };
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

function migrateGitignore(ctxDir, opts) {
    const log = opts.log;
    const want = ['.*.swp', '.*.swo', '.*.autosave', '.cache/'];
    const p = path.join(ctxDir, '.gitignore');
    let cur = '';
    try { cur = fs.readFileSync(p, 'utf-8'); } catch {}
    const lines = new Set(cur.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    const missing = want.filter(w => !lines.has(w));
    let changes = 0;
    if (missing.length > 0) {
        const next = (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + missing.join('\n') + '\n';
        if (!opts.dryRun) fs.writeFileSync(p, next);
        log(`  .gitignore: ${missing.length} entr${missing.length === 1 ? 'y' : 'ies'} added (${missing.join(', ')})`);
        changes += missing.length;
    }
    // Untrack any .cache/ files that were committed before the rule existed.
    try {
        const tracked = require('child_process')
            .execFileSync('git', ['-C', ctxDir, 'ls-files', '.cache'], { encoding: 'utf-8' })
            .split('\n').filter(Boolean);
        if (tracked.length > 0) {
            if (!opts.dryRun) {
                require('child_process')
                    .execFileSync('git', ['-C', ctxDir, 'rm', '--cached', '-r', '--quiet', '.cache'], { stdio: 'ignore' });
            }
            log(`  .cache: untracked ${tracked.length} file(s) (still on disk)`);
            changes += tracked.length;
        }
    } catch {}
    return changes;
}

// ------------------------------------------------------------------
// split-entities-to-folders
//
// Converts each <entity>.json (array) into one JSON file per item
// under <entity>/, then deletes the legacy file.
//
//   tasks.json    → tasks/<id>.json
//   meetings.json → meetings/<id>.json
//   results.json  → results/<id>.json
//   people.json   → people/<key>.json   (tombstones kept)
//   companies.json → companies/<key>.json (tombstones kept)
//   places.json   → places/<key>.json   (tombstones kept)
//
// Idempotent: if the folder already exists for an entity, the legacy
// file is just removed.
// ------------------------------------------------------------------

const SPLIT_ENTITIES = [
    { file: 'tasks.json', dir: 'tasks', idField: 'id' },
    { file: 'meetings.json', dir: 'meetings', idField: 'id' },
    { file: 'results.json', dir: 'results', idField: 'id' },
    { file: 'people.json', dir: 'people', idField: 'key' },
    { file: 'companies.json', dir: 'companies', idField: 'key' },
    { file: 'places.json', dir: 'places', idField: 'key' },
];

function sanitizeStem(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

function pickStem(item, idField, used) {
    const candidates = [];
    if (idField && item && item[idField] !== undefined) candidates.push(item[idField]);
    if (item && item.key) candidates.push(item.key);
    if (item && item.id) candidates.push(item.id);
    for (const c of candidates) {
        const s = sanitizeStem(c);
        if (s && !used.has(s)) return s;
    }
    // Fall back to a generated stem; collide-safe.
    let stem = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    while (used.has(stem)) stem += '_' + Math.random().toString(36).slice(2, 4);
    return stem;
}

function migrateSplitEntities(ctxDir, opts) {
    const log = opts.log;
    let changes = 0;
    for (const ent of SPLIT_ENTITIES) {
        const legacy = path.join(ctxDir, ent.file);
        const dir = path.join(ctxDir, ent.dir);
        const hasLegacy = fs.existsSync(legacy);
        if (!hasLegacy) continue;

        let arr;
        try { arr = JSON.parse(fs.readFileSync(legacy, 'utf-8')); }
        catch (e) {
            log(`  ${ent.file}: parse error (${e.message.split('\n')[0]}) — skipped`);
            continue;
        }
        if (!Array.isArray(arr)) {
            log(`  ${ent.file}: not an array — skipped`);
            continue;
        }

        if (!opts.dryRun) fs.mkdirSync(dir, { recursive: true });
        const used = new Set();
        let written = 0;
        for (const item of arr) {
            const stem = pickStem(item, ent.idField, used);
            used.add(stem);
            const fname = stem + '.json';
            if (!opts.dryRun) {
                fs.writeFileSync(path.join(dir, fname), JSON.stringify(item, null, 2) + '\n');
            }
            written++;
        }
        if (!opts.dryRun) fs.unlinkSync(legacy);
        log(`  ${ent.file} → ${ent.dir}/ (${written} item${written === 1 ? '' : 's'})`);
        changes += written + 1;
    }
    return changes;
}

const MIGRATIONS = [
    {
        id: 'week-iso-format',
        description: 'Convert YYYY-NN week folders/refs to YYYY-WNN (ISO 8601 with W).',
        appliesTo: (_hash, dir) => {
            try {
                const legacy = fs.readdirSync(dir, { withFileTypes: true })
                    .some(d => d.isDirectory() && /^\d{4}-\d{1,2}$/.test(d.name));
                return legacy;
            } catch { return false; }
        },
        run: migrateWeekIsoFormat,
    },
    {
        id: 'gitignore-baseline',
        description: 'Ensure .gitignore covers vim swap files, autosave temp files and the .cache/ embed sidecar.',
        appliesTo: (_hash, dir) => {
            const want = ['.*.swp', '.*.swo', '.*.autosave', '.cache/'];
            let cur = '';
            try { cur = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8'); } catch {}
            const lines = new Set(cur.split(/\r?\n/).map(s => s.trim()));
            if (want.some(w => !lines.has(w))) return true;
            // Also re-run if .cache/ is still tracked in git despite being ignored.
            try {
                const out = require('child_process')
                    .execFileSync('git', ['-C', dir, 'ls-files', '.cache'], { encoding: 'utf-8' });
                if (out.trim()) return true;
            } catch {}
            return false;
        },
        run: migrateGitignore,
    },
    {
        id: 'split-entities-to-folders',
        description: 'Split tasks/meetings/results/people/companies/places JSON arrays into one-file-per-item folders.',
        appliesTo: (_hash, dir) => {
            return SPLIT_ENTITIES.some(e => fs.existsSync(path.join(dir, e.file)));
        },
        run: migrateSplitEntities,
    },
    // Future migrations: append here.
    //
    // Convention: tie cutoffs to release tags, not arbitrary commits, e.g.:
    //
    //   {
    //       id: 'rename-foo',
    //       description: 'Rename foo → bar in tasks.json',
    //       appliesTo: appliesBeforeTag('v1'),  // runs if marker pre-dates v1
    //       run: migrateFoo,
    //   }
    //
    // Tag releases on GitHub (`git tag -a vN <sha> && git push origin vN`)
    // before introducing breaking data shape changes, so contexts always
    // have a stable anchor to compare their `.week-notes` marker against.
];

// ------------------------------------------------------------------
// Driver
// ------------------------------------------------------------------

function migrateCtx(ctxId, opts) {
    const dir = path.join(DATA_ROOT, ctxId);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        console.error(`Context not found: ${ctxId}`);
        return null;
    }
    const lines = [];
    const log = opts.json
        ? ((...args) => lines.push(args.join(' ')))
        : ((...args) => console.log(...args));
    const head = currentHead();
    const marker = readMarker(dir);
    const fromHash = (marker && marker.version) || 'unknown';
    log(`\n— ${ctxId} —`);
    log(`  marker: ${fromHash}`);
    log(`  target: ${head}`);
    if (fromHash === head && marker) {
        log(`  ✓ already at HEAD; checking migrations defensively…`);
    }

    // Pre-flight: when we'll actually write to disk, make sure the
    // context repo is clean and switch to a per-release migration branch
    // so the changes land somewhere reviewable.
    let migrationBranch = null;
    let originalBranch = null;
    if (!opts.dryRun && isGitRepo(dir)) {
        const dirty = gitStatus(dir).trim();
        if (dirty) {
            log(`  ✗ aborted: working tree has uncommitted changes — commit or stash before migrating.`);
            return {
                ctx: ctxId,
                marker: fromHash,
                target: head,
                migrations: MIGRATIONS.map(m => ({ id: m.id, description: m.description, applies: !!m.appliesTo(fromHash, dir) })),
                ranIds: [],
                totalChanges: 0,
                unknowns: [],
                jsonProblems: [],
                aborted: 'dirty-working-tree',
                output: lines.join('\n'),
            };
        }
        const tag = currentReleaseTag();
        if (tag) {
            migrationBranch = tag;
            originalBranch = gitCurrentBranch(dir);
            if (originalBranch !== migrationBranch) {
                try {
                    gitCheckoutOrCreate(dir, migrationBranch);
                    log(`  branch: ${originalBranch || '(detached)'} → ${migrationBranch}`);
                } catch (e) {
                    log(`  ✗ aborted: could not checkout ${migrationBranch}: ${e.message.split('\n')[0]}`);
                    return {
                        ctx: ctxId,
                        marker: fromHash,
                        target: head,
                        migrations: [],
                        ranIds: [],
                        totalChanges: 0,
                        unknowns: [],
                        jsonProblems: [],
                        aborted: 'checkout-failed',
                        output: lines.join('\n'),
                    };
                }
            } else {
                log(`  branch: ${migrationBranch} (already on it)`);
            }
        }
    }

    const onlySet = opts.only && opts.only.length ? new Set(opts.only) : null;
    const migrationStates = MIGRATIONS.map(m => ({
        id: m.id,
        description: m.description,
        applies: !!m.appliesTo(fromHash, dir),
    }));

    let totalChanges = 0;
    const ranIds = [];
    for (const mig of MIGRATIONS) {
        const applies = mig.appliesTo(fromHash, dir);
        if (!applies) continue;
        if (onlySet && !onlySet.has(mig.id)) {
            log(`  ⊝ ${mig.id}: skipped (not selected)`);
            continue;
        }
        log(`  → ${mig.id}: ${mig.description}`);
        const n = mig.run(dir, { dryRun: !!opts.dryRun, log });
        log(`    (${n} change${n === 1 ? '' : 's'})`);
        totalChanges += n;
        if (n > 0) ranIds.push(mig.id);
    }

    if (totalChanges === 0) {
        log(`  no migrations needed.`);
    }

    // Always run inventory after migrations.
    const inv = inventoryContext(dir, { dryRun: !!opts.dryRun, quarantine: !!opts.quarantine, log });
    if (inv.unknowns.length > 0 && !opts.dryRun && opts.quarantine) totalChanges += inv.unknowns.length;

    // Only bump the marker when we ran *all* applicable migrations
    // (otherwise we'd lose track of pending ones).
    const ranAll = !onlySet;
    if (!opts.dryRun && head !== 'unknown' && ranAll) {
        writeMarker(dir, head);
        log(`  marker → ${head}`);
    } else if (!opts.dryRun && !ranAll) {
        log(`  (selective run: marker not bumped)`);
    } else if (opts.dryRun) {
        log(`  (dry-run: marker not updated)`);
    }

    if (opts.commit && !opts.dryRun && totalChanges > 0) {
        try {
            execSync(`git add -A`, { cwd: dir });
            execSync(`git -c user.email="ukenotater@local" -c user.name="Ukenotater" commit -m "Migrer kontekst (${ranIds.join(', ') || 'ingen migreringer'})${ranAll ? ` til ${head.slice(0, 7)}` : ''}" --no-verify`, { cwd: dir });
            log(`  ✓ committed in ${ctxId}`);
        } catch (e) {
            log(`  (git commit failed or nothing to commit: ${e.message.split('\n')[0]})`);
        }
    }

    return {
        ctx: ctxId,
        marker: fromHash,
        target: head,
        migrations: migrationStates,
        ranIds,
        totalChanges,
        unknowns: inv.unknowns.map(u => u.relPath),
        jsonProblems: inv.jsonProblems,
        output: lines.join('\n'),
    };
}

function main() {
    const args = process.argv.slice(2);
    const opts = {
        ctx: null,
        all: false,
        dryRun: false,
        commit: false,
        quarantine: false,
        json: false,
        only: null,
    };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--ctx') opts.ctx = args[++i];
        else if (a === '--all') opts.all = true;
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--commit') opts.commit = true;
        else if (a === '--quarantine') opts.quarantine = true;
        else if (a === '--json') opts.json = true;
        else if (a === '--only') opts.only = String(args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
        else if (a === '-h' || a === '--help') {
            console.log('Usage: node scripts/migrate-context.js [--ctx <id> | --all] [--dry-run] [--commit] [--quarantine] [--json] [--only id1,id2]');
            console.log('  --quarantine  move unknown root files / non-md files in week dirs into _quarantine/<timestamp>/');
            console.log('  --json        emit a JSON report (suppresses normal stdout logging)');
            console.log('  --only        run only the listed migrations (marker is not bumped on selective runs)');
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

    const results = [];
    for (const id of targets) {
        const r = migrateCtx(id, opts);
        if (r) results.push(r);
    }
    if (opts.json) {
        process.stdout.write(JSON.stringify(opts.all ? results : (results[0] || null), null, 2) + '\n');
    }
}

main();
