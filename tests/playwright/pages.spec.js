// Page-level smoke tests against the real app.
// Verifies routes return 200 and the document contains expected anchors.
const { test, expect } = require('@playwright/test');

const PAGES = [
    { path: '/',         title: /Ukenotater|Hjem/ },
    { path: '/tasks',    title: /Oppgaver/ },
    { path: '/people',   title: /Personer|People/ },
    { path: '/calendar', title: /Kalender/ },
    { path: '/settings', title: /Innstillinger|Settings/ },
    { path: '/goals',    title: /Mål|Goals/ },
    { path: '/results',  title: /Resultater|Results/ },
    { path: '/calendar/all', title: /Kalender|Calendar/ },
    { path: '/debug/help-modal', title: /./ },
];

for (const p of PAGES) {
    test(`page smoke ${p.path}`, async ({ page }) => {
        const resp = await page.goto(p.path, { waitUntil: 'domcontentloaded' });
        expect(resp.ok(), `${p.path} should return 2xx`).toBe(true);
        await expect(page).toHaveTitle(p.title);
    });
}

// Regression: @mentions inside [[result]] markers must render as mention
// chips in the editor preview, not as encoded text in the attribute.
// The <inline-action> component expands @names in its label to <entity-mention>.
test('inline-action renders @mentions in label as entity-mention chips', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Inject a test <inline-action> with a @mention in the label
    await page.evaluate(() => {
        const el = document.createElement('inline-action');
        el.setAttribute('kind', 'result');
        el.setAttribute('label', 'resultat @TestPerson her');
        el.id = 'test-mention-pill';
        document.body.appendChild(el);
    });
    // Wait for custom element to upgrade and render
    await page.waitForTimeout(1000);
    // Check that <entity-mention> appears inside the shadow DOM
    const hasMention = await page.evaluate(() => {
        const el = document.getElementById('test-mention-pill');
        if (!el || !el.shadowRoot) return 'no shadow root';
        const mention = el.shadowRoot.querySelector('entity-mention');
        if (!mention) return 'no entity-mention found, innerHTML: ' + el.shadowRoot.innerHTML.slice(0, 200);
        return mention.getAttribute('key') === 'testperson' ? true : 'wrong key: ' + mention.getAttribute('key');
    });
    expect(hasMention, 'inline-action should render @TestPerson as <entity-mention>').toBe(true);
});
