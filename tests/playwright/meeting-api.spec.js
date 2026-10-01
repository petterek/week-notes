const { test, expect } = require('@playwright/test');

test('plain meetings reject lifecycle decision endpoints', async ({ request }) => {
    const suffix = `plain-${Date.now()}`;
    const createResp = await request.post('/api/meetings', {
        data: {
            title: `Plain guard ${suffix}`,
            date: '2099-07-01',
            start: '10:00',
            end: '11:00',
        }
    });

    expect(createResp.ok()).toBe(true);
    const created = await createResp.json();

    try {
        const addDecisionResp = await request.post(`/api/meetings/${created.meeting.id}/decisions`, {
            data: { text: 'Should be rejected' }
        });
        expect(addDecisionResp.status()).toBe(400);
        expect((await addDecisionResp.json()).error).toContain('not a series occurrence');

        const deleteDecisionResp = await request.delete(`/api/meetings/${created.meeting.id}/decisions/d_404`);
        expect(deleteDecisionResp.status()).toBe(400);
        expect((await deleteDecisionResp.json()).error).toContain('not a series occurrence');
    } finally {
        await request.delete(`/api/meetings/${created.meeting.id}`);
    }
});

test('decision can link to an agenda item in its meeting and unlink again', async ({ request }) => {
    const created = await request.post('/api/meeting-series', { data: { title: 'Agenda decision links' } });
    const series = (await created.json()).series;
    let meeting;
    try {
        const item = (await (await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Item A' } })).json()).item;
        meeting = (await (await request.post('/api/meetings', { data: { seriesId: series.id, date: '2099-07-01' } })).json()).meeting;
        expect((await request.post(`/api/meetings/${meeting.id}/decisions`, { data: { text: 'Invalid', agendaItemId: 'ai_missing' } })).status()).toBe(400);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).decisions).toHaveLength(0);
        const linked = await request.post(`/api/meetings/${meeting.id}/decisions`, { data: { text: 'Linked on creation', agendaItemId: item.id } });
        expect(linked.ok()).toBe(true);
        expect((await linked.json()).decision.agendaItemId).toBe(item.id);
        const decision = (await (await request.post(`/api/meetings/${meeting.id}/decisions`, { data: { text: 'Agreed' } })).json()).decision;
        const url = `/api/meetings/${meeting.id}/decisions/${decision.id}`;
        const invalid = await request.put(url, { data: { agendaItemId: 'ai_missing' } });
        expect(invalid.status()).toBe(400);
        expect((await request.put(url, { data: {} })).status()).toBe(400);
        expect((await request.put(url, { data: null })).status()).toBe(400);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).decisions[1].agendaItemId).toBeUndefined();
        expect((await request.put(url, { data: { agendaItemId: item.id } })).ok()).toBe(true);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).decisions[1].agendaItemId).toBe(item.id);
        const minutes = await (await request.get(`/meetings/${meeting.id}/minutes`)).text();
        expect(minutes).toContain('Agreed');
        expect(minutes).toContain('(Item A)');
        expect((await (await request.post(`/api/meetings/${meeting.id}/close`)).json()).ok).toBe(true);
        expect((await request.put(url, { data: { agendaItemId: null } })).status()).toBe(400);
        await request.post(`/api/meetings/${meeting.id}/reopen`);
        expect((await request.put(url, { data: { agendaItemId: null } })).ok()).toBe(true);
        expect((await (await request.get(`/api/meetings/${meeting.id}`)).json()).decisions[1].agendaItemId).toBeUndefined();
    } finally {
        if (meeting) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('closed occurrences reject direct field and agenda edits', async ({ request }) => {
    const seriesResp = await request.post('/api/meeting-series', {
        data: { title: `Closed-lock series ${Date.now()}` }
    });
    expect(seriesResp.ok()).toBe(true);
    const series = (await seriesResp.json()).series;

    const occResp = await request.post('/api/meetings', {
        data: { date: '2099-07-02', seriesId: series.id }
    });
    expect(occResp.ok()).toBe(true);
    const occ = (await occResp.json()).meeting;

    try {
        await request.post(`/api/meetings/${occ.id}/close`);

        const updateResp = await request.put(`/api/meetings/${occ.id}`, {
            data: { title: 'Should not save' }
        });
        expect(updateResp.status()).toBe(400);
        expect((await updateResp.json()).error).toContain('read-only');

        const agendaResp = await request.post(`/api/meetings/${occ.id}/agenda`, {
            data: { title: 'Should not save' }
        });
        expect(agendaResp.status()).toBe(400);
        expect((await agendaResp.json()).error).toContain('read-only');

        const decisionResp = await request.post(`/api/meetings/${occ.id}/decisions`, {
            data: { text: 'Should not save' }
        });
        expect(decisionResp.status()).toBe(400);
        expect((await decisionResp.json()).error).toContain('read-only');
    } finally {
        await request.delete(`/api/meetings/${occ.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('series agenda queue preserves order after delete and add', async ({ request }) => {
    const seriesResp = await request.post('/api/meeting-series', {
        data: { title: `Queue-order series ${Date.now()}` }
    });

    expect(seriesResp.ok()).toBe(true);
    const series = (await seriesResp.json()).series;

    try {
        const add1 = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'One' } });
        const item1 = (await add1.json()).item;
        const add2 = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Two' } });
        const item2 = (await add2.json()).item;
        const add3 = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Three' } });
        const item3 = (await add3.json()).item;

        expect(item1.order).toBe(0);
        expect(item2.order).toBe(1);
        expect(item3.order).toBe(2);

        const del = await request.delete(`/api/meeting-series/${series.id}/agenda/${item2.id}`);
        expect(del.ok()).toBe(true);

        const add4 = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title: 'Four' } });
        const item4 = (await add4.json()).item;
        expect(item4.order).toBe(2);

        const seriesAfter = await (await request.get(`/api/meeting-series/${series.id}`)).json();
        expect(seriesAfter.agendaItems.map(item => item.order)).toEqual([0, 1, 2]);
        expect(seriesAfter.agendaItems.map(item => item.title)).toEqual(['One', 'Three', 'Four']);
    } finally {
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('deleting a series clears links from occurrences and tasks', async ({ request }) => {
    const seriesResp = await request.post('/api/meeting-series', {
        data: { title: `Delete-link series ${Date.now()}` }
    });
    expect(seriesResp.ok()).toBe(true);
    const series = (await seriesResp.json()).series;

    const occResp = await request.post('/api/meetings', {
        data: { date: '2099-07-03', seriesId: series.id }
    });
    expect(occResp.ok()).toBe(true);
    const occ = (await occResp.json()).meeting;

    const taskResp = await request.post('/api/tasks', {
        data: { text: 'Delete-link task', meetingId: occ.id, meetingSeriesId: series.id }
    });
    expect(taskResp.ok()).toBe(true);
    const tasks = await taskResp.json();
    const task = tasks.find(t => t.text === 'Delete-link task');
    expect(task).toBeTruthy();

    try {
        expect((await request.put(`/api/meetings/${occ.id}`, { data: { minutes: 'Preserve this record' } })).ok()).toBe(true);
        expect((await request.post(`/api/meetings/${occ.id}/close`)).ok()).toBe(true);
        expect((await request.delete(`/api/meeting-series/${series.id}`)).ok()).toBe(true);
        const updatedMeeting = await (await request.get(`/api/meetings/${occ.id}`)).json();
        expect(updatedMeeting.seriesId).toBeUndefined();
        expect(updatedMeeting.minutes).toBe('Preserve this record');
        const updatedTasks = await (await request.get('/api/tasks')).json();
        const updatedTask = updatedTasks.find(t => t.id === task.id);
        expect(updatedTask.meetingSeriesId).toBeUndefined();
        expect(updatedTask.meetingId).toBe(occ.id);
        const edit = await request.put(`/api/meetings/${occ.id}`, { data: { title: 'Ordinary meeting after unlink' } });
        expect(edit.ok(), 'unlinked meetings must retain ordinary calendar editing').toBe(true);
    } finally {
        await request.delete(`/api/meetings/${occ.id}`);
        await request.delete(`/api/tasks/${task.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});

test('editing one agenda outcome does not overwrite another occurrence outcome', async ({ request }) => {
    const seriesResponse = await request.post('/api/meeting-series', {
        data: { title: `Independent outcomes ${Date.now()}` },
    });
    expect(seriesResponse.ok()).toBeTruthy();
    const series = (await seriesResponse.json()).series;
    const meetings = [];
    try {
        const addItem = async title => {
            const response = await request.post(`/api/meeting-series/${series.id}/agenda`, { data: { title } });
            expect(response.ok()).toBeTruthy();
            return (await response.json()).item;
        };
        const first = await addItem('First topic');
        const second = await addItem('Second topic');
        for (const date of ['2099-07-04', '2099-07-05']) {
            const response = await request.post('/api/meetings', { data: { seriesId: series.id, date } });
            expect(response.ok()).toBeTruthy();
            meetings.push((await response.json()).meeting);
        }
        const secondUpdate = await request.put(`/api/meetings/${meetings[1].id}/agenda/${second.id}`, {
            data: { outcome: 'resolved' },
        });
        expect(secondUpdate.ok()).toBeTruthy();
        const firstUpdate = await request.put(`/api/meetings/${meetings[0].id}/agenda/${first.id}`, {
            data: { outcome: 'resolved' },
        });
        expect(firstUpdate.ok()).toBeTruthy();
        const after = await (await request.get(`/api/meeting-series/${series.id}`)).json();
        expect(after.agendaItems.map(item => item.state)).toEqual(['resolved', 'resolved']);
    } finally {
        for (const meeting of meetings) await request.delete(`/api/meetings/${meeting.id}`);
        await request.delete(`/api/meeting-series/${series.id}`);
    }
});
