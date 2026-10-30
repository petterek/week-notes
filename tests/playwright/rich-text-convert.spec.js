const { test, expect } = require('@playwright/test');

// Inline create markers are converted by <feature-rich-text-area>.convert()
// through injected services; /api/save receives ref markers only.

test('/editor converts task, result and meeting markers before /api/save', async ({ page, request }) => {
    const stamp = Date.now();
    const file = `convert-${stamp}.md`;
    const created = { tasks: [], results: [], meetings: [] };
    let posted = null;
    page.on('request', req => {
        if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/save') {
            const body = req.postDataJSON();
            if (!body.autosave) posted = body;
        }
    });
    try {
        await page.goto('/editor');
        const editor = page.locator('note-editor');
        await editor.locator('.ne-file').fill(file);
        const textarea = editor.locator('feature-rich-text-area textarea');
        await textarea.fill([
            `# Convert ${stamp}`,
            `With @ada`,
            `{{Task ${stamp}}}`,
            `[[Result ${stamp}+]]`,
            `{{m:Meeting ${stamp} @ 2099-01-05 10:00 30m}}`,
        ].join('\n'));
        await editor.locator('.ne-save-close').click();
        await expect.poll(() => posted).toBeTruthy();
        const week = posted.folder;

        const tasks = await (await request.get('/api/tasks')).json();
        const task = tasks.find(t => t.text === `Task ${stamp}`);
        expect(task).toBeTruthy();
        created.tasks.push(task.id);
        expect(task.noteRef).toBe(`${week}/${file}`);

        const results = await (await request.get('/api/results')).json();
        const result = (Array.isArray(results) ? results : results.results).find(r => r.text === `Result ${stamp}`);
        expect(result).toBeTruthy();
        created.results.push(result.id);
        expect(result.sentiment).toBe('good');
        expect(result.people).toContain('ada');

        const meetings = await (await request.get('/api/meetings?week=2099-W02')).json();
        const meeting = meetings.find(m => m.title === `Meeting ${stamp}`);
        expect(meeting).toBeTruthy();
        created.meetings.push(meeting.id);
        expect(meeting).toMatchObject({ date: '2099-01-05', start: '10:00', end: '10:30', noteRef: `${week}/${file}` });
        expect(meeting.attendees).toContain('ada');

        const expected = [
            `# Convert ${stamp}`, 'With @ada', `{{?${task.id}}}`, `[[?${result.id}]]`, `{{m:?${meeting.id}}}`,
        ].join('\n');
        expect(posted.content).toBe(expected);
        const raw = await request.get(`/api/notes/${week}/${encodeURIComponent(file)}/raw`);
        expect(await raw.text()).toBe(expected);
    } finally {
        for (const id of created.tasks) await request.delete(`/api/tasks/${id}`);
        for (const id of created.results) await request.delete(`/api/results/${id}`);
        for (const id of created.meetings) await request.delete(`/api/meetings/${id}`);
    }
});

test('task notes convert markers to text and link results to the task', async ({ page, request }) => {
    const stamp = Date.now();
    const ids = { tasks: [], results: [] };
    try {
        const tasks = await (await request.post('/api/tasks', { data: { text: `Host ${stamp}` } })).json();
        const host = tasks[tasks.length - 1];
        ids.tasks.push(host.id);
        await page.goto('/tasks');
        await page.evaluate(async (task) => {
            await import('/components/task-note.js');
            const el = document.createElement('task-note');
            el.id = 'convert-task-note';
            el.addEventListener('task-note:save', e =>
                window['week-note-services'].tasks_service.update(e.detail.id, { note: e.detail.note }));
            document.body.append(el);
            el.task = task;
        }, host);
        const field = page.locator('#convert-task-note feature-rich-text-area textarea');
        await field.fill(`Plan {{Child ${stamp}}} and [[Won ${stamp}-]] with @ada today`);
        await field.press('Control+Enter');

        const note = `Plan Child ${stamp} and Won ${stamp} with @ada today`;
        await expect.poll(async () => (await (await request.get('/api/tasks')).json())
            .find(t => t.id === host.id)?.note).toBe(note);
        const child = (await (await request.get('/api/tasks')).json()).find(t => t.text === `Child ${stamp}`);
        expect(child).toBeTruthy();
        ids.tasks.push(child.id);
        const results = await (await request.get('/api/results')).json();
        const result = (Array.isArray(results) ? results : results.results).find(r => r.text === `Won ${stamp}`);
        expect(result).toMatchObject({ taskId: host.id, taskText: `Host ${stamp}`, sentiment: 'bad' });
        ids.results.push(result.id);

        // Re-saving the note must not wipe the task-linked result.
        await field.press('Control+Enter');
        await expect.poll(async () => (await (await request.get('/api/results')).json())
            .some(r => r.id === result.id)).toBe(true);
    } finally {
        for (const id of ids.tasks) await request.delete(`/api/tasks/${id}`);
        for (const id of ids.results) await request.delete(`/api/results/${id}`);
    }
});
