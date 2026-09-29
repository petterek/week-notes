const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
    resolvePageRoute,
} = require('../../lib/page-routes');
const createPageShell = require('../../lib/page-shell');

function makeShell() {
    return createPageShell({
        escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },
        navbarHtml() {
            return '<nav id="appNav"><nav-button href="/" data-key="h"></nav-button><nav-button href="/tasks" data-key="o"></nav-button></nav>';
        },
        getActiveTheme() {
            return 'light';
        },
        getMePersonKey() {
            return 'me';
        },
        getDataContext() {
            return 'playwright';
        },
    });
}

test('page route manifest resolves shell titles and fragment URLs', () => {
    const home = resolvePageRoute('/index.html?tab=notes#anchor');
    expect(home).toMatchObject({
        path: '/',
        fragment: '/pages/home.html',
        shellTitle: 'Ukenotater',
        fragmentTitle: 'Hjem',
    });

    const calendar = resolvePageRoute('/calendar/2026-W01?view=all#top');
    expect(calendar).toMatchObject({
        path: '/calendar/2026-W01',
        fragment: '/pages/calendar.html',
        shellTitle: 'Kalender',
        fragmentTitle: 'Kalender',
    });

    const allContexts = resolvePageRoute('/calendar/all/2026-W01');
    expect(allContexts).toMatchObject({
        path: '/calendar/all/2026-W01',
        fragment: '/pages/calendar-all.html',
        shellTitle: 'Alle kontekster — Kalender',
        fragmentTitle: 'Alle kontekster — Kalender',
    });
});

test('page shell keeps the route manifest and script order intact', () => {
    const render = makeShell();
    const html = render('Kalender', '<section id="body">body</section>');

    expect(html).toContain('window.WN_PAGE_ROUTES=');
    expect(html).toContain('window.WN_ME_PERSON_KEY=');
    expect(html.indexOf('/app-shell.js')).toBeLessThan(html.indexOf('/components/_shared.js'));
    expect(html.indexOf('/components/_shared.js')).toBeLessThan(html.indexOf('/service-registry.js'));
    expect(html.indexOf('marked.min.js')).toBeLessThan(html.indexOf('/emoji-ext.js'));
});

test('app shell parses as a classic browser script', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public/app-shell.js'), 'utf8');
    expect(() => new Function(src)).not.toThrow();
    expect(src.includes("addEventListener('mouseover'")).toBe(true);
    expect(src.includes("addEventListener('select-person'")).toBe(true);
});

test('service registry keeps the browser aliases', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public/service-registry.js'), 'utf8');
    expect(src).toContain("window['week-note-services']");
    expect(src).toContain('window.WeekNoteServices');
    expect(src).toContain('week-note-services:ready');
    const body = src.replace(/^import .*$/mg, '').replace(/^export /mg, '');
    expect(() => new Function(body)).not.toThrow();
});

test('the shared manifest includes new-note navigation and preserves fragment titles', () => {
    expect(resolvePageRoute('/editor?date=2099-01-01#draft')).toMatchObject({
        fragment: '/pages/editor.html', shellTitle: 'Nytt notat',
    });
    expect(resolvePageRoute('/notes').fragmentTitle).toBe('Notater · Ukenotater');
    expect(resolvePageRoute('/editor/2099-W01/existing.md').serverShell).toBe(false);
});

test('the running server serves external shell modules and injects request bootstrap data', async ({ request }) => {
    const shell = await request.get('/tasks');
    expect(shell.ok()).toBeTruthy();
    const html = await shell.text();
    expect(html).toContain('window.WN_PAGE_ROUTES=');
    expect(html).toContain('src="/app-shell.js"');
    expect(html).toContain('src="/service-registry.js"');
    for (const file of ['/app-shell.js', '/service-registry.js']) {
        const response = await request.get(file);
        expect(response.ok(), file).toBeTruthy();
        expect(response.headers()['content-type']).toContain('application/javascript');
    }
});

test('SPA navigation preserves query strings and anchors without replacing the shell', async ({ page }) => {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('tasks-page')).toBeVisible();
    const navigated = await page.evaluate(() => {
        window.shellNavigationMarker = 'same document';
        return window.spaNavigate('/editor?date=2099-01-01#draft');
    });
    expect(navigated).toBe(true);
    await expect(page).toHaveURL(/\/editor\?date=2099-01-01#draft$/);
    await expect(page.locator('note-editor')).toBeVisible();
    expect(await page.evaluate(() => window.shellNavigationMarker)).toBe('same document');
    await page.goBack();
    await expect(page.locator('tasks-page')).toBeVisible();
    expect(await page.evaluate(() => window.shellNavigationMarker)).toBe('same document');
});

test('extracted shell still routes entity callout selections', async ({ page }) => {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('tasks-page')).toBeVisible();
    await page.evaluate(() => {
        window.shellNavigationMarker = 'same document';
        document.getElementById('appEntityCallout').dispatchEvent(new CustomEvent('select-person', {
            detail: { key: 'ada' }, bubbles: true, composed: true,
        }));
    });
    await expect(page).toHaveURL(/\/people#p-ada$/);
    await expect(page.locator('people-page')).toBeVisible();
    expect(await page.evaluate(() => window.shellNavigationMarker)).toBe('same document');
});
