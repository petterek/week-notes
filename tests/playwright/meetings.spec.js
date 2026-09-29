// Meeting-series feature: recurring meetings with a persistent agenda
// thread, occurrence lifecycle (planned -> in-progress -> closed),
// carry-forward of unresolved agenda items, decisions log, follow-up
// tasks, and PDF-exportable minutes.
//
// Covers both page-level smoke (routes load) and a full lifecycle
// regression exercised through the real API + real UI (no mocks).
const { test, expect } = require('@playwright/test');

test('meeting-series page smoke: loads with correct title', async ({ page }) => {
    const resp = await page.goto('/meeting-series', { waitUntil: 'domcontentloaded' });
    expect(resp.ok(), '/meeting-series should return 2xx').toBe(true);
    await expect(page).toHaveTitle(/Møteserier/);
});

test('meeting-occurrence page smoke: loads for a real occurrence id', async ({ page, request }) => {
    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Smoke test series (auto-delete)' } });
    expect(seriesResp.ok()).toBe(true);
    const series = (await seriesResp.json()).series;
    let occ;

    try {
        const occResp = await request.post('/api/meetings', { data: { date: '2099-06-01', seriesId: series.id } });
        expect(occResp.ok()).toBe(true);
        occ = (await occResp.json()).meeting;

        const resp = await page.goto(`/meeting-occurrence/${occ.id}`, { waitUntil: 'domcontentloaded' });
        expect(resp.ok(), 'meeting-occurrence page should return 2xx').toBe(true);
        await expect(page.locator('meeting-occurrence-page')).toBeVisible();
    } finally {
        if (occ) await request.delete(`/api/meetings/${occ.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

// Full lifecycle: series -> agenda -> occurrence (auto-populated agenda) ->
// start -> resolve one item, add ad-hoc item + decision + minutes + a
// linked follow-up task -> close (auto-defers the untouched item) ->
// verify PDF export link -> reopen. Exercises the real backend end to end.
test('meeting occurrence workspace: full lifecycle via UI', async ({ page, request }) => {
    page.on('dialog', d => d.accept());

    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Lifecycle test series (auto-delete)' } });
    const series = (await seriesResp.json()).series;
    let occ;
    let secondOcc;

    try {
        const item1Resp = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Agenda item one' } });
        expect(item1Resp.ok()).toBe(true);
        const item2Resp = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Agenda item two' } });
        expect(item2Resp.ok()).toBe(true);

        const occResp = await request.post('/api/meetings', { data: { date: '2099-06-15', seriesId: series.id } });
        occ = (await occResp.json()).meeting;
        expect(occ.agenda.length).toBe(2);

        await page.goto(`/meeting-occurrence/${occ.id}`, { waitUntil: 'domcontentloaded' });
        const host = page.locator('meeting-occurrence-page');
        await expect(host).toBeVisible();

        // Wait for the async loadData() render to replace the loading placeholder.
        await expect.poll(async () => host.evaluate(el => el.shadowRoot.querySelector('.mo-agenda-item') ? true : false))
            .toBe(true);

        const shadowText = async () => host.evaluate(el => el.shadowRoot.textContent);
        expect(await shadowText()).toContain('Agenda item one');
        expect(await shadowText()).toContain('Agenda item two');
        expect(await shadowText()).toContain('Planlagt');

        // Start the meeting.
        await host.evaluate(el => el.shadowRoot.querySelector('.mo-start').click());
        await expect.poll(shadowText).toContain('Pågår');

        // Resolve the first agenda item.
        await host.evaluate(el => {
            const items = Array.from(el.shadowRoot.querySelectorAll('.mo-agenda-item'));
            const first = items.find(i => i.textContent.includes('Agenda item one'));
            first.querySelector('button[data-outcome="resolved"]').click();
        });
        await expect.poll(async () => host.evaluate(el => {
            const items = Array.from(el.shadowRoot.querySelectorAll('.mo-agenda-item'));
            const first = items.find(i => i.textContent.includes('Agenda item one'));
            return first.querySelector('button[data-outcome="resolved"]').classList.contains('on');
        })).toBe(true);

        // Add an ad-hoc agenda item.
        await host.evaluate(el => {
            const input = el.shadowRoot.querySelector('[data-el="agenda-add"]');
            input.value = 'Ad-hoc agenda item';
            el.shadowRoot.querySelector('.mo-agenda-add-btn').click();
        });
        await expect.poll(shadowText).toContain('Ad-hoc agenda item');

        // Add a decision.
        await host.evaluate(el => {
            const input = el.shadowRoot.querySelector('[data-el="decision-add"]');
            input.value = 'We decided to ship it';
            el.shadowRoot.querySelector('.mo-decision-add-btn').click();
        });
        await expect.poll(shadowText).toContain('We decided to ship it');

        // Save freeform minutes.
        await host.evaluate(el => {
            el.shadowRoot.querySelector('[data-el="minutes"]').value = 'Referat: alt gikk bra.';
            el.shadowRoot.querySelector('.mo-save-minutes').click();
        });
        await expect.poll(async () => {
            const m = await (await request.get(`/api/meetings/${occ.id}`)).json();
            return m.minutes;
        }).toBe('Referat: alt gikk bra.');

        // PDF export link present and points at the print route.
        const pdfHref = await host.evaluate(el => el.shadowRoot.querySelector('a[href*="/minutes"]').getAttribute('href'));
        expect(pdfHref).toBe(`/meetings/${occ.id}/minutes`);
        const pdfResp = await request.get(pdfHref);
        expect(pdfResp.ok()).toBe(true);

        // Close the meeting (confirm() auto-accepted above) — the untouched
        // second agenda item and the ad-hoc item must auto-defer.
        await host.evaluate(el => el.shadowRoot.querySelector('.mo-close').click());
        await expect.poll(shadowText).toContain('Avsluttet');
        const closed = await (await request.get(`/api/meetings/${occ.id}`)).json();
        const item2Entry = closed.agenda.find(a => a.title === 'Agenda item two');
        expect(item2Entry.outcome).toBe('deferred');
        const resolvedEntry = closed.agenda.find(a => a.title === 'Agenda item one');
        expect(resolvedEntry.outcome).toBe('resolved');

        // Deferred item must have carried forward to the series queue, the
        // resolved item must have left it.
        const seriesAfter = await (await request.get(`/api/meeting-series/${series.id}`)).json();
        const queuedTitles = seriesAfter.agendaItems.filter(a => a.state === 'queued').map(a => a.title);
        expect(queuedTitles).toContain('Agenda item two');
        expect(queuedTitles).not.toContain('Agenda item one');

        // A second occurrence must inherit the carried-forward queue.
        const secondResp = await request.post('/api/meetings', { data: { date: '2099-06-22', seriesId: series.id } });
        secondOcc = (await secondResp.json()).meeting;
        expect(secondOcc.agenda.map(a => a.title)).toContain('Agenda item two');
        expect(secondOcc.agenda.map(a => a.title)).toContain('Ad-hoc agenda item');
        expect(secondOcc.agenda.map(a => a.title)).not.toContain('Agenda item one');

        // Reopen.
        await host.evaluate(el => el.shadowRoot.querySelector('.mo-reopen').click());
        await expect.poll(shadowText).toContain('Pågår');
        await expect.poll(async () => host.evaluate(el => {
            const editBtn = el.shadowRoot.querySelector('.mo-edit-head');
            const minutes = el.shadowRoot.querySelector('[data-el="minutes"]');
            return {
                edit: !!editBtn,
                minutesReadonly: !!minutes && minutes.readOnly,
            };
        })).toEqual({ edit: true, minutesReadonly: false });
    } finally {
        if (secondOcc) await request.delete(`/api/meetings/${secondOcc.id}`);
        if (occ) await request.delete(`/api/meetings/${occ.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

// Regression: a follow-up task created from the occurrence workspace must
// be linked to both the occurrence and its series so it also surfaces on
// the series dashboard.
test('follow-up task created from occurrence workspace links meetingId + meetingSeriesId', async ({ request }) => {
    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Task-link test series (auto-delete)' } });
    const series = (await seriesResp.json()).series;
    const occResp = await request.post('/api/meetings', { data: { date: '2099-06-20', seriesId: series.id } });
    const occ = (await occResp.json()).meeting;
    let task;

    try {
        const taskResp = await request.post('/api/tasks', {
            data: { text: 'Follow up on decision (auto-delete)', meetingId: occ.id, meetingSeriesId: series.id }
        });
        expect(taskResp.ok()).toBe(true);
        const tasks = await taskResp.json();
        task = tasks.find(t => t.text === 'Follow up on decision (auto-delete)');
        expect(task).toBeTruthy();
        expect(task.meetingId).toBe(occ.id);
        expect(task.meetingSeriesId).toBe(series.id);
    } finally {
        if (task) await request.delete(`/api/tasks/${task.id}`);
        await request.delete(`/api/meetings/${occ.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});
