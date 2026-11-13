'use strict';

const fs = require('fs');
const path = require('path');
const swaggerDir = require('swagger-ui-dist').getAbsoluteFSPath();

const assets = new Map([
    ['/openapi.json', ['openapi.json', 'application/json']],
    ['/api-explorer.js', ['public/api-explorer.js', 'application/javascript']],
    ['/api-explorer.css', ['public/api-explorer.css', 'text/css']],
    ['/api-explorer-assets/swagger-ui.css', [path.join(swaggerDir, 'swagger-ui.css'), 'text/css']],
    ['/api-explorer-assets/swagger-ui-bundle.js', [path.join(swaggerDir, 'swagger-ui-bundle.js'), 'application/javascript']],
    ['/api-explorer-assets/swagger-ui-bundle.js.LICENSE.txt', [path.join(swaggerDir, 'swagger-ui-bundle.js.LICENSE.txt'), 'text/plain']],
    ['/api-explorer-assets/LICENSE', [path.join(swaggerDir, 'LICENSE'), 'text/plain']],
    ['/api-explorer-assets/NOTICE', [path.join(swaggerDir, 'NOTICE'), 'text/plain']],
]);

function isApiDocsPath(pathname) {
    return pathname === '/api-explorer' || assets.has(pathname);
}

module.exports = function({ core, rootDir }) {
    return async function(req, res, { pathname, contextId }) {
        if (req.method !== 'GET' || !isApiDocsPath(pathname)) return;
        if (pathname !== '/api-explorer') {
            const [file, contentType] = assets.get(pathname);
            const data = await fs.promises.readFile(path.resolve(rootDir, file));
            res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': 'no-cache' });
            res.end(data);
            return;
        }
        const theme = encodeURIComponent(core.getActiveTheme());
        const context = core.escapeHtml(contextId || 'Ingen kontekst');
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'",
        });
        res.end(`<!doctype html>
<html lang="nb">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>API-utforsker · Ukenotater</title>
    <link rel="stylesheet" href="/themes/${theme}.css">
    <link rel="stylesheet" href="/api-explorer-assets/swagger-ui.css">
    <link rel="stylesheet" href="/api-explorer.css">
    <script defer src="/api-explorer-assets/swagger-ui-bundle.js"></script>
    <script defer src="/api-explorer.js"></script>
</head>
<body>
    <header class="api-explorer-header">
        <a href="/">Ukenotater</a>
        <h1>API-utforsker</h1>
        <a href="/openapi.json" download>Last ned OpenAPI</a>
    </header>
    <main>
        <aside class="api-explorer-notice" aria-label="Kontekst og datalagring">
            <p>Kontekst ved åpning: <strong>${context}</strong>. Forespørsler bruker nettleserens <code>wn_ctx</code>-informasjonskapsel.
            Bytt kontekst i <a href="/settings">innstillingene</a> eller med <code>POST /api/contexts/switch</code>.
            Informasjonskapselen deles mellom faner.</p>
            <p><strong>Ikke et testmiljø:</strong> «Execute» sender forespørsler til denne serveren.
            Skriveoperasjoner kan endre eller slette data og utføre Git-operasjoner på vertsmaskinen. Du blir bedt om å bekrefte før de sendes.</p>
        </aside>
        <p id="api-explorer-error" role="alert" hidden></p>
        <div id="swagger-ui" aria-label="API-dokumentasjon"></div>
    </main>
    <footer>
        Swagger UI: <a href="/api-explorer-assets/LICENSE">lisens</a>,
        <a href="/api-explorer-assets/NOTICE">merknader</a> og
        <a href="/api-explorer-assets/swagger-ui-bundle.js.LICENSE.txt">tredjepartslisenser</a>.
    </footer>
</body>
</html>`);
    };
};

module.exports.isApiDocsPath = isApiDocsPath;
