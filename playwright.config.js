// Playwright config for the week-notes UI test suite.
// Starts an isolated server on a dedicated test port with its own throwaway DATA_DIR.
const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const { pickTestPort } = require('./tests/helpers/pick-test-port');

// Playwright reloads its config in worker processes. Reuse the run's chosen
// port there instead of treating our own webServer as a competing listener.
const TEST_PORT = process.env.WN_PLAYWRIGHT_PORT
    ? Number(process.env.WN_PLAYWRIGHT_PORT)
    : pickTestPort({
    preferredPort: process.env.TEST_PORT || '3101',
    extraPorts: [
        process.env.TEST_PORT_ALT,
        process.env.TEST_PORT_FALLBACK,
        3102,
        3103,
        3104,
    ],
});

if (!Number.isInteger(TEST_PORT) || TEST_PORT <= 0 || TEST_PORT > 65535 || TEST_PORT === 3001) {
    throw new Error('No free Playwright test port found (tried TEST_PORT and fallback ports, never 3001)');
}

const TEST_SERVER = path.resolve(__dirname, 'tests/server.js');
const LOCAL_NO_PROXY = 'localhost,127.0.0.1,::1';
process.env.NO_PROXY = [process.env.NO_PROXY, LOCAL_NO_PROXY].filter(Boolean).join(',');
process.env.no_proxy = [process.env.no_proxy, LOCAL_NO_PROXY].filter(Boolean).join(',');
process.env.TEST_PORT = String(TEST_PORT);
process.env.WN_PLAYWRIGHT_PORT = String(TEST_PORT);

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
        baseURL: `http://localhost:${TEST_PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        actionTimeout: 5_000,
        navigationTimeout: 10_000,
    },
    webServer: {
        command: `${JSON.stringify(process.execPath)} ${JSON.stringify(TEST_SERVER)}`,
        url: `http://localhost:${TEST_PORT}`,
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
});
