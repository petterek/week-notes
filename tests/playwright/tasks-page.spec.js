const { test, expect } = require('@playwright/test');

test('tasks group by origin type and source with linked headings, filtering and completed tasks', async ({ page, request }) => {
    const title = '<b>Weekly sync</b> & planning';
    const series = (await (await request.post('/api/meeting-series', { data: { title } })).json()).series;
    const goal = (await (await request.post('/api/goals', { data: { title: 'Improve planning' } })).json()).goal;
    const meeting = (await (await request.post('/api/meetings', {
        data: { title: 'Planning workshop', date: '2099-06-05' },
    })).json()).meeting;
    const tasks = [];
    try {
        for (const data of [
            { text: 'Linked follow-up', meetingSeriesId: series.id, noteRef: '2099-W23/meeting.md', goalId: goal.id },
            { text: 'Completed follow-up', meetingSeriesId: series.id },
            { text: 'Unlinked follow-up' },
            { text: 'Missing series follow-up', meetingSeriesId: 'missing-series' },
            { text: 'Another linked follow-up', meetingSeriesId: series.id },
            { text: 'Note follow-up', noteRef: '2099-W23/project plan.md', goalId: goal.id },
            { text: 'Goal follow-up', goalId: goal.id },
            { text: 'Meeting follow-up', meetingId: meeting.id },
        ]) {
            const result = await (await request.post('/api/tasks', { data })).json();
            tasks.push(result.at(-1));
        }
        await request.put(`/api/tasks/${tasks[1].id}/toggle`, { data: {} });
        await request.put(`/api/meeting-series/${series.id}`, { data: { status: 'archived' } });
        await page.goto('/tasks');
        const host = page.locator('tasks-page');
        const row = task => host.locator(`tr[data-taskid="${task.id}"]`);
        const group = type => host.locator(`tbody.tp-origin-group[data-origin="${type}"]`);
        const sourceHeading = key => host.locator(`.tp-source-heading[data-source="${key}"]`);
        const sourceTasks = key => host.locator(`tr[data-taskid][data-source="${key}"]`);
        const seriesKey = `meeting-series:${series.id}`;
        const link = sourceHeading(seriesKey).locator('a');
        await expect(link).toHaveText(`Møteserie: ${title}`);
        await expect(link).toHaveAttribute('href', `/meeting-series#ms-${series.id}`);
        await expect(link.locator('b')).toHaveCount(0);
        await expect(host.locator('.tp-origin-heading')).toHaveText(['Møter', 'Notater', 'Mål', 'Andre']);
        await expect(group('meetings').locator('tr[data-taskid]')).toHaveCount(4);
        await expect(group('meetings').locator('.tp-source-heading')).toHaveCount(3);
        await expect(sourceTasks(seriesKey)).toHaveCount(2);
        await expect(sourceTasks(`meeting:${meeting.id}`)).toContainText(['Meeting follow-up']);
        await expect(sourceTasks('meeting-series:missing-series')).toContainText(['Missing series follow-up']);
        await expect(group('other').locator('tr[data-taskid]')).toContainText(['Unlinked follow-up']);
        await expect(group('other').locator('.tp-source-heading')).toHaveText('Uten registrert kilde');
        await expect(group('notes').locator('.tp-source-heading')).toContainText('Notat: project plan (2099-W23)');
        await expect(group('notes').getByRole('link', { name: /Forhåndsvis/ })).toHaveAttribute('href', '/2099-W23/project%20plan.md');
        await expect(group('notes').getByRole('link', { name: /Rediger/ })).toHaveAttribute('href', '/editor/2099-W23/project%20plan.md');
        await expect(group('goals').locator('.tp-source-heading a')).toHaveText('Mål: Improve planning');
        await expect(group('goals').locator('.tp-source-heading a')).toHaveAttribute('href', `/goals#g-${goal.id}`);
        await expect(sourceHeading(`meeting:${meeting.id}`).locator('a')).toHaveText('Møte: Planning workshop');
        await expect(sourceHeading(`meeting:${meeting.id}`).locator('a')).toHaveAttribute('href', `/calendar/2099-W23#m-${meeting.id}`);

        await host.locator('th[data-col="title"]').click();
        await expect(sourceTasks(seriesKey)).toContainText(['Another linked follow-up', 'Linked follow-up']);
        await host.locator('th[data-col="title"]').click();
        await expect(sourceTasks(seriesKey)).toContainText(['Linked follow-up', 'Another linked follow-up']);

        await host.locator('.tp-filter').fill('weekly sync');
        await expect(row(tasks[0])).toBeVisible();
        await expect(row(tasks[4])).toBeVisible();
        await expect(row(tasks[2])).toBeHidden();
        await expect(row(tasks[3])).toBeHidden();
        await expect(sourceHeading(seriesKey)).toBeVisible();
        await expect(sourceHeading('meeting-series:missing-series')).toBeHidden();
        await expect(sourceHeading(`meeting:${meeting.id}`)).toBeHidden();
        await expect(group('other')).toBeHidden();
        await expect(group('notes')).toBeHidden();
        await expect(group('goals')).toBeHidden();
        await host.locator('.tp-filter').fill('no matching follow-up');
        await expect(host.locator('.tp-origin-group:visible')).toHaveCount(0);
        await expect(host.locator('.tp-empty')).toHaveText('Ingen treff');
        await host.locator('.tp-filter').fill('project plan');
        await expect(row(tasks[5])).toBeVisible();
        await expect(group('meetings')).toBeHidden();
        await host.locator('.tp-filter').fill('improve planning');
        await expect(row(tasks[6])).toBeVisible();
        await host.locator('.tp-filter').fill('');
        await expect(sourceHeading('meeting-series:missing-series')).toBeVisible();
        await expect(sourceHeading(`meeting:${meeting.id}`)).toBeVisible();
        await host.locator('.tp-filter').fill('weekly sync');
        await host.locator('[data-tab="done"]').click();
        await expect(group('meetings').locator('tr[data-taskid]')).toHaveCount(1);
        await expect(row(tasks[1])).toBeVisible();
        await expect(sourceTasks(seriesKey)).toHaveCount(1);
        await expect(link).toHaveText(`Møteserie: ${title}`);

        await host.locator('[data-tab="open"]').click();
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/meeting-series#ms-${series.id}$`));
        await expect(page.locator('meeting-series-page .mp-dp-title')).toContainText(title);
        await expect(page.locator('body > task-view-modal[open]')).toHaveCount(0);
    } finally {
        for (const task of tasks) await request.delete(`/api/tasks/${task.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
        await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/goals/${goal.id}`);
    }
});

