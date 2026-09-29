const fs = require('node:fs');
const path = require('node:path');

const TEST_CONTEXT_ID = 'playwright';
const TEST_DATA_ROOT = path.resolve(__dirname, '..', '..', '.playwright-data');

const SEED_ISO = '2026-01-01T00:00:00.000Z';
const SEEDED_PEOPLE = {
    spaceKey: {
        id: 'person-space',
        key: 'per jørgen',
        name: 'Per Jørgen',
        firstName: 'Per',
        lastName: 'Jørgen',
        created: SEED_ISO,
    },
    regular: {
        id: 'person-ada',
        key: 'ada',
        name: 'Ada Test',
        firstName: 'Ada',
        lastName: 'Test',
        created: SEED_ISO,
    },
};

const SEEDED_TEAM = {
    id: 'team-test',
    key: 'testteam',
    name: 'Test Team',
    members: [SEEDED_PEOPLE.spaceKey.key],
    notes: 'Synthetic test team',
    created: SEED_ISO,
};

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function seedPlaywrightData(rootDir) {
    const ctxDir = path.join(rootDir, TEST_CONTEXT_ID);
    ensureDir(rootDir);
    ensureDir(ctxDir);
    ensureDir(path.join(ctxDir, 'meeting-series'));

    fs.writeFileSync(path.join(rootDir, '.active'), `${TEST_CONTEXT_ID}\n`);
    writeJson(path.join(rootDir, 'app-settings.json'), {
        vectorSearch: { enabled: false },
        searchIndex: { enabled: false },
        summarization: { enabled: false },
        crossContextCalendar: { enabled: false },
    });
    writeJson(path.join(rootDir, 'user.json'), {
        mePersonKey: SEEDED_PEOPLE.regular.key,
    });
    writeJson(path.join(ctxDir, 'settings.json'), {
        name: 'Playwright test context',
        icon: '🧪',
        description: 'Synthetic isolated data for browser tests',
        theme: 'paper',
        workHours: [null, null, null, null, null, null, null],
        defaultMeetingMinutes: 30,
    });
    writeJson(path.join(ctxDir, 'people.json'), [
        Object.assign({ teams: [SEEDED_TEAM.key] }, SEEDED_PEOPLE.spaceKey),
        SEEDED_PEOPLE.regular,
    ]);
    writeJson(path.join(ctxDir, 'companies.json'), []);
    writeJson(path.join(ctxDir, 'places.json'), []);
    writeJson(path.join(ctxDir, 'results.json'), []);
    writeJson(path.join(ctxDir, 'tasks.json'), []);
    writeJson(path.join(ctxDir, 'meetings.json'), []);
    writeJson(path.join(ctxDir, 'teams.json'), [SEEDED_TEAM]);
    writeJson(path.join(ctxDir, 'goals.json'), []);
    writeJson(path.join(ctxDir, 'meeting-types.json'), [
        { key: 'meeting', icon: '🗓️', label: 'Møte', mins: 60 },
    ]);
}

function createCleanupStack() {
    const cleanups = [];
    return {
        add(fn) {
            cleanups.push(fn);
            return fn;
        },
        async run() {
            const errors = [];
            for (let i = cleanups.length - 1; i >= 0; i -= 1) {
                try {
                    await cleanups[i]();
                } catch (error) {
                    errors.push(error);
                }
            }
            if (errors.length) {
                const err = new Error(errors.map((error) => error && error.message ? error.message : String(error)).join('; '));
                err.causes = errors;
                throw err;
            }
        },
    };
}

function createIsolatedDataRoot() {
    ensureDir(TEST_DATA_ROOT);
    return fs.mkdtempSync(path.join(TEST_DATA_ROOT, 'run-'));
}

module.exports = {
    TEST_CONTEXT_ID,
    TEST_DATA_ROOT,
    SEEDED_PEOPLE,
    SEEDED_TEAM,
    createCleanupStack,
    createIsolatedDataRoot,
    seedPlaywrightData,
};
