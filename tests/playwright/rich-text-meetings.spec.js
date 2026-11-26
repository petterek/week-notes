const { test, expect } = require('@playwright/test');

const meetingList = async request => (await (await request.get('/api/meetings')).json());

test('meeting notes rich editors stay form-associated and save create/edit values', async ({ page, request }) => {
    const title = `Rich meeting notes ${Date.now()}`;
    const createdNotes = '**Original invitation** :rocket: <b>text</b>';
    const updatedNotes = '**Updated agenda** :rocket: <b>text</b>';
    let meeting;
    try {
        await page.goto('/calendar');
        const calendar = page.locator('week-notes-calendar');
        await calendar.locator('[data-new]').click();
        const create = calendar.locator('meeting-create');
        const createNotes = create.locator('feature-rich-text-area[name="notes"]');
        await expect(createNotes).toBeVisible();
        await expect(createNotes).toHaveAttribute('features', 'lists,emoji,mentions,dates');
        await create.locator('input[name="title"]').fill(title);
        await createNotes.locator('textarea').fill(createdNotes);
        await create.locator('[data-form] button[type="submit"]').click();
        await expect.poll(async () => (await meetingList(request)).find(m => m.title === title)?.notes).toBe(createdNotes);
        meeting = (await meetingList(request)).find(m => m.title === title);

        await page.reload();
        const loadedCalendar = page.locator('week-notes-calendar');
        await expect.poll(() => loadedCalendar.evaluate((el, id) => !!el._meetingsById?.[id], meeting.id)).toBe(true);
        await loadedCalendar.evaluate((el, id) => el._openEdit(id), meeting.id);
        const edit = loadedCalendar.locator('meeting-edit');
        const editNotes = edit.locator('feature-rich-text-area[name="notes"]');
        await expect.poll(() => editNotes.evaluate(el => el.value)).toBe(createdNotes);
        await expect(editNotes).toHaveAttribute('features', 'lists,emoji,mentions,dates');
        await edit.locator('[data-form] button[type="submit"]').click();
        await expect.poll(async () => (await (await request.get(`/api/meetings/${meeting.id}`)).json()).notes).toBe(createdNotes);
        await expect.poll(() => loadedCalendar.evaluate((el, id) => el._meetingsById?.[id]?.notes, meeting.id)).toBe(createdNotes);

        await loadedCalendar.evaluate((el, id) => el._openEdit(id), meeting.id);
        const reopenedEdit = loadedCalendar.locator('meeting-edit');
        const reopenedNotes = reopenedEdit.locator('feature-rich-text-area[name="notes"]');
        await reopenedNotes.locator('textarea').fill(updatedNotes);
        await reopenedEdit.locator('[data-form] button[type="submit"]').click();
        await expect.poll(async () => (await (await request.get(`/api/meetings/${meeting.id}`)).json()).notes).toBe(updatedNotes);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
    }
});

