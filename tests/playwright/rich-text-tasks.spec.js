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
