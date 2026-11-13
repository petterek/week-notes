const { test, expect } = require('@playwright/test');
const { createCleanupStack } = require('../helpers/playwright-fixtures');

const NOTES = '**Rich notes** :rocket: @ada @testteam\n\n<b>literal</b> \"quoted\" & safe\n\n- first\n- second';
const CASES = [
    { kind: 'person', tab: 'people', collection: 'people', nameField: 'firstName', card: 'person-card', rows: '3' },
    { kind: 'company', tab: 'companies', collection: 'companies', nameField: 'name', card: 'company-card', rows: '3' },
    { kind: 'team', tab: 'teams', collection: 'teams', nameField: 'name', card: '.team-card', rows: '2' },
    { kind: 'place', tab: 'places', collection: 'places', nameField: 'name', card: 'place-card', rows: '2' },
];

test('person modal shows details and references and edits without reloading data', async ({ page, request }) => {
    const cleanup = createCleanupStack();
    async function create(collection, field, data) {
        const response = await request.post(`/api/${collection}`, { data });
        expect(response.ok()).toBe(true);
        const body = await response.json();
        const record = collection === 'tasks' ? body.find(task => task.text === data.text) : body[field];
        expect(record).toBeDefined();
        cleanup.add(async () => {
            expect((await request.delete(`/api/${collection}/${record.id}`)).ok()).toBe(true);
        });
        return record;
    }
    try {
        const company = await create('companies', 'company', { name: `Profile company ${Date.now()}` });
        const person = await create('people', 'person', {
            firstName: `Profile${Date.now()}`, lastName: 'Person', title: 'Test contact',
            email: 'profile@example.test', phone: '12345678',
            notes: '**Profile notes** @ada\n\n<b>literal</b>',
            primaryCompanyKey: company.key,
        });
        const task = await create('tasks', 'task', { text: `Profile task @${person.key}`, week: '2099-W01' });
        const meeting = await create('meetings', 'meeting', {
            title: 'Profile meeting', date: '2099-01-02', start: '09:00', end: '09:30', attendees: [person.key],
        });
        const result = await create('results', 'result', { text: 'Profile result', people: [person.key], week: '2099-W01' });
        const search = await request.get(`/api/search?q=${encodeURIComponent(person.firstName)}`);
        expect(search.ok()).toBe(true);
        expect(await search.json()).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'person', identifier: person.key, href: `/person/${person.key}` }),
        ]));
        const response = await page.goto('/people');
        expect(response.status()).toBe(200);
        await page.locator(`person-card[data-key="${person.key}"] a.person-name`).click();
        const personModal = page.locator('#personViewModal[open]');
        const profile = personModal.locator('people-page[standalone]');
        const card = profile.locator('person-card');
        await expect(card).toHaveCount(1);
        await expect(profile.getByRole('heading', { level: 1 })).toContainText(`${person.firstName} Person`);
        await expect(profile.locator('[role="tablist"]')).toHaveCount(0);
        await expect(card.getByRole('link', { name: person.email })).toBeVisible();
        await expect(card.locator('.person-contact')).toContainText(person.phone);
        await expect(card.locator('.person-notes strong')).toHaveText('Profile notes');
        await expect(card.locator('.person-notes')).toContainText('<b>literal</b>');
        await expect(card.locator('.person-notes b')).toHaveCount(0);
        for (const [kind, record] of [['task', task], ['meeting', meeting], ['result', result]]) {
            await expect(card.locator(`[data-ref="${kind}"][data-id="${record.id}"]`)).toBeVisible();
        }

        const reloads = [];
        page.on('request', req => {
            if (req.method() === 'GET' && /\/api\/(people|companies|places|teams|tasks|meetings|results)(\?|$)/.test(req.url())) {
                reloads.push(req.url());
            }
        });
        await card.locator('[data-act="edit"]').click();
        const modal = profile.locator('.pp-modal.open');
        await modal.locator('[data-f="lastName"]').fill('Updated');
        await modal.locator('[data-f="email"]').fill('updated@example.test');
        const saved = page.waitForResponse(r => r.url().endsWith(`/api/people/${person.id}`) && r.request().method() === 'PUT');
        await modal.locator('[data-act="save-person"]').click();
        expect((await saved).ok()).toBe(true);
        await expect(profile.getByRole('heading', { level: 1 })).toContainText(`${person.firstName} Updated`);
        await expect(card.getByRole('link', { name: 'updated@example.test' })).toBeVisible();
        expect(reloads).toEqual([]);

        await card.locator('[data-act="edit"]').click();
        await expect(profile.locator('.pp-modal.open')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(profile.locator('.pp-modal.open')).toHaveCount(0);
        await expect(personModal).toBeVisible();
        await personModal.locator('button.close').click();
        await expect(page.locator('#personViewModal')).toHaveCount(0);
        const directoryCard = page.locator(`person-card[data-key="${person.key}"]`);
        await expect(directoryCard.locator('.person-name')).toHaveText(`${person.firstName} Updated`);
        await directoryCard.locator('a.person-name').click();
        await card.locator('.company-chip.primary').click();
        await expect(page).toHaveURL(new RegExp(`/people#tab=companies&key=${company.key}$`));
        const companyCard = page.locator(`company-card[data-key="${company.key}"]`);
        await companyCard.locator(`[data-ref="person"][data-id="${person.key}"]`).click();
        await expect(personModal).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/people#tab=companies&key=${company.key}$`));
        await profile.locator('entity-mention[key="ada"] .chip').click();
        await expect(page.locator('#personViewModal')).toHaveCount(1);
        await expect(profile.getByRole('heading', { level: 1 })).toContainText('Ada Test');
        await page.evaluate(key => document.dispatchEvent(new CustomEvent('element-selected', {
            detail: { type: 'person', identifier: key },
        })), person.key);
        await expect(profile.getByRole('heading', { level: 1 })).toContainText(`${person.firstName} Updated`);
        reloads.length = 0;
        await card.locator('[data-act="edit"]').click();
        page.once('dialog', dialog => dialog.accept());
        await profile.locator('[data-act="delete-person"]').click();
        await expect(profile.getByRole('heading', { level: 1 })).toHaveText('Person ikke funnet');
        await personModal.locator('button.close').click();
        await expect(companyCard.locator(`[data-ref="person"][data-id="${person.key}"]`)).toHaveCount(0);
        expect(reloads).toEqual([]);
    } finally {
        await cleanup.run();
    }
});

