const { test, expect } = require('@playwright/test');

const markdown = '**bold** :rocket: @ada <b>x</b>';

async function mount(page, tag, props = {}) {
    await page.evaluate(async ({ tag, props }) => {
        await import(`/components/${tag}.js`);
        document.querySelector('#rich-task-test')?.remove();
        const el = document.createElement(tag);
        el.id = 'rich-task-test';
        for (const key of ['tasks', 'people', 'companies', 'teams']) {
            el.setAttribute(`${key}_service`, `week-note-services.${key}_service`);
        }
        document.body.append(el);
        Object.assign(el, props);
    }, { tag, props });
    return page.locator('#rich-task-test');
}

async function storedTask(request, id) {
    const response = await request.get('/api/tasks');
    return (await response.json()).find(t => t.id === id);
}

test('task rich editors preserve create, note save and completion shortcuts', async ({ page, request }) => {
    await page.goto('/tasks');
    let id;
    try {
        const create = await mount(page, 'task-create-full');
        await create.locator('input[data-el="text"]').fill('Rich task regression');
        const editor = create.locator('feature-rich-text-area[data-el="note"]');
        await expect(editor).toHaveAttribute('rows', '3');
        await expect(editor).toHaveAttribute('features', 'lists,emoji,mentions,tasks,results,dates');
        await editor.locator('textarea').fill('@ad');
        await expect(editor.locator('[role="listbox"]')).toBeVisible();
        await expect(editor.locator('[role="listbox"]')).toContainText('Ada');
        await editor.locator('textarea').press('Enter');
        await expect(editor.locator('textarea')).toHaveValue('@ada ');
        await editor.locator('textarea').fill(markdown);
        await editor.locator('textarea').press('Control+Enter');
        await expect.poll(async () => {
            const tasks = await (await request.get('/api/tasks')).json();
            id = tasks.find(t => t.text === 'Rich task regression')?.id;
            return id;
        }).toBeTruthy();
        await expect.poll(async () => (await storedTask(request, id))?.note).toBe(markdown);

        for (const tag of ['task-note-modal', 'task-note']) {
            const note = `${markdown}\n${tag}`;
            const host = await mount(page, tag);
            await host.evaluate((el, id) => {
                const service = window['week-note-services'].tasks_service;
                const task = { id, text: 'Rich task regression', note: 'Existing note' };
                if (el.localName === 'task-note-modal') {
                    el.open(task, res => { if (res.saved) service.update(res.id, { note: res.note }); });
                } else {
                    el.addEventListener('task-note:save', e => service.update(e.detail.id, { note: e.detail.note }));
                    el.task = task;
                }
            }, id);
            const field = host.locator('feature-rich-text-area[data-el="note"]');
            await expect(field).toHaveAttribute('rows', '6');
            await expect(field.locator('textarea')).toHaveValue('Existing note');
            await field.locator('textarea').fill(note);
            await field.locator('textarea').press('Control+Enter');
            await expect.poll(async () => (await storedTask(request, id)).note).toBe(note);
        }

        const list = await mount(page, 'task-open-list');
        const noteDisplay = list.locator(`[data-taskid="${id}"] .row-note-body`);
        await expect(noteDisplay.locator('strong')).toHaveText('bold');
        await expect(noteDisplay).toContainText('🚀');
        await expect(noteDisplay).toContainText('<b>x</b>');
        await expect(noteDisplay.locator('b')).toHaveCount(0);

        const complete = await mount(page, 'task-complete-modal');
        await complete.evaluate((el, id) => {
            el.open({ id, text: 'Rich task regression' }, res => {
                if (res.confirmed) window['week-note-services'].tasks_service.toggle(res.id, res.comment);
            });
        }, id);
        const commentEditor = complete.locator('feature-rich-text-area[data-el="comment"]');
        await expect(commentEditor).toHaveAttribute('features', 'lists,emoji,mentions,results,dates');
        await expect(commentEditor).toHaveAttribute('rows', '4');
        const comment = commentEditor.locator('textarea');
        await comment.focus();
        await comment.press('Tab');
        await expect(complete.locator('button.btn[data-act="cancel"]')).toBeFocused();
        await comment.fill('- first');
        await comment.press('Enter');
        await expect(comment).toHaveValue('- first\n- ');
        await expect(complete).toHaveAttribute('open', '');
        await comment.fill(markdown);
        await comment.press('Control+Enter');
        await expect.poll(async () => (await storedTask(request, id)).done).toBe(true);
        const completed = await storedTask(request, id);
        const [week, file] = completed.commentFile.split('/');
        const saved = await request.get(`/api/notes/${week}/${encodeURIComponent(file)}/raw`);
        expect(await saved.text()).toContain(markdown);
    } finally {
        if (id) await request.delete(`/api/tasks/${id}`);
    }
});

