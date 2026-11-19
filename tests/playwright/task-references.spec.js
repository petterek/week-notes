const { test, expect } = require('@playwright/test');
const { createCleanupStack } = require('../helpers/playwright-fixtures');

test('task details separate derived origin from live mentions across supported content', async ({ page, request }) => {
    const cleanup = createCleanupStack();
    const contextId = (await (await request.get('/api/contexts')).json()).active;
    async function create(url, data, field) {
        const response = await request.post(url, { data });
        expect(response.ok(), url).toBe(true);
        const body = await response.json();
        const record = field ? body[field] : Array.isArray(body) ? body.at(-1) : body;
        cleanup.add(() => request.delete(`${url}/${url === '/api/teams' ? record.key : record.id}`));
        return record;
    }
    async function saveNote(file, content) {
        const response = await request.post('/api/save', {
            data: { folder: '2099-W24', file, content },
        });
        expect(response.ok()).toBe(true);
    }
    try {
        const target = await create('/api/tasks', { text: 'Task with backlinks', noteRef: '2099-W24/origin.md' });
        const marker = `{{?${target.id}}}`;
        const closedMarker = `{{!${target.id}}}`;
        for (const [file, content] of [
            ['origin.md', 'Origin without any task marker'],
            ['mentions.md', `Repeated ${marker} and ${closedMarker}`],
            ['unrelated.md', `Plain ${target.id} and {{?${target.id}extra}}`],
        ]) {
            await saveNote(file, content);
            cleanup.add(() => request.delete(`/api/notes/${contextId}/2099-W24/${file}`));
        }
        await request.put(`/api/tasks/${target.id}`, { data: { note: marker } });
        const source = await create('/api/tasks', { text: 'Referencing task' });
        await request.put(`/api/tasks/${source.id}`, { data: { note: marker } });
        await request.post(`/api/tasks/${source.id}/comments`, { data: { text: closedMarker } });
        await create('/api/goals', { title: '<b>Referenced goal</b>', description: marker }, 'goal');
        await create('/api/results', { text: `Result ${marker}` }, 'result');
        await create('/api/people', { firstName: 'BacklinkPerson', notes: marker }, 'person');
        const company = await create('/api/companies', { name: 'BacklinkCompany', notes: marker }, 'company');
        await create('/api/places', { name: 'BacklinkPlace', notes: marker }, 'place');
        await create('/api/teams', { name: 'BacklinkTeam', notes: marker });
        const series = await create('/api/meeting-series', { title: 'Backlink series', description: marker }, 'series');
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Backlink agenda' },
        })).json()).item;
        const occurrence = await create('/api/meetings', { seriesId: series.id, date: '2099-06-05', notes: marker }, 'meeting');
        await request.put(`/api/meetings/${occurrence.id}`, { data: { minutes: closedMarker } });
        await request.put(`/api/meetings/${occurrence.id}/agenda/${item.id}`, { data: { notes: marker } });

        const endpoint = `/api/tasks/${target.id}/references`;
        const response = await request.get(endpoint);
        expect(response.status()).toBe(200);
        const refs = await response.json();
        expect(refs.origin).toMatchObject({
            kind: 'note', id: '2099-W24/origin.md', href: '/2099-W24/origin.md',
        });
        expect(refs.mentions.map(m => m.kind).sort()).toEqual([
            'company', 'goal', 'meeting', 'meeting-series', 'note', 'person', 'place', 'result', 'task', 'team',
        ]);
        expect(refs.mentions.filter(m => m.kind === 'note')).toEqual([
            expect.objectContaining({ id: '2099-W24/mentions.md', href: '/2099-W24/mentions.md' }),
        ]);
        expect(refs.mentions.find(m => m.kind === 'task')).toMatchObject({ id: source.id, href: `/tasks#t-${source.id}` });
        expect(refs.mentions.find(m => m.kind === 'meeting')).toMatchObject({ href: `/meeting-occurrence/${occurrence.id}` });

        await page.goto('/tasks');
        await page.locator('tasks-page [data-tab="done"]').click();
        await page.locator(`tasks-page tr[data-taskid="${target.id}"] .task-title`).click();
        const dialogRefs = page.locator('body > modal-container[open] task-references');
        await expect(dialogRefs.locator('[data-origin] [data-note-preview]')).toHaveAttribute('href', '/2099-W24/origin.md');
        await expect(dialogRefs.getByRole('heading', { name: 'Omtalt i' })).toBeVisible();
        await expect(dialogRefs.locator('li')).toHaveCount(10);
        await expect(dialogRefs.locator('b')).toHaveCount(0);
        await expect(dialogRefs).toContainText('<b>Referenced goal</b>');
        await dialogRefs.getByRole('link', { name: 'Oppgave: Referencing task', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/tasks#t-${source.id}$`));
        await expect(page.locator('body > modal-container[open]')).toHaveCount(1);
        await expect(page.locator('body > modal-container[open] [slot="title"]')).toContainText('Referencing task');
        await page.keyboard.press('Escape');

        await page.evaluate(async task => {
            await import('/components/task-view.js');
            window.openTaskViewModal(task);
        }, target);
        const standaloneRefs = page.locator('#page-task-view task-references');
        await expect(standaloneRefs.locator('li')).toHaveCount(10);
        await page.keyboard.press('Escape');

        await saveNote('mentions.md', 'Reference removed');
        await request.delete(`/api/companies/${company.id}`);
        const updated = await (await request.get(endpoint)).json();
        expect(updated.mentions.map(m => m.kind)).not.toContain('note');
        expect(updated.mentions.map(m => m.kind)).not.toContain('company');
        expect(updated.origin.id).toBe('2099-W24/origin.md');
        expect((await (await request.get('/api/tasks')).json()).find(t => t.id === target.id).noteRef)
            .toBe('2099-W24/origin.md');
        expect((await request.get('/api/tasks/no-such-task/references')).status()).toBe(404);
    } finally {
        await cleanup.run();
    }
});

