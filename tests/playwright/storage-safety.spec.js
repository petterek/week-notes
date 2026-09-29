const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const corePath = path.resolve(__dirname, '../../lib/core.js');
let root;

test.beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'week-notes-storage-'));
    for (const id of ['alpha', 'beta']) {
        fs.mkdirSync(path.join(root, id));
        fs.writeFileSync(path.join(root, id, 'settings.json'), JSON.stringify({ name: id }));
    }
    fs.writeFileSync(path.join(root, '.active'), 'alpha');
});

test.afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

function runWithCore(source, setup = '') {
    return execFileSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const fs = require('node:fs');
        const path = require('node:path');
        ${setup}
        const core = require(${JSON.stringify(corePath)});
        ${source}
    `], {
        env: { ...process.env, DATA_DIR: root },
        encoding: 'utf8',
        timeout: 10_000,
    });
}

test('collection reads do not expose nested cached records to mutation', () => {
    runWithCore(`
        core.saveMeetingSeries([{ id: 'series-a', agendaItems: [{ id: 'item-a', state: 'queued' }] }]);
        const first = core.loadMeetingSeries();
        first[0].agendaItems[0].state = 'resolved';
        first[0].agendaItems.push({ id: 'unsaved' });
        const second = core.loadMeetingSeries();
        assert.equal(second[0].agendaItems[0].state, 'queued', 'unsaved nested edits leaked into cache');
        assert.equal(second[0].agendaItems.length, 1, 'unsaved array edits leaked into cache');
    `);
});

test('a corrupt collection record blocks reads and cannot be pruned by saving', () => {
    const dir = path.join(root, 'alpha', 'tasks');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ id: 'good', text: 'Keep me' }));
    fs.writeFileSync(path.join(dir, 'broken.json'), '{"id":');
    runWithCore(`
        assert.throws(() => core.loadTasks(), /broken\\.json/, 'corrupt records must not disappear silently');
        assert.throws(() => core.saveTasks([{ id: 'good', text: 'Changed' }]), /broken\\.json/,
            'saving must refuse an incomplete collection');
    `);
    expect(fs.readFileSync(path.join(dir, 'broken.json'), 'utf8')).toBe('{"id":');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'good.json'), 'utf8')).text).toBe('Keep me');
});

test('invalid legacy collections fail instead of becoming empty collections', () => {
    fs.writeFileSync(path.join(root, 'alpha', 'tasks.json'), '{"not":"an array"}');
    runWithCore(`
        assert.throws(() => core.loadTasks(), /tasks\\.json/, 'invalid legacy shape must not look empty');
    `);
});

test('request data contexts survive awaits without changing the global default', () => {
    runWithCore(`
        (async () => {
            await Promise.all([
                core.runWithDataContext('alpha', async () => {
                    await new Promise(resolve => setTimeout(resolve, 15));
                    core.saveTasks([{ id: 'a', text: 'Alpha only' }]);
                    assert.equal(core.getDataContext(), 'alpha');
                }),
                core.runWithDataContext('beta', async () => {
                    core.saveTasks([{ id: 'b', text: 'Beta only' }]);
                    await new Promise(resolve => setTimeout(resolve, 5));
                    assert.equal(core.getDataContext(), 'beta');
                    assert.equal(core.loadTasks()[0].id, 'b');
                }),
            ]);
            assert.equal(core.getActiveContext(), 'alpha', 'request scope changed global default');
            assert.equal(core.loadTasks()[0].id, 'a');
            assert.equal(core.loadCollection('tasks', 'beta')[0].id, 'b');
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `);
});

test('failed atomic replacement preserves the last readable record and clears temporary files', () => {
    runWithCore(`
        core.saveTasks([{ id: 'one', text: 'Original' }]);
        core.loadTasks();
        const rename = fs.renameSync;
        fs.renameSync = () => { throw new Error('simulated rename failure'); };
        try {
            assert.throws(() => core.saveTasks([{ id: 'one', text: 'Changed' }]), /simulated rename failure/);
        } finally {
            fs.renameSync = rename;
        }
        assert.equal(core.loadTasks()[0].text, 'Original');
        assert.deepEqual(fs.readdirSync(path.join(core.dataDir(), 'tasks')), ['one.json']);
    `);
});

test('atomic replacements preserve an existing record access mode', () => {
    runWithCore(`
        core.saveTasks([{ id: 'one', text: 'Original' }]);
        const file = path.join(core.dataDir(), 'tasks', 'one.json');
        fs.chmodSync(file, 0o640);
        const previous = process.umask(0o077);
        try {
            core.saveTasks([{ id: 'one', text: 'Changed' }]);
            assert.equal(fs.statSync(file).mode & 0o777, 0o640);
        } finally {
            process.umask(previous);
        }
    `);
});

test('a failed first collection write preserves the complete legacy fallback', () => {
    const original = [{ id: 'one', text: 'First' }, { id: 'two', text: 'Second' }];
    fs.writeFileSync(path.join(root, 'alpha', 'tasks.json'), JSON.stringify(original));
    runWithCore(`
        const original = core.loadTasks();
        const rename = fs.renameSync;
        fs.renameSync = (from, to) => {
            if (to.endsWith(path.sep + 'two.json')) throw new Error('simulated second write failure');
            return rename(from, to);
        };
        try {
            assert.throws(() => core.saveTasks(original), /simulated second write failure/);
        } finally {
            fs.renameSync = rename;
        }
        assert.deepEqual(core.loadTasks(), original, 'a partial new directory masked legacy records');
        assert.equal(fs.existsSync(path.join(core.dataDir(), 'tasks')), false);
        assert.ok(!fs.readdirSync(core.dataDir()).some(name => name.endsWith('.tmp')));
    `);
});

test('invalid metadata is reported instead of overwritten and nested cached metadata is isolated', () => {
    const dir = path.join(root, 'alpha', 'notes-meta', '2099-W01');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'broken.md.json'), '{"title":');
    runWithCore(`
        assert.throws(() => core.setNoteMeta('2099-W01', 'broken.md', { title: 'Changed' }), /broken\\.md\\.json/);
        core.setNoteMeta('2099-W01', 'good.md', { references: { tasks: ['original'] } });
        const meta = core.getNoteMeta('2099-W01', 'good.md');
        meta.references.tasks.push('unsaved');
        assert.deepEqual(core.getNoteMeta('2099-W01', 'good.md').references.tasks, ['original']);
        core.setNoteMeta('2099-W01', 'good.md', { title: 'Added later' });
        assert.deepEqual(core.getNoteMeta('2099-W01', 'good.md').references.tasks, ['original'],
            'fresh metadata updates must preserve fields not in the patch');
    `);
    expect(fs.readFileSync(path.join(dir, 'broken.md.json'), 'utf8')).toBe('{"title":');
});

test('cached metadata cannot hide later corruption during a write', () => {
    runWithCore(`
        core.setNoteMeta('2099-W01', 'note.md', { title: 'Original' });
        core.getNoteMeta('2099-W01', 'note.md');
        const file = core.notesMetaSidecarPath('2099-W01', 'note.md');
        fs.writeFileSync(file, '{"title":');
        assert.throws(() => core.setNoteMeta('2099-W01', 'note.md', { title: 'Changed' }), /note\\.md\\.json/);
        assert.equal(fs.readFileSync(file, 'utf8'), '{"title":');
    `);
});

test('a first sidecar write preserves other legacy metadata entries', () => {
    fs.writeFileSync(path.join(root, 'alpha', 'notes-meta.json'), JSON.stringify({
        '2099-W01/first.md': { title: 'First' },
        '2099-W01/second.md': { title: 'Second' },
    }));
    runWithCore(`
        core.setNoteMeta('2099-W01', 'first.md', { title: 'Changed' });
        core._cacheInvalidateNotesMeta();
        assert.equal(core.getNoteMeta('2099-W01', 'first.md').title, 'Changed');
        assert.equal(core.getNoteMeta('2099-W01', 'second.md').title, 'Second');
        assert.deepEqual(Object.keys(core.loadNotesMeta()).sort(), ['2099-W01/first.md', '2099-W01/second.md']);
    `);
});

test('switching contexts preserves in-progress autosaves in both contexts', () => {
    for (const id of ['alpha', 'beta']) {
        const dir = path.join(root, id, '2099-W01');
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, '.note.md.autosave'), 'Unsaved ' + id);
    }
    runWithCore(`
        core.runWithDataContext('alpha', () => {
            core.setActiveContext('beta', { skipPull: true });
            assert.equal(core.getDataContext(), 'alpha', 'switch changed the captured request context');
            assert.equal(core.getActiveContext(), 'beta');
        });
        for (const id of ['alpha', 'beta']) {
            assert.equal(fs.readFileSync(path.join(core.dataDir(id), '2099-W01', '.note.md.autosave'), 'utf8'),
                'Unsaved ' + id);
        }
    `);
});

test('note saving cannot acknowledge success before required metadata is persisted', () => {
    const routePath = path.resolve(__dirname, '../../routes/api/misc.js');
    runWithCore(`
        const { PassThrough } = require('node:stream');
        fs.mkdirSync(path.join(core.dataDir(), '2099-W01'));
        const autosave = path.join(core.dataDir(), '2099-W01', '.note.md.autosave');
        fs.writeFileSync(autosave, 'Recoverable work');
        const handler = require(${JSON.stringify(routePath)})({
            rootDir: ${JSON.stringify(path.resolve(__dirname, '../..'))},
            core: { ...core, setNoteMeta() { throw new Error('metadata write failed'); } },
        });
        const req = new PassThrough();
        req.method = 'POST';
        const statuses = [];
        const response = {
            writeHead(status) { statuses.push(status); },
            end() {},
        };
        const pending = handler(req, response, {
            pathname: '/api/save', url: new URL('http://localhost/api/save'),
        });
        req.end(JSON.stringify({ folder: '2099-W01', file: 'note.md', content: '# Note' }));
        pending.then(() => {
            assert.deepEqual(statuses, [500], 'success was sent before a required write failed');
            assert.equal(fs.readFileSync(autosave, 'utf8'), 'Recoverable work',
                'failed save discarded the recovery file');
        }).catch(error => { console.error(error); process.exitCode = 1; });
    `);
});

test('search never returns the globally indexed context for another request', () => {
    for (const id of ['alpha', 'beta']) {
        const dir = path.join(root, id, '2099-W01');
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'note.md'), '# Needle ' + id);
    }
    fs.writeFileSync(path.join(root, 'app-settings.json'), JSON.stringify({
        searchIndex: { enabled: true },
    }));
    runWithCore(`
        (async () => {
            core.startSearchWorker();
            try {
                await core.searchViaWorker('Needle');
                const hits = await core.runWithDataContext('beta', () => core.searchViaWorker('Needle'));
                assert.ok(hits.some(hit => String(hit.snippet).includes('beta')), 'request context note is missing');
                assert.ok(hits.every(hit => !String(hit.snippet).includes('alpha')), 'another context leaked into search');
                const advanced = await core.runWithDataContext('beta', () => core.searchViaWorker('Needle AND beta'));
                assert.equal(advanced.length, 1, 'non-default contexts lost advanced worker search');
                const alpha = await core.searchViaWorker('Needle AND alpha');
                assert.equal(alpha.length, 1, 'subsequent queries used the previous request index');
            } finally {
                core.stopSearchWorker();
            }
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `);
});

test('embedding workers retain their own context and ignore retired worker callbacks', () => {
    for (const id of ['alpha', 'beta']) {
        const dir = path.join(root, id, '2099-W01');
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'note.md'), '# Needle ' + id);
    }
    fs.writeFileSync(path.join(root, 'app-settings.json'), JSON.stringify({
        vectorSearch: { enabled: true },
    }));
    runWithCore(`
        (async () => {
            core.startEmbedWorker();
            const alpha = workers[0];
            alpha.emit('message', { type: 'ready', model: 'fake', cached: 0, ms: 0, docCount: 1 });
            assert.equal(core.isEmbedReady(), true);
            await core.runWithDataContext('beta', async () => {
                assert.equal(core.isEmbedReady(), false);
                await assert.rejects(core.vectorSearchViaWorker('Needle'), /denne konteksten/);
                core.reindexEmbeddings();
                const index = alpha.messages.filter(message => message.type === 'index').at(-1);
                assert.ok(index.docs.some(doc => doc.text.includes('alpha')));
                assert.ok(index.docs.every(doc => !doc.text.includes('beta')));
                core.restartEmbedWorker();
                const beta = workers[1];
                alpha.emit('exit', 0);
                alpha.emit('message', { type: 'ready' });
                assert.equal(core.isEmbedReady(), false);
                beta.emit('message', { type: 'ready', model: 'fake', cached: 0, ms: 0, docCount: 1 });
                assert.equal(core.isEmbedReady(), true, 'retired worker exit cleared the replacement');
                const nextIndex = beta.messages.filter(message => message.type === 'index').at(-1);
                assert.ok(nextIndex.docs.some(doc => doc.text.includes('beta')));
                assert.ok(nextIndex.docs.every(doc => !doc.text.includes('alpha')));
            });
            assert.equal(core.isEmbedReady(), false);
            core.stopEmbedWorker();
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `, `
        const { EventEmitter } = require('node:events');
        const workers = [];
        require('node:worker_threads').Worker = class extends EventEmitter {
            constructor() { super(); this.messages = []; workers.push(this); }
            postMessage(message) { this.messages.push(message); }
            terminate() { return Promise.resolve(0); }
        };
    `);
});

test('full-text search watches atomic per-record collection updates', () => {
    fs.writeFileSync(path.join(root, 'app-settings.json'), JSON.stringify({
        searchIndex: { enabled: true },
    }));
    runWithCore(`
        (async () => {
            core.saveTasks([{ id: 'watched', text: 'Before edit' }]);
            core.startSearchWorker();
            try {
                assert.equal((await core.searchViaWorker('Before edit')).length, 1);
                core.saveTasks([{ id: 'watched', text: 'Changed searchable task' }]);
                let found = false;
                const deadline = Date.now() + 2000;
                while (!found && Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 25));
                    found = (await core.searchViaWorker('Changed searchable task')).length === 1;
                }
                assert.equal(found, true, 'per-record JSON replacements did not refresh the search index');
            } finally {
                core.stopSearchWorker();
            }
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `);
});

test('full-text search notices a newly created collection directory', () => {
    fs.writeFileSync(path.join(root, 'app-settings.json'), JSON.stringify({
        searchIndex: { enabled: true },
    }));
    runWithCore(`
        (async () => {
            core.startSearchWorker();
            try {
                assert.equal((await core.searchViaWorker('Created after startup')).length, 0);
                core.saveTasks([{ id: 'new-record', text: 'Created after startup' }]);
                let found = false;
                const deadline = Date.now() + 2000;
                while (!found && Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 25));
                    found = (await core.searchViaWorker('Created after startup')).length === 1;
                }
                assert.equal(found, true, 'publishing a new collection directory did not refresh the index');
            } finally {
                core.stopSearchWorker();
            }
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `);
});
