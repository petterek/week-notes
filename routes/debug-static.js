'use strict';
module.exports = function(deps) {
    const fs = require('fs');
    const path = require('path');
    const _core = deps.core;
    const __dirname = deps.rootDir;
    const {
        pageHtml,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    // Results page
    // ---------- /debug component playground ----------
    if (pathname === '/debug/_mock-services.js') {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'domains', '_mock-services.js'));
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch (e) {
            res.writeHead(404); res.end('Not found');
        }
        return;
    }

    // Serve production service files at /services/<name>.js (used in pageHtml,
    // editor, etc. so components can resolve `service="XService"` via window)
    // and at /debug/services/<name>.js (used by the services debug page,
    // which imports them as ES modules). Also serves shared helpers at
    // /services/_shared/<file>.js → domains/_shared/<file>.js.
    {
        const sharedM = pathname.match(/^\/(?:debug\/)?services\/_shared\/([a-z][a-z0-9_-]*)\.js$/);
        if (sharedM) {
            const file = path.join(__dirname, 'domains', '_shared', sharedM[1] + '.js');
            try {
                const data = fs.readFileSync(file);
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
                res.end(data);
            } catch (e) {
                res.writeHead(404); res.end('Not found');
            }
            return;
        }
        const m = pathname.match(/^\/(?:debug\/)?services\/([a-z]+)\.js$/);
        if (m) {
            const file = path.join(__dirname, 'domains', m[1], 'service.js');
            try {
                const data = fs.readFileSync(file);
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
                res.end(data);
            } catch (e) {
                res.writeHead(404); res.end('Not found');
            }
            return;
        }
    }
    };
};