test('person name links open a modal without navigation and restore focus on close', async ({ page }) => {
    await page.goto('/people#tab=people');
    const title = await page.title();
    await page.evaluate(() => { window.personNavigationMarker = 'same document'; });
    const link = page.locator('person-card[data-key="ada"]').getByRole('link', { name: 'Ada Test', exact: true });
    await expect(link).toHaveAttribute('href', '/person/ada');
    await link.press('Enter');
    await expect(page).toHaveURL(/\/people#tab=people$/);
    await expect(page.locator('#personViewModal[open] person-card')).toHaveCount(1);
    await expect(page).toHaveTitle(title);
    expect(await page.evaluate(() => window.personNavigationMarker)).toBe('same document');
    await page.keyboard.press('Escape');
    await expect(page.locator('#personViewModal')).toHaveCount(0);
    await expect(link).toBeFocused();
    await expect(page.locator('people-page:not([standalone])')).toBeVisible();
    expect(await page.evaluate(() => window.personNavigationMarker)).toBe('same document');
    const newTab = page.context().waitForEvent('page');
    await link.click({ modifiers: ['Control'] });
    const direct = await newTab;
    await expect(direct).toHaveURL(/\/person\/ada$/);
    await expect(direct.locator('people-page[standalone]')).toBeVisible();
    await direct.close();
    await expect(page.locator('#personViewModal')).toHaveCount(0);
});

test('standalone person handles encoded keys and missing or deleted people', async ({ page, request }) => {
    expect((await page.goto('/person/per%20j%C3%B8rgen')).status()).toBe(200);
    const profile = page.locator('people-page[standalone]');
    await expect(profile.getByRole('heading', { level: 1 })).toContainText('Per Jørgen');
    await page.goto('/team/testteam');
    const member = page.locator('team-status-page').getByRole('link', { name: /Per Jørgen/ });
    await expect(member).toHaveAttribute('href', '/person/per%20j%C3%B8rgen');
    await member.click();
    await expect(page).toHaveURL(/\/team\/testteam$/);
    await expect(profile.getByRole('heading', { level: 1 })).toContainText('Per Jørgen');
    await page.goto('/person/no-such-person');
    await expect(profile.getByRole('heading', { level: 1 })).toHaveText('Person ikke funnet');
    await expect(profile.locator('person-card')).toHaveCount(0);
    const created = await request.post('/api/people', { data: { firstName: `DeletedProfile${Date.now()}` } });
    expect(created.ok()).toBe(true);
    const { person } = await created.json();
    expect((await request.delete(`/api/people/${person.id}`)).ok()).toBe(true);
    await page.goto(`/person/${person.key}`);
    await expect(profile.getByRole('heading', { level: 1 })).toHaveText('Person ikke funnet');
});

test('standalone person reports loading failures and can retry', async ({ page }) => {
    await page.route('**/api/people', route => route.fulfill({
        status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test unavailable' }),
    }));
    await page.goto('/person/ada');
    const profile = page.locator('people-page[standalone]');
    await expect(profile.getByRole('alert')).toContainText('Kunne ikke laste');
    await expect(profile.locator('person-card')).toHaveCount(0);
    await page.unroute('**/api/people');
    await profile.getByRole('button', { name: 'Prøv igjen' }).click();
    await expect(profile.getByRole('heading', { level: 1 })).toContainText('Ada Test');
    await expect(profile.locator('person-card .person-details')).toBeVisible();
});

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
