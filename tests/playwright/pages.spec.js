// Page-level smoke tests against the real app.
// Verifies routes return 200 and the document contains expected anchors.
const { test, expect } = require('@playwright/test');

const PAGES = [
    { path: '/',         title: /Ukenotater|Hjem/ },
    { path: '/tasks',    title: /Oppgaver/ },
    { path: '/people',   title: /Personer|People/ },
    { path: '/calendar', title: /Kalender/ },
    { path: '/settings', title: /Innstillinger|Settings/ },
    { path: '/debug/help-modal', title: /./ },
];

for (const p of PAGES) {
    test(`page smoke ${p.path}`, async ({ page }) => {
        const resp = await page.goto(p.path, { waitUntil: 'domcontentloaded' });
        expect(resp.ok(), `${p.path} should return 2xx`).toBe(true);
        await expect(page).toHaveTitle(p.title);
    });
}
