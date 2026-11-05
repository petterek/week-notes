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
        await page.goto(`/meeting-occurrence/${currentMeeting.id}`);

        const host = page.locator('meeting-occurrence-page');
        const currentNotes = host.locator(`feature-rich-text-area[data-agenda="${item.id}"]`);
        await expect(currentNotes).toHaveAttribute('features', 'lists,emoji,mentions,dates');
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
        await host.locator('.mo-save-minutes').click();
        await expect.poll(async () => (await (await request.get(`/api/meetings/${currentMeeting.id}`)).json()).minutes)
            .toBe('**Minutes** :rocket: <b>literal</b>');

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
