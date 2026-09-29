const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
    createIsolatedDataRoot,
    seedPlaywrightData,
} = require('./helpers/playwright-fixtures');
const PORT = Number.parseInt(process.env.TEST_PORT || process.env.PORT || '3101', 10) || 3101;
if (PORT === 3001 || PORT < 1 || PORT > 65535) {
    throw new Error('The isolated test server requires a valid port other than 3001');
}
const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(ROOT_DIR, 'server.js');
const DATA_ROOT = createIsolatedDataRoot();
let child = null;
let shuttingDown = false;
let keepAlive = setInterval(() => {}, 1 << 30);

function cleanupDataRoot() {
    try {
        fs.rmSync(DATA_ROOT, { recursive: true, force: true });
    } catch (error) {
        console.error('Failed to remove isolated Playwright data dir:', DATA_ROOT, error);
    }
}

function finish(code) {
    if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
    }
    cleanupDataRoot();
    process.exit(code);
}

function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!child || child.exitCode !== null || child.signalCode) {
        finish(code);
        return;
    }

    const killer = setTimeout(() => {
        if (child && child.exitCode === null) {
            try { child.kill('SIGKILL'); } catch {}
        }
    }, 5000);

    child.once('exit', () => {
        clearTimeout(killer);
        finish(code);
    });

    try {
        child.kill('SIGTERM');
    } catch (error) {
        clearTimeout(killer);
        finish(code);
    }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));
process.on('exit', () => {
    try {
        if (child && child.exitCode === null) child.kill('SIGTERM');
    } catch {}
    cleanupDataRoot();
});
process.on('uncaughtException', (error) => {
    console.error(error);
    shutdown(1);
});
process.on('unhandledRejection', (error) => {
    console.error(error);
    shutdown(1);
});

seedPlaywrightData(DATA_ROOT);
console.log(`[playwright-server] seeded isolated data dir: ${DATA_ROOT}`);
console.log(`[playwright-server] starting server on port ${PORT}`);

child = spawn(process.execPath, [SERVER_PATH], {
    env: {
        ...process.env,
        PORT: String(PORT),
        DATA_DIR: DATA_ROOT,
    },
    stdio: 'inherit',
});

child.once('error', (error) => {
    console.error('[playwright-server] failed to start child server:', error);
    shutdown(1);
});

child.once('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[playwright-server] child exited unexpectedly (${code ?? 'null'}, ${signal ?? 'null'})`);
    shuttingDown = true;
    finish(typeof code === 'number' ? code : 1);
});
