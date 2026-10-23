// Meeting-series feature: recurring meetings with a persistent agenda
// thread, occurrence lifecycle (planned -> in-progress -> closed),
// carry-forward of unresolved agenda items, decisions log, follow-up
// tasks, and PDF-exportable minutes.
//
// Covers both page-level smoke (routes load) and a full lifecycle
// regression exercised through the real API + real UI (no mocks).
const { test, expect } = require('@playwright/test');

test('calendar meeting edit renders the linked note and original form values, not HTML source', async ({ page, request }) => {
    const created = await request.post('/api/meetings', {
        data: {
            date: '2099-06-01', start: '10:00', end: '11:00',
            title: 'Review <draft> & notes', notes: 'Agenda <final> & follow-up',
            noteRef: '2099-W23/plan.md',
        },
    });
    expect(created.ok()).toBe(true);
    const { meeting } = await created.json();
    try {
        await page.goto('/calendar/2099-W23');
        const calendar = page.locator('week-notes-calendar');
        await expect(calendar.locator('week-calendar')).toBeVisible();
        await expect.poll(() => calendar.evaluate((el, id) => !!el._meetingsById?.[id], meeting.id)).toBe(true);
        await calendar.evaluate((el, id) => el._openEdit(id), meeting.id);
        const editor = calendar.locator('meeting-edit');
        await expect(editor.locator('[data-note-ref-row] .note-ref-pill')).toContainText('plan');
        await expect(editor.locator('input[name="title"]')).toHaveValue('Review <draft> & notes');
        await expect(editor.locator('textarea[name="notes"]')).toHaveValue('Agenda <final> & follow-up');
        await expect(editor.locator('[data-note-ref-row]')).not.toContainText('<div');
        await editor.evaluate(el => el._setNoteRef(''));
        await expect(editor.locator('[data-note-ref-row] button[data-pick-note]')).toHaveText(/Velg notat/);
        await editor.evaluate(el => el._setNoteRef('2099-W23/plan.md'));
        await expect(editor.locator('[data-note-ref-row] button[data-clear-note]')).toBeVisible();
    } finally {
        await request.delete(`/api/meetings/${meeting.id}`);
    }
});

