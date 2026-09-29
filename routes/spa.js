'use strict';
const { resolvePageRoute } = require('../lib/page-routes');

module.exports = function(deps) {
    const _core = deps.core;
    const { pageHtml } = _core;
    return async function(req, res, ctx) {
        const route = resolvePageRoute(ctx.pathname);
        if (!route || route.serverShell === false) return;
        const ctxCookie = _core.activeContextCookie(_core.getActiveContextFromReq(req));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': ctxCookie });
        res.end(pageHtml(route.shellTitle, ''));
    };
};
