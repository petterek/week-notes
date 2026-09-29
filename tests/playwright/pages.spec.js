// Page-level smoke tests against the real app.
// Verifies routes return 200 and the document contains expected anchors.
const { test, expect } = require('@playwright/test');
const { createCleanupStack, SEEDED_PEOPLE, SEEDED_TEAM } = require('../helpers/playwright-fixtures');

const PAGES = [
    { path: '/',         title: /Ukenotater|Hjem/ },
    { path: '/tasks',    title: /Oppgaver/ },
    { path: '/people',   title: /Personer|People/ },
    { path: '/calendar', title: /Kalender/ },
    { path: '/settings', title: /Innstillinger|Settings/ },
    { path: '/goals',    title: /Mål|Goals/ },
    { path: '/results',  title: /Resultater|Results/ },
    { path: '/calendar/all', title: /Kalender|Calendar/ },
    { path: '/debug/help-modal', title: /./ },
];

for (const p of PAGES) {
    test(`page smoke ${p.path}`, async ({ page }) => {
        const resp = await page.goto(p.path, { waitUntil: 'domcontentloaded' });
        expect(resp.ok(), `${p.path} should return 2xx`).toBe(true);
        await expect(page).toHaveTitle(p.title);
    });
}

// Regression: @mentions inside [[result]] markers must render as mention
// chips in the editor preview, not as encoded text in the attribute.
// The <inline-action> component expands @names in its label to <entity-mention>.
test('inline-action renders @mentions in label as entity-mention chips', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Inject a test <inline-action> with a @mention in the label
    await page.evaluate(() => {
        const el = document.createElement('inline-action');
        el.setAttribute('kind', 'result');
        el.setAttribute('label', 'resultat @TestPerson her');
        el.id = 'test-mention-pill';
        document.body.appendChild(el);
    });
    // Wait for custom element to upgrade and render
    await page.waitForTimeout(1000);
    // Check that <entity-mention> appears inside the shadow DOM
    const hasMention = await page.evaluate(() => {
        const el = document.getElementById('test-mention-pill');
        if (!el || !el.shadowRoot) return 'no shadow root';
        const mention = el.shadowRoot.querySelector('entity-mention');
        if (!mention) return 'no entity-mention found, innerHTML: ' + el.shadowRoot.innerHTML.slice(0, 200);
        return mention.getAttribute('key') === 'testperson' ? true : 'wrong key: ' + mention.getAttribute('key');
    });
    expect(hasMention, 'inline-action should render @TestPerson as <entity-mention>').toBe(true);
});

// Regression: /api/teams/:key/status returns team relations.
test('team status API returns team data', async ({ request }) => {
    const statusResp = await request.get(`/api/teams/${encodeURIComponent(SEEDED_TEAM.key)}/status`);
    expect(statusResp.ok(), `/api/teams/${SEEDED_TEAM.key}/status should return 200`).toBe(true);
    const data = await statusResp.json();
    expect(data.team).toBeTruthy();
    expect(data.team.key).toBe(SEEDED_TEAM.key);
    expect(Array.isArray(data.memberDetails)).toBe(true);
    expect(Array.isArray(data.notesMentioning)).toBe(true);
    expect(Array.isArray(data.meetings)).toBe(true);
    expect(Array.isArray(data.tasks)).toBe(true);
});

// Regression: task-complete-modal must appear above note-view (z-index stacking).
// Previously the modal had a hardcoded z-index lower than note-view, making it
// unclickable when triggered from an inline-task inside a note.
test('task-complete-modal z-index stacks above note-view', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // Wait for custom elements to be defined
    await page.waitForFunction(() =>
        customElements.get('note-view') && customElements.get('task-complete-modal')
    );
    // Programmatically open note-view then task-complete-modal and compare z-indexes
    const result = await page.evaluate(async () => {
        // Open note-view via the global helper (creates element dynamically)
        if (typeof window.openNoteViewModal !== 'function') return { error: 'no openNoteViewModal fn' };
        window.openNoteViewModal('2026-W01', 'fake.md');
        await new Promise(r => setTimeout(r, 500));
        const nv = document.querySelector('note-view');
        if (!nv) return { error: 'no note-view element after open' };
        const nvBd = nv.shadowRoot && nv.shadowRoot.querySelector('.nv-backdrop');
        const nvZ = nvBd ? parseInt(nvBd.style.zIndex, 10) : 0;

        // Open task-complete-modal via its singleton getter
        const getTcm = window.getTaskCompleteModal;
        if (typeof getTcm !== 'function') return { error: 'no getTaskCompleteModal fn' };
        const tcm = getTcm();
        tcm.open({ id: 'test-z', title: 'Z-index test task' });
        await new Promise(r => setTimeout(r, 300));
        const tcmBd = tcm.shadowRoot && tcm.shadowRoot.querySelector('.backdrop');
        const tcmZ = tcmBd ? parseInt(tcmBd.style.zIndex, 10) : 0;

        return { nvZ, tcmZ };
    });
    expect(result.error).toBeUndefined();
    expect(result.tcmZ).toBeGreaterThan(result.nvZ);
});