test('calendar opens a series occurrence in the saved-size meeting popup', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', { data: { title: 'Calendar popup series' } })).json()).series;
    let occurrence;
    try {
        const created = await request.post('/api/meetings', { data: { date: '2099-06-01', start: '10:00', end: '11:00', seriesId: series.id } });
        expect(created.ok()).toBe(true);
        occurrence = (await created.json()).meeting;
        await page.goto('/calendar/2099-W23');
        const calendar = page.locator('week-notes-calendar');
        await expect.poll(() => calendar.evaluate((el, id) => !!el._meetingsById?.[id], occurrence.id)).toBe(true);
        await page.evaluate(() => {
            localStorage.setItem('meeting-popup-size', JSON.stringify({ width: 760, height: 620 }));
            const nativeOpen = window.open;
            window.open = function(...args) {
                window.__calendarPopupFeatures = args[2];
                return nativeOpen.apply(this, args);
            };
        });
        const popupPromise = page.waitForEvent('popup');
        await calendar.evaluate((el, id) => el._openEdit(id), occurrence.id);
        const popup = await popupPromise;
        await expect(popup).toHaveURL(new RegExp(`/meeting-occurrence/${occurrence.id}\\?popup=1$`));
        expect(await popup.locator('#appHeader').count()).toBe(0);
        expect(await page.evaluate(() => window.__calendarPopupFeatures)).toContain('width=760,height=620');
        await expect(page).toHaveURL(/\/calendar\/2099-W23$/);
        const reload = page.waitForEvent('load');
        await popup.close();
        await reload;
        await expect(page).toHaveURL(/\/calendar\/2099-W23$/);
    } finally {
        if (occurrence) await request.delete(`/api/meetings/${occurrence.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

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

test('starting a new series occurrence opens its workspace in a popup', async ({ page, request }) => {
    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Popup start series' } });
    expect(seriesResp.ok()).toBe(true);
    const series = (await seriesResp.json()).series;
    let occ;
    try {
        await page.goto(`/meeting-series#ms-${series.id}`);
        const host = page.locator('meeting-series-page');
        await expect(host.locator('.mp-new-occ')).toBeVisible();
        await page.evaluate(() => {
            const nativeOpen = window.open;
            window.open = function(...args) {
                window.__popupFeatures = args[2];
                return nativeOpen.apply(this, args);
            };
        });
        const popupPromise = page.waitForEvent('popup');
        await host.locator('.mp-new-occ').click();
        const popup = await popupPromise;
        await expect(popup).toHaveURL(new RegExp(`/meeting-series\\?startSeries=${series.id}`));
        const setup = popup.locator('meeting-series-page');
        await expect(setup.locator('[data-act="save-occ"]')).toBeVisible();
        await expect(setup.locator('pick-date-time-span')).toBeVisible();
        await popup.setViewportSize({ width: 480, height: 650 });
        for (const which of ['start', 'end']) {
            await setup.locator('pick-date-time-span').locator(`[data-trigger="${which}"]`).click();
            await expect(setup.locator('pick-date-time-span date-time-picker')).toBeVisible();
            const geometry = await setup.evaluate(el => {
                const card = el.shadowRoot.querySelector('.mp-setup .modal-card');
                const span = el.shadowRoot.querySelector('pick-date-time-span');
                const picker = span.shadowRoot.querySelector('date-time-picker');
                const cardRect = card.getBoundingClientRect();
                const pickerRect = picker.getBoundingClientRect();
                return {
                    contained: pickerRect.left >= cardRect.left && pickerRect.right <= cardRect.right
                        && pickerRect.bottom <= window.innerHeight,
                    overflow: card.scrollWidth > card.clientWidth || getComputedStyle(card).overflowY !== 'visible',
                };
            });
            expect(geometry, `${which} calendar must fit inside setup card`).toEqual({ contained: true, overflow: false });
            await setup.locator('pick-date-time-span').locator(`[data-trigger="${which}"]`).click();
        }
        expect(await page.evaluate(() => window.__popupFeatures)).toContain('popup=yes');
        expect(await page.evaluate(() => window.__popupFeatures)).toContain('toolbar=no');
        expect(await popup.locator('#appHeader').count()).toBe(0);
        expect(await popup.locator('#shortcutsBar').count()).toBe(0);
        expect(await host.locator('[data-act="save-occ"]').count()).toBe(0);
        await setup.evaluate(el => {
            const span = el.shadowRoot.querySelector('[data-span]');
            span.start = '2099-06-01 10:00';
            span.end = '2099-06-01 11:00';
        });
        await setup.locator('[data-act="save-occ"]').click();
        await expect(popup).toHaveURL(/\/meeting-occurrence\/[^/]+\?popup=1/);
        await expect(popup.locator('meeting-occurrence-page')).toContainText('Pågår');
        expect(await popup.locator('#appHeader').count()).toBe(0);
        expect(await popup.locator('#shortcutsBar').count()).toBe(0);
        await expect(page).toHaveURL(/\/meeting-series/);
        occ = await popup.evaluate(() => location.pathname.split('/').pop());
    } finally {
        if (occ) await request.delete(`/api/meetings/${occ}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('closing the meeting setup popup does not create an occurrence', async ({ page, request }) => {
    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Blocked popup series' } });
    const series = (await seriesResp.json()).series;
    try {
        await page.goto(`/meeting-series#ms-${series.id}`);
        const host = page.locator('meeting-series-page');
        const popupPromise = page.waitForEvent('popup');
        await host.locator('.mp-new-occ').click();
        const popup = await popupPromise;
        const setup = popup.locator('meeting-series-page');
        await expect(setup.locator('[data-act="save-occ"]')).toBeVisible();
        await setup.evaluate(el => {
            const span = el.shadowRoot.querySelector('[data-span]');
            span.start = '2099-06-01 10:00';
            span.end = '2099-06-01 11:00';
        });
        const reload = page.waitForEvent('load');
        await popup.close();
        await reload;
        expect(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type)).toBe('reload');
        const meetings = await (await request.get('/api/meetings')).json();
        expect(meetings.filter(m => m.seriesId === series.id)).toHaveLength(0);
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting popup remembers its resized dimensions on the next opening', async ({ page, request }) => {
    const response = await request.post('/api/meeting-series', { data: { title: 'Popup size series' } });
    const series = (await response.json()).series;
    try {
        await page.goto(`/meeting-series#ms-${series.id}`);
        const button = page.locator('meeting-series-page .mp-new-occ');
        await expect(button).toBeVisible();
        await page.evaluate(() => {
            const open = window.open;
            window.open = function(...args) {
                window.__lastPopupFeatures = args[2];
                return open.apply(this, args);
            };
        });
        const firstPromise = page.waitForEvent('popup');
        await button.click();
        const first = await firstPromise;
        await expect(first.locator('meeting-series-page [data-act="save-occ"]')).toBeVisible();
        await first.setViewportSize({ width: 700, height: 600 });
        const size = await first.evaluate(() => ({ width: window.outerWidth, height: window.outerHeight }));
        await expect.poll(() => page.evaluate(() => localStorage.getItem('meeting-popup-size')))
            .toBe(JSON.stringify(size));
        const reload = page.waitForEvent('load');
        await first.close();
        await reload;
        await page.evaluate(() => {
            const open = window.open;
            window.open = function(...args) {
                window.__lastPopupFeatures = args[2];
                return open.apply(this, args);
            };
        });

        const secondPromise = page.waitForEvent('popup');
        await button.click();
        const second = await secondPromise;
        const features = await page.evaluate(() => window.__lastPopupFeatures);
        expect(features).toContain(`width=${size.width}`);
        expect(features).toContain(`height=${size.height}`);
        await second.close();
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting history opens an existing occurrence in the saved-size popup', async ({ page, request }) => {
    const response = await request.post('/api/meeting-series', { data: { title: 'History popup series' } });
    const series = (await response.json()).series;
    let occurrence;
    try {
        const created = await request.post('/api/meetings', { data: { date: '2099-06-01', seriesId: series.id } });
        expect(created.ok()).toBe(true);
        occurrence = (await created.json()).meeting;
        await page.goto(`/meeting-series#ms-${series.id}`);
        const row = page.locator(`meeting-series-page .mp-occ-row[data-id="${occurrence.id}"]`);
        await expect(row).toBeVisible();
        await page.evaluate(() => {
            localStorage.setItem('meeting-popup-size', JSON.stringify({ width: 780, height: 640 }));
            const nativeOpen = window.open;
            window.open = function(...args) {
                window.__historyPopupFeatures = args[2];
                return nativeOpen.apply(this, args);
            };
        });
        const popupPromise = page.waitForEvent('popup');
        await row.click();
        const popup = await popupPromise;
        await expect(popup).toHaveURL(new RegExp(`/meeting-occurrence/${occurrence.id}\\?popup=1$`));
        await expect(popup.locator('meeting-occurrence-page')).toContainText('Planlagt');
        expect(await popup.locator('meeting-occurrence-page .mo-back').count()).toBe(0);
        expect(await popup.locator('#appHeader').count()).toBe(0);
        expect(await popup.locator('#shortcutsBar').count()).toBe(0);
        expect(await page.evaluate(() => window.__historyPopupFeatures)).toContain('width=780,height=640');
        await expect(page).toHaveURL(/\/meeting-series/);
        expect((await request.post(`/api/meetings/${occurrence.id}/decisions`, { data: { text: 'Updated in popup' } })).ok()).toBe(true);
        const reload = page.waitForEvent('load');
        await popup.close();
        await reload;
        expect(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type)).toBe('reload');
        await expect(page).toHaveURL(new RegExp(`/meeting-series#ms-${series.id}$`));
        await expect(page.locator('meeting-series-page .mp-decision-grp')).toContainText('Updated in popup');
    } finally {
        if (occurrence) await request.delete(`/api/meetings/${occurrence.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('ending a meeting closes its popup only after a successful close', async ({ page, request }) => {
    const response = await request.post('/api/meeting-series', { data: { title: 'End popup series' } });
    const series = (await response.json()).series;
    let occurrence;
    try {
        const created = await request.post('/api/meetings', { data: { date: '2099-06-01', seriesId: series.id } });
        occurrence = (await created.json()).meeting;
        expect((await request.post(`/api/meetings/${occurrence.id}/start`)).ok()).toBe(true);
        await page.goto(`/meeting-series#ms-${series.id}`);
        const row = page.locator(`meeting-series-page .mp-occ-row[data-id="${occurrence.id}"]`);
        await expect(row).toBeVisible();
        const popupPromise = page.waitForEvent('popup');
        await row.click();
        const popup = await popupPromise;
        const closeButton = popup.locator('meeting-occurrence-page .mo-close');
        await expect(closeButton).toBeVisible();
        const dialogs = [];
        popup.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });

        await popup.route(`**/api/meetings/${occurrence.id}/close`, route =>
            route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Close failed"}' }));
        await closeButton.click();
        await expect.poll(() => dialogs.some(message => message.includes('503'))).toBe(true);
        expect(popup.isClosed()).toBe(false);
        expect((await (await request.get(`/api/meetings/${occurrence.id}`)).json()).status).toBe('in-progress');

        await popup.unroute(`**/api/meetings/${occurrence.id}/close`);
        const reload = page.waitForEvent('load');
        await closeButton.click();
        await expect.poll(() => popup.isClosed()).toBe(true);
        await reload;
        expect((await (await request.get(`/api/meetings/${occurrence.id}`)).json()).status).toBe('closed');
        await expect(page).toHaveURL(/\/meeting-series/);
        expect(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type)).toBe('reload');
        await expect(row).toContainText('Avsluttet');
    } finally {
        if (occurrence) await request.delete(`/api/meetings/${occurrence.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('blocking the setup popup does not create an occurrence', async ({ page, request }) => {
    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Blocked popup series' } });
    const series = (await seriesResp.json()).series;
    try {
        await page.goto(`/meeting-series#ms-${series.id}`);
        const host = page.locator('meeting-series-page');
        await expect(host.locator('.mp-new-occ')).toBeVisible();
        await page.evaluate(() => { window.open = () => null; });
        const dialogPromise = page.waitForEvent('dialog');
        const clickPromise = host.locator('.mp-new-occ').click();
        const dialog = await dialogPromise;
        expect(dialog.message()).toContain('Tillat popup-vinduer');
        await dialog.dismiss();
        await clickPromise;
        const meetings = await (await request.get('/api/meetings')).json();
        expect(meetings.filter(m => m.seriesId === series.id)).toHaveLength(0);
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('the regular occurrence page retains the app header and footer', async ({ page, request }) => {
    const seriesResp = await request.post('/api/meeting-series', { data: { title: 'Regular shell series' } });
    const series = (await seriesResp.json()).series;
    let occ;
    try {
        const occResp = await request.post('/api/meetings', { data: { date: '2099-06-01', seriesId: series.id } });
        occ = (await occResp.json()).meeting;
        await page.goto(`/meeting-occurrence/${occ.id}`);
        await expect(page.locator('#appHeader')).toBeVisible();
        await expect(page.locator('#shortcutsBar')).toBeAttached();
        await expect(page.locator('meeting-occurrence-page .mo-back')).toBeVisible();
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

        // Starting opens the active occurrence in a focused popup window.
        await page.evaluate(() => {
            localStorage.setItem('meeting-popup-size', JSON.stringify({ width: 780, height: 640 }));
            const nativeOpen = window.open;
            window.open = function(...args) {
                window.__meetingPopupFeatures = args[2];
                return nativeOpen.apply(this, args);
            };
        });
        const popupPromise = page.waitForEvent('popup');
        await page.locator('meeting-occurrence-page .mo-start').click();
        const popup = await popupPromise;
        await expect(popup.locator('meeting-occurrence-page')).toBeVisible();
        await expect(popup.locator('meeting-occurrence-page')).toContainText('Pågår');
        expect(await page.evaluate(() => window.__meetingPopupFeatures)).toContain('popup=yes');
        expect(await page.evaluate(() => window.__meetingPopupFeatures)).toContain('toolbar=no');
        expect(await page.evaluate(() => window.__meetingPopupFeatures)).toContain('width=780,height=640');
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

test('meeting decisions link to existing agenda items without creating tasks', async ({ page, request }) => {
    const created = await request.post('/api/meeting-series', { data: { title: 'Decision agenda workspace' } });
    const series = (await created.json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Existing agenda topic' } })).json()).item;
        meeting = (await (await request.post('/api/meetings', { data: { seriesId: series.id, date: '2099-06-01' } })).json()).meeting;
        const decision = (await (await request.post(`/api/meetings/${meeting.id}/decisions`, { data: { text: 'We agreed' } })).json()).decision;
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const workspace = page.locator('meeting-occurrence-page');
        const selector = workspace.locator(`select[data-decision-id="${decision.id}"]`);
        await expect(selector).toBeVisible();
        await selector.selectOption(item.id);
        await expect(workspace.locator('.mo-agenda-item')).toContainText('We agreed');
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).decisions[0].agendaItemId).toBe(item.id);
        expect((await (await request.get('/api/tasks')).json()).filter(t => t.meetingId === meeting.id)).toHaveLength(0);
        await selector.selectOption('');
        await expect(workspace.locator('.mo-agenda-decisions')).toHaveCount(0);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('resolving an agenda item offers an optional linked decision', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', { data: { title: 'Resolve with decision' } })).json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'First topic' } })).json()).item;
        meeting = (await (await request.post('/api/meetings', { data: { seriesId: series.id, date: '2099-06-01' } })).json()).meeting;
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const workspace = page.locator('meeting-occurrence-page');
        const solved = workspace.locator(`button[data-item="${item.id}"][data-outcome="resolved"]`);
        await solved.click();
        const dialog = workspace.getByRole('dialog', { name: 'Opprett beslutning' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Uten beslutning' }).click();
        await expect(dialog).toHaveCount(0);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).agenda[0].outcome).toBe('resolved');
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).decisions).toHaveLength(0);

        await solved.click();
        await expect(dialog).toHaveCount(0);
        await solved.click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole('textbox', { name: 'Beslutning' }).fill('We agreed to ship');
        await dialog.getByRole('button', { name: 'Lagre beslutning' }).click();
        await expect(dialog).toHaveCount(0);
        const saved = await (await request.get(`/api/meetings/${meeting.id}`)).json();
        expect(saved.agenda[0].outcome).toBe('resolved');
        expect(saved.decisions).toEqual([expect.objectContaining({ text: 'We agreed to ship', agendaItemId: item.id })]);
        await expect(workspace.locator('.mo-agenda-decisions')).toContainText('We agreed to ship');
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting minutes support mention autocomplete and save the selected mention', async ({ page, request }) => {
    const created = await request.post('/api/meeting-series', { data: { title: 'Minutes mention workspace' } });
    const series = (await created.json()).series;
    let meeting;
    try {
        meeting = (await (await request.post('/api/meetings', { data: { seriesId: series.id, date: '2099-06-01' } })).json()).meeting;
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const workspace = page.locator('meeting-occurrence-page');
        const minutes = workspace.locator('[data-el="minutes"]');
        await expect(minutes).toBeVisible();
        await minutes.fill('Følg opp @me');
        const suggestion = workspace.getByRole('listbox').getByRole('option');
        await expect(suggestion.first()).toBeVisible();
        await minutes.press('ArrowDown');
        await minutes.press('Enter');
        await expect(minutes).toHaveValue(/@me /);
        await workspace.locator('.mo-save-minutes').click();
        await expect.poll(async () => (await (await request.get(`/api/meetings/${meeting.id}`)).json()).minutes)
            .toContain('@me ');
        expect((await (await request.get('/api/people')).json()).some(p => p.key === 'me')).toBe(false);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting minutes text input opens the date picker with Ctrl+D', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Minutes date trigger workspace' },
    })).json()).series;
    let meeting;
    try {
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-01' },
        })).json()).meeting;
        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const minutes = page.locator('meeting-occurrence-page [data-el="minutes"]');
        await expect(minutes).toBeVisible();
        await minutes.fill('Follow up on ');
        await minutes.press('Control+d');

        const picker = page.locator('date-time-picker');
        await expect(picker).toBeVisible();
        await expect.poll(() => picker.evaluate(el => el.getAttribute('mode'))).toBe('date');
        const selectedDate = await picker.evaluate(el => el.value);
        await picker.evaluate(el => el.shadowRoot.querySelector('.ok').click());
        await expect(minutes).toHaveValue(`Follow up on ${selectedDate}`);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting-series agenda queue inputs support mentions and date insertion', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda queue input helpers' },
    })).json()).series;
    try {
        await page.goto(`/meeting-series#ms-${series.id}`);
        const dashboard = page.locator('meeting-series-page');
        const addInput = dashboard.locator('[data-el="agenda-add"]');
        await expect(addInput).toBeVisible();
        await addInput.fill('Discuss with @me');
        await addInput.press('ArrowDown');
        await addInput.press('Enter');
        await expect(addInput).toHaveValue(/@me /);
        await addInput.press('End');
        await addInput.press('Control+d');

        const picker = page.locator('date-time-picker');
        await expect(picker).toBeVisible();
        const selectedDate = await picker.evaluate(el => el.value);
        await picker.evaluate(el => el.shadowRoot.querySelector('.ok').click());
        await expect(addInput).toHaveValue(`Discuss with @me ${selectedDate}`);
        await dashboard.locator('.mp-agenda-add-btn').click();

        const editButton = dashboard.locator('.mp-agenda-edit').first();
        await expect(editButton).toBeVisible();
        await editButton.click();
        const editInput = dashboard.locator('.mp-agenda-edit-input');
        await expect(editInput).toHaveValue(`Discuss with @me ${selectedDate}`);
        await editInput.fill('Updated for @me');
        await editInput.press('ArrowDown');
        await editInput.press('Enter');
        await expect(editInput).toHaveValue(/@me /);
        await editInput.press('End');
        await editInput.press('Control+d');
        await expect(picker).toBeVisible();
        const editDate = await picker.evaluate(el => el.value);
        await picker.evaluate(el => el.shadowRoot.querySelector('.ok').click());
        await expect(editInput).toHaveValue(`Updated for @me ${editDate}`);
        await dashboard.locator('.mp-agenda-edit-save').click();

        await expect.poll(async () => {
            const updated = await (await request.get(`/api/meeting-series/${series.id}`)).json();
            return updated.agendaItems.find(item => item.state === 'queued')?.title;
        }).toBe(`Updated for @me ${editDate}`);
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting-series agenda queue shows each item and its added date', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda queue added date' },
    })).json()).series;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Review the migration plan' },
        })).json()).item;
        const addedDate = new Date(item.createdAt).toLocaleDateString('nb-NO');

        await page.goto(`/meeting-series#ms-${series.id}`);
        const row = page.locator('meeting-series-page .mp-agenda-row').filter({ hasText: item.title });
        await expect(row).toContainText(item.title);
        await expect(row).toContainText(`Lagt til ${addedDate}`);
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting-series agenda queue shows notes added to an item in occurrences', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda queue item notes' },
    })).json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Budget follow-up' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-01' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);
        await request.put(`/api/meetings/${meeting.id}/agenda/${item.id}`, {
            data: { notes: 'Need <numbers> from finance' },
        });
        await request.post(`/api/meetings/${meeting.id}/close`);

        await page.goto(`/meeting-series#ms-${series.id}`);
        const row = page.locator('meeting-series-page .mp-agenda-row').filter({ hasText: item.title });
        await expect(row.locator('.mp-agenda-note')).toContainText('2099-06-01');
        await expect(row.locator('.mp-agenda-note')).toContainText('Need <numbers> from finance');
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting-series separates resolved agenda items from the running queue', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda resolved split' },
    })).json()).series;
    let meeting;
    try {
        const solved = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Solved topic' },
        })).json()).item;
        const running = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Running topic' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-02' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);
        await request.put(`/api/meetings/${meeting.id}/agenda/${solved.id}`, {
            data: { outcome: 'resolved', notes: 'Agreed on plan' },
        });
        await request.post(`/api/meetings/${meeting.id}/close`);

        await page.goto(`/meeting-series#ms-${series.id}`);
        const host = page.locator('meeting-series-page');
        const resolvedSection = host.locator('.mp-resolved');
        await expect(resolvedSection.locator('.mp-agenda-row')).toHaveCount(1);
        await expect(host.locator('.mp-detail > div').last()).toHaveClass(/mp-resolved/);
        await expect(resolvedSection).toContainText(solved.title);
        await expect(resolvedSection).toContainText('Agreed on plan');
        await expect(resolvedSection).not.toContainText(running.title);
        const queueRows = host.locator('.mp-agenda-row:not(.mp-agenda-resolved)');
        await expect(queueRows).toHaveCount(1);
        await expect(queueRows).toContainText(running.title);
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting occurrence shows notes from earlier occurrences on agenda items', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Agenda earlier notes in workspace' },
    })).json()).series;
    const meetings = [];
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Carry-over topic' },
        })).json()).item;
        const first = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-03' },
        })).json()).meeting;
        meetings.push(first);
        await request.post(`/api/meetings/${first.id}/start`);
        await request.put(`/api/meetings/${first.id}/agenda/${item.id}`, {
            data: { outcome: 'deferred', notes: 'Waiting for <vendor> reply' },
        });
        await request.post(`/api/meetings/${first.id}/close`);

        const second = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-10' },
        })).json()).meeting;
        meetings.push(second);
        await request.post(`/api/meetings/${second.id}/start`);

        await page.goto(`/meeting-occurrence/${second.id}`);
        const agendaItem = page.locator('meeting-occurrence-page .mo-agenda-item').filter({ hasText: item.title });
        await expect(agendaItem.locator('.mo-prev-note')).toHaveCount(1);
        await expect(agendaItem.locator('.mo-prev-note')).toContainText('2099-06-03');
        await expect(agendaItem.locator('.mo-prev-note')).toContainText('Waiting for <vendor> reply');
        await expect(agendaItem.locator('textarea')).toHaveValue('');
    } finally {
        for (const m of meetings) await request.delete(`/api/meetings/${m.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('meeting occurrence agenda inputs support mentions and date insertion', async ({ page, request }) => {
    const series = (await (await request.post('/api/meeting-series', {
        data: { title: 'Occurrence agenda input helpers' },
    })).json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, {
            data: { title: 'Helper topic' },
        })).json()).item;
        meeting = (await (await request.post('/api/meetings', {
            data: { seriesId: series.id, date: '2099-06-04' },
        })).json()).meeting;
        await request.post(`/api/meetings/${meeting.id}/start`);

        await page.goto(`/meeting-occurrence/${meeting.id}`);
        const host = page.locator('meeting-occurrence-page');
        const picker = page.locator('date-time-picker');

        const notes = host.locator(`textarea[data-agenda="${item.id}"]`);
        await expect(notes).toBeVisible();
        await notes.fill('Ask @me');
        await notes.press('ArrowDown');
        await notes.press('Enter');
        await expect(notes).toHaveValue(/@me /);
        await notes.press('End');
        await notes.press('Control+d');
        await expect(picker).toBeVisible();
        const notesDate = await picker.evaluate(el => el.value);
        await picker.evaluate(el => el.shadowRoot.querySelector('.ok').click());
        await expect(notes).toHaveValue(`Ask @me ${notesDate}`);

        const addInput = host.locator('[data-el="agenda-add"]');
        await addInput.fill('New for @me');
        await addInput.press('ArrowDown');
        await addInput.press('Enter');
        await expect(addInput).toHaveValue(/@me /);
        await addInput.press('End');
        await addInput.press('Control+d');
        await expect(picker).toBeVisible();
        const addDate = await picker.evaluate(el => el.value);
        await picker.evaluate(el => el.shadowRoot.querySelector('.ok').click());
        await expect(addInput).toHaveValue(`New for @me ${addDate}`);
        await host.locator('.mo-agenda-add-btn').click();

        await expect.poll(async () => {
            const updated = await (await request.get(`/api/meetings/${meeting.id}`)).json();
            const m = updated.meeting || updated;
            return {
                notes: m.agenda.find(a => a.agendaItemId === item.id)?.notes,
                added: m.agenda.some(a => a.title === `New for @me ${addDate}`),
            };
        }).toEqual({ notes: `Ask @me ${notesDate}`, added: true });
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});