test('task note and completion displays render Markdown, emoji and escaped HTML', async ({ page }) => {
    await page.goto('/tasks');
    await page.route('**/api/notes/2026-W01/rich-comment.md/raw', route => route.fulfill({ contentType: 'text/plain', body: markdown }));
    const task = { id: 'rich-display', text: 'Rich display', done: true, note: markdown, comment: markdown, commentFile: '2026-W01/rich-comment.md' };
    const view = await mount(page, 'task-view', { task });
    for (const selector of ['.note', '.completion-comment', '.comment']) {
        const display = view.locator(selector);
        await expect(display.locator('strong')).toHaveText('bold');
        await expect(display).toContainText('🚀');
        await expect(display).toContainText('<b>x</b>');
        await expect(display.locator('b')).toHaveCount(0);
        await expect(display.locator('entity-mention')).toHaveAttribute('key', 'ada');
    }
    const modal = await mount(page, 'task-view-modal');
    await modal.evaluate((el, task) => el.open(task), task);
    for (const selector of ['.note-body', '.comment-body']) {
        const display = page.locator(`modal-container ${selector}`);
        await expect(display.locator('strong')).toHaveText('bold');
        await expect(display).toContainText('🚀');
        await expect(display).toContainText('<b>x</b>');
        await expect(display.locator('b')).toHaveCount(0);
    }
});

test('task comments append server timestamps without changing notes or completion', async ({ request }) => {
    const tasks = await (await request.post('/api/tasks', { data: { text: 'Comment history' } })).json();
    const id = tasks.at(-1).id;
    let sourceId;
    try {
        await request.put(`/api/tasks/${id}`, { data: { note: 'Keep this note' } });
        const before = Date.now();
        const responses = await Promise.all(['First comment', 'Second comment'].map(text =>
            request.post(`/api/tasks/${id}/comments`, { data: { text, created: '2000-01-01T00:00:00Z' } })));
        for (const response of responses) expect(response.status()).toBe(200);
        const task = await storedTask(request, id);
        expect(task.done).toBe(false);
        expect(task.note).toBe('Keep this note');
        expect(task.completedAt).toBeUndefined();
        expect(task.comments.map(c => c.text).sort()).toEqual(['First comment', 'Second comment']);
        expect(new Set(task.comments.map(c => c.id)).size).toBe(2);
        for (const comment of task.comments) {
            expect(new Date(comment.created).toISOString()).toBe(comment.created);
            expect(Date.parse(comment.created)).toBeGreaterThanOrEqual(before);
            expect(Date.parse(comment.created)).toBeLessThanOrEqual(Date.now());
        }
        await request.put(`/api/tasks/${id}/toggle`, { data: { comment: 'Completion stays separate' } });
        const completed = await storedTask(request, id);
        const appended = await request.post(`/api/tasks/${id}/comments`, { data: { text: 'After completion' } });
        expect(appended.status()).toBe(200);
        const after = await storedTask(request, id);
        expect(after.done).toBe(true);
        expect(after.completedAt).toBe(completed.completedAt);
        expect(after.commentFile).toBe(completed.commentFile);
        expect(after.comments).toHaveLength(3);
        expect(after.comments.slice(0, 2)).toEqual(task.comments);

        sourceId = (await (await request.post('/api/tasks', { data: { text: 'Merged comments' } })).json()).at(-1).id;
        await request.post(`/api/tasks/${sourceId}/comments`, { data: { text: 'From source task' } });
        expect((await request.post('/api/tasks/merge', { data: { srcId: sourceId, tgtId: id } })).ok()).toBe(true);
        expect((await storedTask(request, id)).comments.map(c => c.text)).toContain('From source task');
    } finally {
        if (sourceId) await request.delete(`/api/tasks/${sourceId}`);
        await request.delete(`/api/tasks/${id}`);
    }
});

