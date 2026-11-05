const { test, expect } = require('@playwright/test');

const NOTES = '**Rich notes** :rocket: @ada @testteam\n\n<b>literal</b> \"quoted\" & safe\n\n- first\n- second';
const CASES = [
    { kind: 'person', tab: 'people', collection: 'people', nameField: 'firstName', card: 'person-card', rows: '3' },
    { kind: 'company', tab: 'companies', collection: 'companies', nameField: 'name', card: 'company-card', rows: '3' },
    { kind: 'team', tab: 'teams', collection: 'teams', nameField: 'name', card: '.team-card', rows: '2' },
    { kind: 'place', tab: 'places', collection: 'places', nameField: 'name', card: 'place-card', rows: '2' },
];

for (const item of CASES) {
    test(`rich-text people ${item.kind}: edit, persist and safely render notes`, async ({ page, request }) => {
        const name = `Rich ${item.kind} ${Date.now()}`;
        let saved;
        try {
            // Maps are unrelated to notes; exercise the supported unavailable-map path.
            await page.route('https://unpkg.com/leaflet@*/**', route => route.abort());
            await page.goto(`/people#tab=${item.tab}`);
            const directory = page.locator('people-page');
            await directory.locator(`[data-act="new-${item.kind}"]`).click();
            const modal = item.kind === 'place'
                ? page.locator('.wn-people-place-modal-host')
                : directory.locator('.pp-modal.open');
            await modal.locator(`[data-f="${item.nameField}"]`).fill(name);
            const editor = modal.locator('feature-rich-text-area[data-f="notes"]');
            await expect(editor).toHaveAttribute('rows', item.rows);
            await expect(editor).toHaveAttribute('features', 'lists,emoji,mentions,dates');
            for (const service of ['people', 'companies', 'teams']) {
                await expect(editor).toHaveAttribute(`${service}_service`, `week-note-services.${service}_service`);
            }
            await editor.locator('textarea').fill(NOTES);
            const response = page.waitForResponse(r => r.url().endsWith(`/api/${item.collection}`) && r.request().method() === 'POST');
            await modal.locator(`[data-act="${item.kind === 'place' ? 'save' : `save-${item.kind}`}"]`).click();
            expect((await response).ok()).toBe(true);
            const records = await (await request.get(`/api/${item.collection}`)).json();
            saved = records.find(record => record.firstName === name || record.name === name);
            expect(saved.notes).toBe(NOTES);

            await page.goto(`/people#tab=${item.tab}${item.kind === 'team' ? '' : `&key=${encodeURIComponent(saved.key)}`}`);
            if (item.kind === 'team') {
                await directory.locator(`[data-team-key="${saved.key}"] .team-header`).click();
            }
            const card = directory.locator(item.kind === 'team'
                ? `[data-team-key="${saved.key}"]`
                : `${item.card}[data-key="${saved.key}"]`);
            const notes = card.locator('.rich-text');
            await expect(notes.locator('strong')).toHaveText('Rich notes');
            await expect(notes).toContainText('🚀');
            await expect(notes).toContainText('<b>literal</b>');
            await expect(notes.locator('b')).toHaveCount(0);
            await expect(notes.locator('li')).toHaveCount(2);
            await expect(notes.locator('entity-mention[key="ada"]')).toHaveCount(1);
            await expect(notes.locator('entity-mention[kind="team"][key="testteam"]')).toHaveCount(1);

            await card.locator(`[data-act="${item.kind === 'team' ? 'edit-team' : 'edit'}"]`).click();
            await expect(modal.locator('feature-rich-text-area[data-f="notes"]')).toHaveJSProperty('value', NOTES);
        } finally {
            if (saved) await request.delete(`/api/${item.collection}/${saved.id}`);
        }
    });
}


test('rich-text people entity callouts render safe notes without formatting names or addresses', async ({ page }) => {
    await page.goto('/people');
    await page.evaluate(async () => {
        await import('/components/entity-callout.js');
        for (const kind of ['person', 'company', 'place']) {
            const callout = document.createElement('entity-callout');
            callout.id = `rich-callout-${kind}`;
            document.body.appendChild(callout);
            callout.setData({ kind, entity: {
                name: '**Plain name**', address: '**Plain address**',
                notes: '**Rich notes** :rocket: @ada\n\n<b>literal</b>',
            }, people: [{ key: 'ada', name: 'Ada Test' }] });
        }
    });
    for (const kind of ['person', 'company', 'place']) {
        const callout = page.locator(`#rich-callout-${kind}`);
        const notes = callout.locator('.rich-text');
        await expect(notes.locator('strong')).toHaveText('Rich notes');
        await expect(notes).toContainText('🚀');
        await expect(notes).toContainText('<b>literal</b>');
        await expect(notes.locator('b')).toHaveCount(0);
        await expect(notes.locator('entity-mention[key="ada"]')).toHaveCount(1);
        await expect(callout.locator('.ec-name')).toContainText('**Plain name**');
        await expect(callout.locator('.ec-name strong')).toHaveCount(0);
    }
});
