const { test } = require('@playwright/test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const dataPathsPath = path.join(repoRoot, 'lib', 'data-paths.js');
const migratePath = path.join(repoRoot, 'scripts', 'migrate-context.js');

function mkFixture(prefix) {
    return fs.mkdtempSync(path.join(repoRoot, prefix));
}

function runNode(code, env = {}) {
    return execFileSync(process.execPath, ['-e', code], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
}

test('data-paths resolves the configured context root', () => {
    const root = mkFixture('.migration-paths-');
    try {
        const out = runNode(`
            const assert = require('node:assert/strict');
            const { ROOT_DIR, CONTEXTS_DIR } = require(${JSON.stringify(dataPathsPath)});
            assert.equal(ROOT_DIR, ${JSON.stringify(repoRoot)});
            assert.equal(CONTEXTS_DIR, ${JSON.stringify(root)});
            process.stdout.write('ok');
        `, { DATA_DIR: root });
        assert.equal(out, 'ok');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('inventory keeps supported storage and only quarantines unknowns', () => {
    const root = mkFixture('.migration-inventory-');
    const ctxDir = path.join(root, 'alpha');
    fs.mkdirSync(ctxDir);

    const write = (rel, value) => {
        const abs = path.join(ctxDir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    };

    try {
        write('settings.json', { name: 'Alpha' });
        write('meeting-types.json', []);
        write('notes-meta.json', {});
        write('meeting-series.json', []);
        write('goals.json', []);
        write('teams.json', []);
        write('.draft-newnote.md', '# draft');
        write('.draft-newnote.meta.json', { folder: '2026-W39', file: 'note.md' });
        write('.week-notes', { type: 'week-notes', version: 'deadbeef' });
        write('.cache/search-index.json', { cached: true });

        for (const dir of ['meeting-series', 'goals', 'teams', 'notes-meta', '.cache']) {
            fs.mkdirSync(path.join(ctxDir, dir), { recursive: true });
        }

        const weekDir = path.join(ctxDir, '2026-W39');
        fs.mkdirSync(weekDir, { recursive: true });
        fs.writeFileSync(path.join(weekDir, 'note.md'), '# note');
        fs.writeFileSync(path.join(weekDir, '.note.md.autosave'), 'autosave');

        fs.writeFileSync(path.join(ctxDir, 'mystery.txt'), 'unknown');
        fs.mkdirSync(path.join(ctxDir, 'rogue'));
        fs.writeFileSync(path.join(weekDir, 'scratch.txt'), 'unknown');

        const result = runNode(`
            const assert = require('node:assert/strict');
            const { classifyRootEntry, inventoryContext } = require(${JSON.stringify(migratePath)});
            assert.equal(classifyRootEntry('teams', true).kind, 'system');
            assert.equal(classifyRootEntry('meeting-series', true).kind, 'system');
            assert.equal(classifyRootEntry('goals', true).kind, 'system');
            assert.equal(classifyRootEntry('notes-meta', true).kind, 'system');
            assert.equal(classifyRootEntry('.cache', true).kind, 'system');
            assert.equal(classifyRootEntry('teams.json', false).kind, 'known');
            assert.equal(classifyRootEntry('meeting-series.json', false).kind, 'known');
            assert.equal(classifyRootEntry('goals.json', false).kind, 'known');
            const out = inventoryContext(${JSON.stringify(ctxDir)}, {
                dryRun: false,
                quarantine: true,
                log() {},
            });
            assert.deepEqual(out.unknowns.map(u => u.relPath).sort(), [
                '2026-W39/scratch.txt',
                'mystery.txt',
                'rogue',
            ]);
            assert.equal(out.jsonProblems.length, 0);
            process.stdout.write('ok');
        `);
        assert.equal(result, 'ok');

        assert.ok(fs.existsSync(path.join(ctxDir, 'meeting-series')));
        assert.ok(fs.existsSync(path.join(ctxDir, 'goals')));
        assert.ok(fs.existsSync(path.join(ctxDir, 'teams')));
        assert.ok(fs.existsSync(path.join(ctxDir, 'notes-meta')));
        assert.ok(fs.existsSync(path.join(ctxDir, '.cache')));
        assert.ok(fs.existsSync(path.join(ctxDir, '.draft-newnote.md')));
        assert.ok(fs.existsSync(path.join(ctxDir, '.draft-newnote.meta.json')));
        assert.ok(fs.existsSync(path.join(weekDir, '.note.md.autosave')));
        assert.ok(!fs.existsSync(path.join(ctxDir, 'mystery.txt')));
        assert.ok(!fs.existsSync(path.join(ctxDir, 'rogue')));
        assert.ok(!fs.existsSync(path.join(weekDir, 'scratch.txt')));

        const quarantineDirs = fs.readdirSync(path.join(ctxDir, '_quarantine'));
        assert.equal(quarantineDirs.length, 1);
        const qDir = path.join(ctxDir, '_quarantine', quarantineDirs[0]);
        assert.ok(fs.existsSync(path.join(qDir, 'mystery.txt')));
        assert.ok(fs.existsSync(path.join(qDir, 'rogue')));
        assert.ok(fs.existsSync(path.join(qDir, '2026-W39', 'scratch.txt')));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
