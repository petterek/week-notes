// server.js — slim dispatcher. Helpers live in lib/, route handlers in routes/.
'use strict';
const http = require('http');
const _core = require('./lib/core');
const _dates = require('./lib/dates');

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
