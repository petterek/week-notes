const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('the managed server gets graceful shutdown so isolated data cleanup can run', () => {
    const config = require('../../playwright.config');
    expect(config.webServer.gracefulShutdown).toEqual({ signal: 'SIGTERM', timeout: 10_000 });
});

test('config reloads retain the chosen port while the test server is listening', () => {
    const configPath = path.resolve(__dirname, '../../playwright.config.js');
    const output = execFileSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const net = require('node:net');
        const file = ${JSON.stringify(configPath)};
        const first = require(file);
        const port = Number(new URL(first.use.baseURL).port);
        assert.notEqual(port, 3001);
        const listener = net.createServer();
        listener.once('error', error => { console.error(error); process.exitCode = 1; });
        listener.listen({ host: '127.0.0.1', port }, () => {
            try {
                delete require.cache[file];
                const reloaded = require(file);
                assert.equal(reloaded.use.baseURL, first.use.baseURL,
                    'a worker config reload changed the managed server address');
                process.stdout.write('ok');
            } finally {
                listener.close();
            }
        });
    `], {
        env: { ...process.env, WN_PLAYWRIGHT_PORT: '' },
        encoding: 'utf8',
        timeout: 10_000,
    });
    expect(output).toBe('ok');
});