test('task reference errors are visible and retry preserves a comment draft', async ({ page, request }) => {
    const task = (await (await request.post('/api/tasks', { data: { text: 'Reference retry task' } })).json()).at(-1);
    try {
        await page.route(`**/api/tasks/${task.id}/references`, route => route.fulfill({
            status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Reference storage unavailable' }),
        }));
        await page.goto('/tasks');
        await page.locator(`tasks-page tr[data-taskid="${task.id}"] .task-title`).click();
        const modal = page.locator('body > modal-container[open]');
        const references = modal.locator('task-references');
        await expect(references.getByRole('alert')).toContainText('Reference storage unavailable');
        const draft = modal.locator('task-comments textarea');
        await draft.fill('Keep this unfinished comment');
        await page.unroute(`**/api/tasks/${task.id}/references`);
        await references.getByRole('button', { name: 'Prøv igjen' }).click();
        await expect(references).toContainText('Ingen omtaler funnet.');
        await expect(draft).toHaveValue('Keep this unfinished comment');
    } finally {
        await request.delete(`/api/tasks/${task.id}`);
    }
});

test('note sources and backlinks offer preview and edit links, including encoded filenames', async ({ page, request }) => {
    const cleanup = createCleanupStack();
    const contextId = (await (await request.get('/api/contexts')).json()).active;
    const week = '2099-W25';
    const sourceFile = 'source note & planning.md';
    const mentionFile = 'mention note.md';
    const task = (await (await request.post('/api/tasks', {
        data: { text: 'Task with working note links', noteRef: `${week}/${sourceFile}` },
    })).json()).at(-1);
    cleanup.add(() => request.delete(`/api/tasks/${task.id}`));
    try {
        for (const [file, content] of [
            [sourceFile, '# Original source note'],
            [mentionFile, `# Note mentioning task\n\n{{?${task.id}}}`],
        ]) {
            const saved = await request.post('/api/save', { data: { folder: week, file, content } });
            expect(saved.ok()).toBe(true);
            cleanup.add(() => request.delete(`/api/notes/${contextId}/${week}/${encodeURIComponent(file)}`));
        }
        await page.goto('/tasks');
        const source = page.locator(`tasks-page .tp-source-heading[data-source="note:${week}/${sourceFile}"]`);
        const preview = source.getByRole('link', { name: /Forhåndsvis/ });
        const edit = source.getByRole('link', { name: /Rediger/ });
        await expect(preview).toBeVisible();
        await expect(edit).toBeVisible();
        const href = await preview.getAttribute('href');
        expect((await request.get(href)).status(), 'Source link must resolve to a saved note').toBe(200);
        await preview.click();
        const notePreview = page.locator('note-view[data-search-modal]');
        await expect(notePreview.locator('.nv-body h1')).toHaveText('Original source note');
        await expect(page).toHaveURL(/\/tasks$/);
        await notePreview.locator('[data-action="close"]').click();
        await edit.click();
        await expect(page).toHaveURL(`/editor/${week}/${encodeURIComponent(sourceFile)}`);
        await expect(page.locator('note-editor feature-rich-text-area textarea')).toHaveValue('# Original source note');

        await page.goto('/tasks');
        await page.locator(`tasks-page tr[data-taskid="${task.id}"] .task-title`).click();
        const refs = page.locator('body > modal-container[open] task-references');
        await expect(refs.locator('[data-origin]').getByRole('link')).toHaveCount(2);
        const backlink = refs.locator('li').filter({ hasText: `Notat: mention note (${week})` });
        await expect(backlink.getByRole('link')).toHaveCount(2);
        expect((await request.get(await backlink.getByRole('link', { name: /Forhåndsvis/ }).getAttribute('href'))).status()).toBe(200);
        await backlink.getByRole('link', { name: /Forhåndsvis/ }).click();
        await expect(notePreview.locator('.nv-body h1')).toHaveText('Note mentioning task');
        await expect(page).toHaveURL(/\/tasks$/);
        await expect(page.locator('body > modal-container[open]')).toHaveCount(0);
        await notePreview.locator('[data-action="close"]').click();
        await page.locator(`tasks-page tr[data-taskid="${task.id}"] .task-title`).click();
        await backlink.getByRole('link', { name: /Rediger/ }).click();
        await expect(page).toHaveURL(`/editor/${week}/${encodeURIComponent(mentionFile)}`);
        await expect(page.locator('note-editor feature-rich-text-area textarea')).toHaveValue(`# Note mentioning task\n\n{{?${task.id}}}`);
    } finally {
        await cleanup.run();
    }
});