test('meeting-series description saves and renders Markdown, emoji, and escaped HTML', async ({ page, request }) => {
    const description = '**Weekly sync** :rocket: <b>literal</b>';
    const updated = '**Updated sync** :rocket: <b>literal</b>';
    const response = await request.post('/api/meeting-series', {
        data: { title: `Rich series ${Date.now()}`, description },
    });
    const series = (await response.json()).series;
    try {
        await page.goto(`/meeting-series#ms-${series.id}`);
        const host = page.locator('meeting-series-page');
        const display = host.locator('.mp-desc');
        await expect(display.locator('strong')).toHaveText('Weekly sync');
        await expect(display).toContainText('🚀');
        await expect(display).toContainText('<b>literal</b>');
        await expect(display.locator('b')).toHaveCount(0);

        await host.locator('.mp-edit').click();
        const editor = host.locator('#mspModalDesc');
        await expect(editor).toHaveAttribute('features', 'lists,emoji,mentions');
        await editor.locator('textarea').fill(updated);
        await host.locator('[data-act="save-series"]').click();
        await expect.poll(async () => (await (await request.get(`/api/meeting-series/${series.id}`)).json()).description).toBe(updated);
        await expect(host.locator('.mp-desc strong')).toHaveText('Updated sync');
        await expect(host.locator('.mp-desc')).toContainText('🚀');
        await expect(host.locator('.mp-desc')).toContainText('<b>literal</b>');
        await expect(host.locator('.mp-desc b')).toHaveCount(0);
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('occurrence rich-text editors save minutes and render previous agenda notes safely', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: `Rich occurrence ${Date.now()}` },
    })).json()).series;
    let previousMeeting;
    let currentMeeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Review topic' },
        })).json()).item;
        previousMeeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-03' },
        })).json()).meeting;
        const agendaNotes = '**Waiting** :rocket: <b>vendor</b>';
        await request.put(`/api/meetings/${previousMeeting.id}/agenda/${item.id}`, { data: { notes: agendaNotes } });
        currentMeeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.post(`/api/meetings/${currentMeeting.id}/start`);
        await page.goto(`/meeting-occurrence/${currentMeeting.id}`);

        const host = page.locator('meeting-occurrence-page');
        const currentNotes = host.locator(`feature-rich-text-area[data-agenda="${item.id}"]`);
        await expect(currentNotes).toHaveAttribute('features', 'lists,emoji,mentions,tasks,dates');
        await expect(currentNotes).toHaveAttribute('rows', '2');
        await expect(currentNotes).not.toHaveAttribute('readonly', '');
        const previousNotes = host.locator('.mo-prev-note');
        await expect(previousNotes.locator('strong')).toHaveText('Waiting');
        await expect(previousNotes).toContainText('🚀');
        await expect(previousNotes).toContainText('<b>vendor</b>');
        await expect(previousNotes.locator('b')).toHaveCount(0);

        const minutes = host.locator('[data-el="minutes"]');
        await expect(minutes).toHaveAttribute('features', 'lists,emoji,mentions,tasks,dates,help');
        await expect(minutes).toHaveAttribute('rows', '8');
        await minutes.locator('textarea').fill('**Minutes** :rocket: <b>literal</b>');
        page.on('dialog', dialog => dialog.accept());
        await host.locator('.mo-close').click();
        await expect.poll(async () => (await (await request.get(`/api/meetings/${currentMeeting.id}`)).json()).minutes)
            .toBe('**Minutes** :rocket: <b>literal</b>');
        await expect(host.locator('.mo-save-minutes')).toHaveCount(0);
        await expect(minutes).toHaveAttribute('readonly', '');
        await page.reload();
        await expect(minutes.locator('textarea')).toHaveValue('**Minutes** :rocket: <b>literal</b>');

        const pdf = await (await request.get(`/meetings/${currentMeeting.id}/minutes`)).text();
        expect(pdf).toContain('<strong>Minutes</strong> 🚀');
        expect(pdf).toContain('&lt;b&gt;literal&lt;/b&gt;');
        expect(pdf).not.toContain('<b>literal</b>');
    } finally {
        if (currentMeeting) await request.delete(`/api/meetings/${currentMeeting.id}`);
        if (previousMeeting) await request.delete(`/api/meetings/${previousMeeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('closing an occurrence keeps drafts on cancellation or save failure and retries empty minutes', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Minutes close recovery' },
    })).json()).series;
    let meeting;
    try {
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.put(`/api/meetings/${meeting.id}`, { data: { minutes: 'Old minutes' } });
        await request.post(`/api/meetings/${meeting.id}/start`);
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const host = page.locator('meeting-occurrence-page');
        const input = host.locator('[data-el="minutes"] textarea');
        await input.fill('Keep this draft');
        const mutations = [];
        page.on('request', req => {
            if (req.method() !== 'GET' && req.url().includes(`/api/meetings/${meeting.id}`)) {
                mutations.push(req.method());
            }
        });
        page.once('dialog', dialog => dialog.dismiss());
        await host.locator('.mo-close').click();
        await expect(input).toHaveValue('Keep this draft');
        expect(mutations).toEqual([]);

        const dialogs = [];
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route(`**/api/meetings/${meeting.id}`, route =>
            route.request().method() === 'PUT'
                ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Save failed"}' })
                : route.continue());
        await host.locator('.mo-close').click();
        await expect.poll(() => dialogs.some(message => message.includes('503'))).toBe(true);
        expect(mutations).toEqual(['PUT']);
        await expect(input).toHaveValue('Keep this draft');
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).status).toBe('in-progress');

        await page.unroute(`**/api/meetings/${meeting.id}`);
        await input.fill('');
        await host.locator('.mo-close').click();
        await expect(input).toHaveAttribute('readonly', '');
        const saved = await (await request.get(`/api/meetings/${meeting.id}`)).json();
        expect(saved.status).toBe('closed');
        expect(saved.minutes).toBe('');
        expect(mutations).toEqual(['PUT', 'PUT', 'POST']);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('closing occurrence minutes creates linked tasks once and saves reference markers', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Minutes task markers' },
    })).json()).series;
    let meeting;
    try {
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const host = page.locator('meeting-occurrence-page');
        const input = host.locator('[data-el="minutes"] textarea');
        await input.fill('Follow up: {{Send summary @ 2099-06-05 10:30}} and {{Book review}}');
        page.on('dialog', dialog => dialog.accept());
        await host.locator('.mo-close').click();
        await expect(input).toHaveAttribute('readonly', '');

        const tasks = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
        expect(tasks.map(t => t.text)).toEqual(['Send summary', 'Book review']);
        expect(tasks.every(t => t.meetingSeriesId === series.id)).toBe(true);
        expect(tasks[0].dueDate).toBe('2099-06-05 10:30');
        const converted = `Follow up: {{?${tasks[0].id}}} and {{?${tasks[1].id}}}`;
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).minutes).toBe(converted);
        await expect(host.locator('.mo-tasks li')).toHaveCount(2);
        await page.reload();
        await expect(input).toHaveValue(converted);
        await host.locator('.mo-reopen').click();
        await host.locator('.mo-close').click();
        await expect(input).toHaveAttribute('readonly', '');
        expect((await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id)).toHaveLength(2);
    } finally {
        if (meeting) {
            const tasks = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
            for (const task of tasks) await request.delete(`/api/tasks/${task.id}`);
            await request.delete(`/api/meetings/${meeting.id}`);
        }
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('minutes task conversion failures preserve converted markers and block closing until retry succeeds', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Minutes marker recovery' },
    })).json()).series;
    let meeting;
    try {
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const host = page.locator('meeting-occurrence-page');
        const input = host.locator('[data-el="minutes"] textarea');
        await input.fill('{{First follow-up}} then {{Second follow-up}}');
        const dialogs = [];
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route('**/api/tasks', route =>
            route.request().method() === 'POST' && route.request().postDataJSON().text === 'Second follow-up'
                ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Task creation failed"}' })
                : route.continue());
        await host.locator('.mo-close').click();
        await expect.poll(() => dialogs.some(message => message.includes('503'))).toBe(true);
        let tasks = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
        expect(tasks).toHaveLength(1);
        await expect(input).toHaveValue(`{{?${tasks[0].id}}} then {{Second follow-up}}`);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).status).toBe('in-progress');

        // A re-render must keep the partially converted draft, not recreate the first task.
        await host.locator('[data-el="agenda-add"]').fill('Keep draft while editing');
        await host.locator('.mo-agenda-add-btn').click();
        await expect(host.locator('.mo-agenda-item')).toHaveCount(1);
        await expect(input).toHaveValue(`{{?${tasks[0].id}}} then {{Second follow-up}}`);
        await page.unroute('**/api/tasks');
        await page.route(`**/api/meetings/${meeting.id}`, route =>
            route.request().method() === 'PUT'
                ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Save failed"}' })
                : route.continue());
        await host.locator('.mo-close').click();
        await expect.poll(() => dialogs.filter(message => message.includes('503')).length).toBe(2);
        tasks = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
        expect(tasks).toHaveLength(2);
        const converted = `{{?${tasks[0].id}}} then {{?${tasks[1].id}}}`;
        await expect(input).toHaveValue(converted);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).status).toBe('in-progress');

        await page.unroute(`**/api/meetings/${meeting.id}`);
        await host.locator('.mo-close').click();
        await expect(input).toHaveAttribute('readonly', '');
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).minutes).toBe(converted);
        expect((await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id)).toHaveLength(2);
    } finally {
        if (meeting) {
            const tasks = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
            for (const task of tasks) await request.delete(`/api/tasks/${task.id}`);
            await request.delete(`/api/meetings/${meeting.id}`);
        }
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('agenda item notes create linked tasks on blur and finish saving before meeting close', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda task markers' },
    })).json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Follow-up topic' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const host = page.locator('meeting-occurrence-page');
        const input = host.locator(`[data-agenda="${item.id}"] textarea`);
        const tasksForMeeting = async () => (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
        await input.fill('{{Send agenda summary @ 2099-06-05}}');
        await input.press('Tab');
        await expect.poll(async () => (await tasksForMeeting()).length).toBe(1);
        const [first] = await tasksForMeeting();
        expect(first).toMatchObject({ text: 'Send agenda summary', meetingSeriesId: series.id, agendaItemId: item.id, dueDate: '2099-06-05' });
        await expect(input).toHaveValue(`{{?${first.id}}}`);
        await expect(host.locator('.mo-tasks li')).toHaveCount(1);
        await expect.poll(async () => (await (await request.get(`/api/meetings/${meeting.id}`)).json()).agenda[0].notes)
            .toBe(`{{?${first.id}}}`);

        await page.route('**/api/tasks', async route => {
            if (route.request().method() === 'POST') {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
            await route.continue();
        });
        await input.fill(`{{?${first.id}}} then {{Schedule agenda review}}`);
        page.on('dialog', dialog => dialog.accept());
        await host.locator('.mo-close').click();
        await expect(host.locator('.mo-reopen')).toBeVisible();
        const tasks = await tasksForMeeting();
        expect(tasks).toHaveLength(2);
        expect(tasks[1]).toMatchObject({ text: 'Schedule agenda review', meetingSeriesId: series.id, agendaItemId: item.id });
        const saved = await (await request.get(`/api/meetings/${meeting.id}`)).json();
        expect(saved.agenda[0].notes).toBe(`{{?${first.id}}} then {{?${tasks[1].id}}}`);
        await page.reload();
        await expect(host.locator('[data-agenda]')).toHaveCount(0);
        await host.locator('.mo-reopen').click();
        await host.locator('.mo-close').click();
        await expect(host.locator('.mo-reopen')).toBeVisible();
        expect(await tasksForMeeting()).toHaveLength(2);
    } finally {
        if (meeting) {
            for (const task of (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id)) {
                await request.delete(`/api/tasks/${task.id}`);
            }
            await request.delete(`/api/meetings/${meeting.id}`);
        }
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('agenda task conversion and save failures preserve drafts and prevent closing until retry', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda marker recovery' },
    })).json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Retry topic' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const host = page.locator('meeting-occurrence-page');
        const input = host.locator(`[data-agenda="${item.id}"] textarea`);
        const dialogs = [];
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route('**/api/tasks', route =>
            route.request().method() === 'POST' && route.request().postDataJSON().text === 'Second agenda task'
                ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Task failed"}' })
                : route.continue());
        await input.fill('{{First agenda task}} then {{Second agenda task}}');
        await input.press('Tab');
        await expect.poll(() => dialogs.filter(message => message.includes('503')).length).toBe(1);
        const [first] = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
        await expect(input).toHaveValue(`{{?${first.id}}} then {{Second agenda task}}`);
        await host.locator('.mo-close').click();
        await expect.poll(() => dialogs.filter(message => message.includes('503')).length).toBe(2);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).status).toBe('in-progress');

        await page.unroute('**/api/tasks');
        await page.route(`**/api/meetings/${meeting.id}/agenda/${item.id}`, route =>
            route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Agenda save failed"}' }));
        await host.locator('.mo-close').click();
        await expect.poll(() => dialogs.filter(message => message.includes('503')).length).toBe(3);
        const tasks = (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id);
        expect(tasks).toHaveLength(2);
        const converted = `{{?${first.id}}} then {{?${tasks[1].id}}}`;
        await expect(input).toHaveValue(converted);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).status).toBe('in-progress');
        await page.unroute(`**/api/meetings/${meeting.id}/agenda/${item.id}`);
        await host.locator('.mo-close').click();
        await expect(host.locator('.mo-reopen')).toBeVisible();
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).agenda[0].notes).toBe(converted);
        expect((await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id)).toHaveLength(2);
    } finally {
        if (meeting) {
            for (const task of (await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id)) {
                await request.delete(`/api/tasks/${task.id}`);
            }
            await request.delete(`/api/meetings/${meeting.id}`);
        }
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('occurrence agenda notes grow while typing up to 25 rows and shrink after deletion', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Growing occurrence notes' },
    })).json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Growing agenda item' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-05' },
        })).json()).meeting;
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const notes = page.locator(`meeting-occurrence-page feature-rich-text-area[data-agenda="${item.id}"] textarea`);
        await expect(notes).toBeVisible();
        const metrics = () => notes.evaluate(el => {
            const css = getComputedStyle(el);
            return {
                height: el.getBoundingClientRect().height,
                lineHeight: parseFloat(css.lineHeight),
                extra: parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
                    + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth),
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
            };
        });
        const initial = await metrics();
        await notes.fill(Array(5).fill('Notes').join('\n'));
        const growing = await metrics();
        expect(growing.height).toBeGreaterThan(initial.height);
        expect(growing.scrollHeight).toBeLessThanOrEqual(growing.clientHeight + 1);
        await notes.press('End');
        await notes.press('Enter');
        await notes.pressSequentially('More notes');
        expect((await metrics()).height).toBeGreaterThan(growing.height);

        const longNotes = Array(40).fill('Notes').join('\n');
        await notes.fill(longNotes);
        const capped = await metrics();
        expect(capped.height).toBeCloseTo(25 * capped.lineHeight + capped.extra, 0);
        expect(capped.scrollHeight).toBeGreaterThan(capped.clientHeight);
        await notes.press('Tab');
        await expect.poll(async () => (await (await request.get(`/api/meetings/${meeting.id}`)).json())
            .agenda.find(a => a.agendaItemId === item.id).notes).toBe(longNotes);
        await page.reload();
        await expect(notes).toHaveValue(longNotes);
        expect((await metrics()).height).toBeCloseTo(capped.height, 0);

        await notes.fill('Wrapped words '.repeat(100));
        const wrapped = await metrics();
        expect(wrapped.height).toBeGreaterThan(initial.height);
        expect(wrapped.height).toBeLessThanOrEqual(capped.height);
        await notes.fill('Short');
        expect((await metrics()).height).toBeCloseTo(initial.height, 0);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting-series renders full Markdown and task references in queued and resolved agenda notes', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Complete agenda Markdown' },
    })).json()).series;
    let meeting;
    let task;
    try {
        const queued = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Queued topic' },
        })).json()).item;
        const resolved = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Resolved topic' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        const tasks = await (await request.post('/api/tasks', {
            data: { text: 'Readable follow-up <details>', meetingId: meeting.id, meetingSeriesId: series.id },
        })).json();
        task = tasks[tasks.length - 1];
        const notes = `## Summary\n\n**Agreed** with @ada :rocket: <b>literal</b>\n\n- First point\n- Second point\n\n[Details](https://example.com)\n\n{{?${task.id}}}\n\n{{!${task.id}}}`;
        for (const item of [queued, resolved]) {
            await request.put(`/api/meetings/${meeting.id}/agenda/${item.id}`, {
                data: { notes, ...(item.id === resolved.id ? { outcome: 'resolved' } : {}) },
            });
        }
        await request.put(`/api/meeting-series/${series.id}`, { data: { description: `Follow-up: {{?${task.id}}}` } });
        await page.goto(`/meeting-series#ms-${series.id}`);
        const host = page.locator('meeting-series-page');
        for (const row of [
            host.locator(`.mp-agenda-row[data-item="${queued.id}"]`),
            host.locator('.mp-agenda-resolved'),
        ]) {
            const display = row.locator('.mp-agenda-note .rich-text');
            await expect(display.locator('h2')).toHaveText('Summary');
            await expect(display.locator('strong')).toHaveText('Agreed');
            await expect(display.locator('ul li')).toHaveText(['First point', 'Second point']);
            await expect(display.locator('a')).toHaveAttribute('href', 'https://example.com');
            await expect(display.locator('entity-mention[key="ada"]')).toHaveCount(1);
            await expect(display).toContainText('🚀 <b>literal</b>');
            await expect(display.locator('b, details')).toHaveCount(0);
            await expect(display).toContainText(task.text);
            await expect(display).not.toContainText(`{{?${task.id}}}`);
            await expect(display).not.toContainText(`{{!${task.id}}}`);
            await expect(display.locator('input[type="checkbox"][disabled]')).toHaveCount(2);
            await expect(display.locator('input[type="checkbox"][checked]')).toHaveCount(1);
        }
        await expect(host.locator('.mp-desc')).toContainText(task.text);
        await expect(host.locator('.mp-desc input[type="checkbox"]')).toHaveCount(1);
    } finally {
        if (task) await request.delete(`/api/tasks/${task.id}`);
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('rich text renderers neutralise unsafe link and image URLs', async ({ page, request }) => {
    const payload = '[a](javascript:alert(1)) [b](java&#x73;cript:alert(2)) ![i](vbscript:x) [d](data:text/html,x) [ok](https://example.com) [rel](/tasks)';
    await page.goto('/results');
    const html = await page.evaluate(async source => {
        const { renderRichText } = await import('/services/_shared/wn-rich-text.js');
        return renderRichText(source) + renderRichText(source, { inline: true });
    }, payload);
    expect(html).not.toMatch(/(?:script|data):/i);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="/tasks"');

    const meeting = (await (await request.post('/api/meetings', {
        data: { title: `Unsafe links ${Date.now()}`, date: '2099-06-05' },
    })).json()).meeting;
    try {
        await request.put(`/api/meetings/${meeting.id}`, { data: { ...meeting, minutes: payload } });
        await expect.poll(async () => (await (await request.get(`/api/meetings/${meeting.id}`)).json()).minutes).toBe(payload);
        const exported = await (await request.get(`/meetings/${meeting.id}/minutes`)).text();
        const body = exported.slice(exported.indexOf('minutes-body'));
        expect(body).toContain('href="https://example.com"');
        expect(body).not.toMatch(/(?:href|src)="(?:java|vbscript|data)/i);
    } finally {
        await request.delete(`/api/meetings/${meeting.id}`);
    }
});
