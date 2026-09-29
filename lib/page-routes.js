'use strict';

function route(path, fragment, shellTitle, fragmentTitle, aliases) {
    return Object.freeze({
        path,
        fragment,
        shellTitle,
        fragmentTitle: fragmentTitle || shellTitle,
        aliases: Array.isArray(aliases) ? aliases.slice() : [],
    });
}

function pattern(source, fragment, shellTitle, fragmentTitle, serverShell = true) {
    return Object.freeze({
        pattern: new RegExp(source),
        fragment,
        shellTitle,
        fragmentTitle: fragmentTitle || shellTitle,
        serverShell,
    });
}

const PAGE_ROUTES = Object.freeze([
    route('/', '/pages/home.html', 'Ukenotater', 'Hjem', ['/index.html']),
    route('/editor', '/pages/editor.html', 'Nytt notat'),
    route('/tasks', '/pages/tasks.html', 'Oppgaver'),
    route('/people', '/pages/people.html', 'Personer og steder'),
    route('/results', '/pages/results.html', 'Resultater'),
    route('/goals', '/pages/goals.html', 'Mål'),
    route('/notes', '/pages/notes.html', 'Notater', 'Notater · Ukenotater'),
    route('/settings', '/pages/settings.html', 'Innstillinger'),
    route('/calendar', '/pages/calendar.html', 'Kalender'),
    route('/calendar/all', '/pages/calendar-all.html', 'Alle kontekster — Kalender'),
    route('/meeting-series', '/pages/meeting-series.html', 'Møteserier'),
]);

const PAGE_ROUTE_PATTERNS = Object.freeze([
    pattern('^/editor/[^/]+/[^/]+\\.md$', '/pages/editor.html', 'Nytt notat', null, false),
    pattern('^/calendar/all/\\d{4}-W\\d{2}$', '/pages/calendar-all.html', 'Alle kontekster — Kalender'),
    pattern('^/calendar/\\d{4}-W\\d{2}$', '/pages/calendar.html', 'Kalender'),
    pattern('^/team/[^/]+$', '/pages/team.html', 'Team'),
    pattern('^/meeting-occurrence/[^/]+$', '/pages/meeting-occurrence.html', 'Møte'),
]);

function normalizePagePath(input) {
    if (input == null || input === '') return '/';
    try {
        const parsed = new URL(String(input), 'https://page-shell.local');
        if (parsed.pathname === '/index.html') return '/';
        return parsed.pathname || '/';
    } catch (_) {
        let path = String(input);
        const hash = path.indexOf('#');
        if (hash >= 0) path = path.slice(0, hash);
        const query = path.indexOf('?');
        if (query >= 0) path = path.slice(0, query);
        if (!path) return '/';
        if (path === '/index.html') return '/';
        return path.charAt(0) === '/' ? path : '/' + path;
    }
}

function buildStaticRouteMeta() {
    const out = Object.create(null);
    for (const entry of PAGE_ROUTES) {
        const meta = Object.freeze({
            path: entry.path,
            fragment: entry.fragment,
            shellTitle: entry.shellTitle,
            fragmentTitle: entry.fragmentTitle,
        });
        out[entry.path] = meta;
        for (const alias of entry.aliases) out[alias] = meta;
    }
    return Object.freeze(out);
}

function buildStaticRouteMap() {
    const out = Object.create(null);
    for (const entry of PAGE_ROUTES) {
        out[entry.path] = entry.fragment;
        for (const alias of entry.aliases) out[alias] = entry.fragment;
    }
    return Object.freeze(out);
}

const STATIC_PAGE_ROUTE_META = buildStaticRouteMeta();
const STATIC_PAGE_ROUTE_MAP = buildStaticRouteMap();

function resolvePageRoute(inputPath) {
    const pathname = normalizePagePath(inputPath);
    const staticRoute = STATIC_PAGE_ROUTE_META[pathname];
    if (staticRoute) return staticRoute;
    for (const entry of PAGE_ROUTE_PATTERNS) {
        if (entry.pattern.test(pathname)) {
            return Object.freeze({
                path: pathname,
                fragment: entry.fragment,
                shellTitle: entry.shellTitle,
                fragmentTitle: entry.fragmentTitle,
                serverShell: entry.serverShell,
            });
        }
    }
    return null;
}

function toClientPageRoutes() {
    return {
        routes: PAGE_ROUTES.map((entry) => ({
            path: entry.path,
            fragment: entry.fragment,
            shellTitle: entry.shellTitle,
            title: entry.fragmentTitle,
            aliases: entry.aliases.slice(),
        })),
        patterns: PAGE_ROUTE_PATTERNS.map((entry) => ({
            pattern: {
                source: entry.pattern.source,
                flags: entry.pattern.flags || '',
            },
            fragment: entry.fragment,
            shellTitle: entry.shellTitle,
            title: entry.fragmentTitle,
        })),
    };
}

module.exports = {
    PAGE_ROUTES,
    PAGE_ROUTE_PATTERNS,
    STATIC_PAGE_ROUTE_META,
    STATIC_PAGE_ROUTE_MAP,
    normalizePagePath,
    resolvePageRoute,
    toClientPageRoutes,
};