test('invalid task comments fail explicitly without changing task history', async ({ request }) => {
    const id = (await (await request.post('/api/tasks', { data: { text: 'Comment validation' } })).json()).at(-1).id;
    try {
        const original = await storedTask(request, id);
        for (const data of [{ text: ' \n ' }, { text: 123 }, {}, null, []]) {
            const response = await request.post(`/api/tasks/${id}/comments`, { data: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
            expect(response.status()).toBe(400);
            expect((await response.json()).error).toBeTruthy();
        }
        const malformed = await request.post(`/api/tasks/${id}/comments`, { data: '{', headers: { 'Content-Type': 'application/json' } });
        expect(malformed.status()).toBe(400);
        expect(await storedTask(request, id)).toEqual(original);
        expect((await request.post('/api/tasks/missing-comment-task/comments', { data: { text: 'Missing' } })).status()).toBe(404);
        await request.delete(`/api/tasks/${id}`);
        expect((await request.post(`/api/tasks/${id}/comments`, { data: { text: 'Deleted' } })).status()).toBe(404);
    } finally {
        await request.delete(`/api/tasks/${id}`);
    }
});

test('task details save timestamped rich comments, retain drafts on errors and update cached views', async ({ page, request }) => {
    const id = (await (await request.post('/api/tasks', { data: { text: 'Comment UI history' } })).json()).at(-1).id;
    try {
        await page.goto('/tasks');
        const row = page.locator(`tasks-page tr[data-taskid="${id}"]`);
        await row.locator('[data-act="view"]').click();
        const modal = page.locator('modal-container[open]').filter({ has: page.locator('task-comments') });
        const comments = modal.locator('task-comments');
        const input = comments.locator('feature-rich-text-area textarea');
        await input.pressSequentially('Comment keeps the editor open');
        await expect(modal).toBeVisible();
        await input.fill(markdown);
        await page.route(`**/api/tasks/${id}/comments`, route => route.fulfill({
            status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Comment storage unavailable' }),
        }));
        await comments.getByRole('button', { name: 'Legg til kommentar' }).click();
        await expect(comments.getByRole('alert')).toContainText('Comment storage unavailable');
        await expect(input).toHaveValue(markdown);
        await page.unroute(`**/api/tasks/${id}/comments`);
        await input.press('Control+Enter');
        const entry = comments.locator('.comment-entry');
        await expect(entry).toHaveCount(1);
        await expect(entry.locator('strong')).toHaveText('bold');
        await expect(entry).toContainText('🚀');
        await expect(entry).toContainText('<b>x</b>');
        await expect(entry.locator('b')).toHaveCount(0);
        await expect(entry.locator('entity-mention')).toHaveAttribute('key', 'ada');
        const saved = await storedTask(request, id);
        await expect(entry.locator('time')).toHaveAttribute('datetime', saved.comments[0].created);
        await expect(entry.locator('time')).toHaveText(/\d{2}\.\d{2}\.\d{4}.*\d{2}:\d{2}/);
        await expect(input).toHaveValue('');
        expect(saved.done).toBe(false);
        await modal.evaluate(el => el.close());
        await row.locator('[data-act="view"]').click();
        await expect(comments.locator('.comment-entry')).toHaveCount(1);
        await input.fill('Another comment');
        await comments.getByRole('button', { name: 'Legg til kommentar' }).click();
        await expect(comments.locator('.comment-entry')).toHaveCount(2);
        await modal.evaluate(el => el.close());
        await page.reload();
        await row.locator('[data-act="view"]').click();
        await expect(comments.locator('.comment-entry')).toHaveCount(2);
        await modal.evaluate(el => el.close());

        const view = await mount(page, 'task-view', { task: await storedTask(request, id) });
        await expect(view.locator('task-comments .comment-entry')).toHaveCount(2);
        await view.locator('task-comments textarea').fill('From the shared task view');
        await view.locator('task-comments').getByRole('button', { name: 'Legg til kommentar' }).click();
        await expect(view.locator('task-comments .comment-entry')).toHaveCount(3);
    } finally {
        await request.delete(`/api/tasks/${id}`);
    }
});

test('home and embedded series task lists retain comments when reopening cached details', async ({ page, request }) => {
    const id = (await (await request.post('/api/tasks', {
        data: { text: 'Shared comment views', meetingSeriesId: 'comment-series' },
    })).json()).at(-1).id;
    try {
        await page.goto('/');
        const list = page.locator('task-open-list').first();
        const title = list.locator(`[data-act="view"][data-taskid="${id}"]`);
        await title.click();
        let modal = page.locator('modal-container[open]').filter({ has: page.locator('task-comments') });
        await modal.locator('task-comments textarea').fill('From home');
        await modal.locator('task-comments').getByRole('button', { name: 'Legg til kommentar' }).click();
        await expect(modal.locator('.comment-entry')).toHaveCount(1);
        await modal.evaluate(el => el.close());
        await title.click();
        await expect(modal.locator('.comment-entry')).toHaveCount(1);
        await modal.evaluate(el => el.close());

        const task = await storedTask(request, id);
        await page.evaluate(async task => {
            await import('/components/tasks-page.js');
            const embedded = document.createElement('tasks-page');
            embedded.id = 'comment-series-tasks';
            embedded.setAttribute('embedded', '');
            embedded.setAttribute('meeting-series-id', task.meetingSeriesId);
            embedded.setAttribute('tasks_service', 'week-note-services.tasks_service');
            embedded.addEventListener('tasks:changed', e => { window.commentSeriesTasks = e.detail.tasks; });
            document.body.prepend(embedded);
            embedded.setData({ tasks: [task], people: [], companies: [], goals: [] });
        }, task);
        const embedded = page.locator('#comment-series-tasks');
        await embedded.locator(`[data-act="view"][data-taskid="${id}"]`).click();
        modal = page.locator('modal-container[open]').filter({ has: page.locator('task-comments') });
        await modal.locator('task-comments textarea').fill('From the meeting series');
        await modal.locator('task-comments').getByRole('button', { name: 'Legg til kommentar' }).click();
        await expect(modal.locator('.comment-entry')).toHaveCount(2);
        await expect.poll(() => page.evaluate(id => window.commentSeriesTasks?.find(t => t.id === id)?.comments.length, id)).toBe(2);
        await modal.evaluate(el => el.close());
        await embedded.locator(`[data-act="view"][data-taskid="${id}"]`).click();
        await expect(modal.locator('.comment-entry')).toHaveCount(2);
    } finally {
        await request.delete(`/api/tasks/${id}`);
    }
});
