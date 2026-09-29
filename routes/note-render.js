'use strict';
module.exports = function(deps) {
    const fs = require('fs');
    const path = require('path');
    const { marked } = require('marked');
    const _core = deps.core;
    const {
        dataDir, linkMentions, pageHtml, preTaskMarkers,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    // Match /:week/:file.md — render markdown
    const match = pathname.match(/^\/([^/]+)\/([^/]+\.md)$/);
    if (match) {
        const [, week, file] = match;
        const filePath = path.join(dataDir(), week, file);
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(dataDir()))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const rendered = linkMentions(marked(preTaskMarkers(content)));
            const name = file.replace('.md', '');
            const editLink = `/editor/${week}/${encodeURIComponent(file)}`;
            const body = `<div class="md-content">${rendered}</div>`;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pageHtml(`${name} — ${week}`, body, `<a href="${editLink}">✏️ Rediger</a>`));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(pageHtml('Ikke funnet', '<h1>404</h1><p>Filen ble ikke funnet.</p><p><a href="/">← Tilbake</a></p>'));
        }
        return;
    }
    };
};