for (const submit of ['Enter', 'button']) {
    test(`tasks quick-add via ${submit} reuses the create response without reloading data`, async ({ page, request }) => {
        await page.goto('/tasks');
        const tasks = page.locator('tasks-page');
        await expect(tasks.locator('.tp-create-input')).toBeVisible();
        await page.waitForLoadState('networkidle');

        const reads = [];
        page.on('request', req => {
            if (req.method() === 'GET' && /^\/api\/(tasks|people|companies|goals|meetings|meeting-series)$/.test(new URL(req.url()).pathname)) {
                reads.push(new URL(req.url()).pathname);
            }
        });
        const text = `Quick-add request regression ${submit}`;
        let id;
        try {
            await tasks.locator('.tp-filter').fill(text.toLowerCase());
            await tasks.locator('.tp-create-input').fill(text);
            const created = page.waitForResponse(res => new URL(res.url()).pathname === '/api/tasks' && res.request().method() === 'POST');
            if (submit === 'Enter') {
                await tasks.locator('.tp-create-input').press('Enter');
            } else {
                await tasks.locator('.tp-create-btn').click();
            }
            const response = await created;
            expect(response.ok()).toBe(true);
            const saved = await response.json();
            id = saved.find(task => task.text === text)?.id;
            expect(id).toBeTruthy();
            await expect(tasks.locator(`tr[data-taskid="${id}"]`)).toBeVisible();
            await expect(tasks.locator('.tp-create-input')).toHaveValue('');
            await expect(tasks.locator('.tp-filter')).toHaveValue(text.toLowerCase());
            expect(reads, 'Create already returns the task list; related data must stay cached').toEqual([]);
        } finally {
            if (id) await request.delete(`/api/tasks/${encodeURIComponent(id)}`);
        }
    });
}