// Regression: saving a meeting with an attendee whose key contains a space must NOT
// create a truncated stub person. E.g., attendee key "per jørgen" must NOT produce
// a new person with key "per" via syncMentions word-boundary truncation.
test('saving meeting with space-in-key attendee does not create stub person', async ({ request }) => {
    const cleanup = createCleanupStack();
    try {
        const peopleBefore = await (await request.get('/api/people')).json();
        const countBefore = peopleBefore.length;

        const resp = await request.post('/api/meetings', {
            data: {
                title: 'Regression test meeting (auto-delete)',
                date: '2099-01-01',
                start: '10:00',
                end: '11:00',
                type: 'meeting',
                attendees: [SEEDED_PEOPLE.spaceKey.key],
                notes: '',
            }
        });
        expect(resp.ok()).toBe(true);
        const created = await resp.json();
        cleanup.add(async () => { await request.delete(`/api/meetings/${created.meeting.id}`); });

        const peopleAfter = await (await request.get('/api/people')).json();
        expect(peopleAfter.length).toBe(countBefore);
    } finally {
        await cleanup.run();
    }
});

// Regression: updating a person whose firstName matches another person's firstName
// must NOT assign a duplicate key (e.g., both "Ole Hansen" and "Ole Johansen" getting key="ole").
// The update handler must use the same uniqueness logic as create (excluding self).
test('editing person with duplicate firstName preserves unique keys', async ({ request }) => {
    const cleanup = createCleanupStack();
    try {
        const r1 = await request.post('/api/people', {
            data: { firstName: 'RegTestOle', lastName: 'Hansen' }
        });
        expect(r1.ok()).toBe(true);
        const p1 = (await r1.json()).person;
        cleanup.add(async () => { await request.delete(`/api/people/${p1.id}`); });

        const r2 = await request.post('/api/people', {
            data: { firstName: 'RegTestOle', lastName: 'Johansen' }
        });
        expect(r2.ok()).toBe(true);
        const p2 = (await r2.json()).person;
        cleanup.add(async () => { await request.delete(`/api/people/${p2.id}`); });

        expect(p1.key).not.toBe(p2.key);

        const upd = await request.put(`/api/people/${p2.id}`, {
            data: { ...p2, email: 'ole.j@example.com' }
        });
        expect(upd.ok()).toBe(true);
        const updated = (await upd.json()).person;
        expect(updated.key).not.toBe(p1.key);
    } finally {
        await cleanup.run();
    }
});

// Regression: inline-task rendered in a note must reflect live task.done status,
// not just the stale {{?id}} marker in the note file. If a task is closed via the
// tasks page (which doesn't flip the note marker), the note should still show the
// task as checked when opened.
test('inline-task in note reflects live done status ignoring stale open marker', async ({ page, request }) => {
    const week = '2099-W01';
    const cleanup = createCleanupStack();
    const noteFile = 'inline-task-regression-test.md';

    try {
        const createResp = await request.post('/api/tasks', {
            data: { text: 'Regression inline-task state', week }
        });
        expect(createResp.ok()).toBe(true);
        const tasks = await createResp.json();
        const task = tasks.find(t => t.text === 'Regression inline-task state' && !t.done);
        expect(task).toBeTruthy();
        const taskId = task.id;
        cleanup.add(async () => { await request.delete(`/api/tasks/${taskId}`); });

        const toggleResp = await request.put(`/api/tasks/${taskId}/toggle`, { data: {} });
        expect(toggleResp.ok()).toBe(true);

        const saveResp = await request.post('/api/save', {
            data: { folder: week, file: noteFile, content: `# Test\n\n{{?${taskId}}}\n` }
        });
        expect(saveResp.ok()).toBe(true);
        cleanup.add(async () => {
            try {
                await request.delete(`/api/notes/${week}/${encodeURIComponent(noteFile)}`);
            } catch {}
        });

        await page.goto(`/${week}/${noteFile}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            () => !!document.querySelector('inline-task'),
            { timeout: 5000 }
        );
        await page.waitForTimeout(2000);

        const isChecked = await page.evaluate(() => {
            const el = document.querySelector('inline-task');
            if (!el || !el.shadowRoot) return null;
            const cb = el.shadowRoot.querySelector('input[type="checkbox"]');
            return cb ? cb.checked : null;
        });
        expect(isChecked, 'inline-task should show as checked when task is done, even with stale open marker').toBe(true);
    } finally {
        await cleanup.run();
    }
});
