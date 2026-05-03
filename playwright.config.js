// Playwright config for the week-notes UI test suite.
// Assumes the dev server is already running on http://localhost:3001.
// Start it with `./run.sh` (or `node server.js`) before running tests.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 20_000,
    expect: { timeout: 5_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [
        ['list'],
        ['json', { outputFile: 'tests/.last-run.json' }],
    ],
    use: {
        baseURL: 'http://localhost:3001',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        actionTimeout: 5_000,
        navigationTimeout: 10_000,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
});
