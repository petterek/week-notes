// server.js — slim dispatcher. Helpers live in lib/, route handlers in routes/.
'use strict';
const http = require('http');
const _core = require('./lib/core');
const _dates = require('./lib/dates');

// --- lifecycle diagnostics --------------------------------------------------
// The server has been observed to "stop" without leaving a crash trace. These
// hooks log timestamped lines for every plausible exit path so we can tell
// next time whether it was a signal, an exception, an explicit exit, or the
// event loop draining.
const _ts = () => new Date().toISOString();
const _startedAt = Date.now();
console.log(`[${_ts()}] 🟢 server.js boot (pid=${process.pid}, node=${process.version})`);

process.on('uncaughtException', (e) => {
    console.error(`[${_ts()}] uncaughtException`, e && e.stack || e);
});
process.on('unhandledRejection', (e) => {
    console.error(`[${_ts()}] unhandledRejection`, e && e.stack || e);
});
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT']) {
    process.on(sig, () => {
        const upMs = Date.now() - _startedAt;
        console.error(`[${_ts()}] 🔴 received ${sig} after ${(upMs / 1000).toFixed(1)}s uptime — exiting`);
        process.exit(0);
    });
}
process.on('beforeExit', (code) => {
    console.error(`[${_ts()}] beforeExit code=${code} (event loop drained)`);
});
process.on('exit', (code) => {
    const upMs = Date.now() - _startedAt;
    console.error(`[${_ts()}] 🔻 exit code=${code} after ${(upMs / 1000).toFixed(1)}s uptime`);
});
// Heartbeat so silent gaps in the log are visible.
setInterval(() => {
    const m = process.memoryUsage();
    console.log(`[${_ts()}] ❤️  heartbeat rss=${(m.rss / 1024 / 1024).toFixed(0)}MB heap=${(m.heapUsed / 1024 / 1024).toFixed(0)}/${(m.heapTotal / 1024 / 1024).toFixed(0)}MB`);
}, 5 * 60 * 1000).unref();

const {
    PORT,
    pageHtml,
    listContexts,
    checkExternalTools,
    ensureAllContextsInitialised,
    rebuildTaskNoteRefs,
    startSearchWorker,
    startEmbedWorker,
    startSummarizeWorker,
} = _core;

const deps = { core: _core, dates: _dates, rootDir: __dirname };

// Order matters — most-specific / static first, then per-domain APIs, then page catch-alls.
const handlers = [
    require('./routes/static-early')(deps),
    require('./routes/spa')(deps),
    require('./routes/debug-static')(deps),
    require('./routes/debug')(deps),
    require('./routes/pages')(deps),
    require('./routes/api/misc')(deps),
    require('./routes/note-render')(deps),
    require('./routes/tasks-page')(deps),
    require('./routes/api/tasks')(deps),
    require('./routes/api/results')(deps),
    require('./routes/api/goals')(deps),
    require('./routes/api/people')(deps),
    require('./routes/api/companies')(deps),
    require('./routes/api/places')(deps),
    require('./routes/api/meetings')(deps),
    require('./routes/api/themes')(deps),
    require('./routes/api/contexts')(deps),
    require('./routes/api/notes')(deps),
    require('./routes/assets-late')(deps),
];

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // First-run guard: if no contexts exist, force the user onto /welcome.
    if (listContexts().length === 0) {
        const allowed = pathname === '/welcome'
            || pathname === '/welcome.css'
            || pathname.startsWith('/themes/')
            || pathname.startsWith('/api/contexts')
            || pathname === '/_layouts' || pathname === '/_layouts.html';
        if (!allowed) {
            res.writeHead(302, { Location: '/welcome' });
            res.end();
            return;
        }
    }

    const ctx = { pathname, url, method: req.method };

    try {
        for (const h of handlers) {
            const beforeListeners = req.listenerCount('end') + req.listenerCount('data');
            await h(req, res, ctx);
            if (res.writableEnded || res.headersSent) return;
            // If the handler started reading the request body it has claimed the route.
            if (req.listenerCount('end') + req.listenerCount('data') > beforeListeners) return;
        }
    } catch (e) {
        console.error('handler error', e);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
        return;
    }

    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageHtml('Ikke funnet', '<h1>404</h1><p><a href="/">← Tilbake</a></p>'));
});

server.listen(PORT, () => {
    console.log(`Weeks server running at http://localhost:${PORT}/`);
    checkExternalTools();
    try { ensureAllContextsInitialised(); } catch (e) { console.error('ctx init', e.message); }
    try { rebuildTaskNoteRefs(); } catch (e) { console.error('rebuildTaskNoteRefs', e.message); }
    startSearchWorker();
    startEmbedWorker();
    startSummarizeWorker();
    console.log('Press Ctrl+C to stop');
});
