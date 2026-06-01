// Page-level smoke tests against the real app.
// Verifies routes return 200 and the document contains expected anchors.
const { test, expect } = require('@playwright/test');

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
    // First get a team key from the teams list
    const teamsResp = await request.get('/api/teams');
    expect(teamsResp.ok()).toBe(true);
    const teams = await teamsResp.json();
    if (teams.length === 0) {
        test.skip();
        return;
    }
    const key = teams[0].key;
    const statusResp = await request.get(`/api/teams/${encodeURIComponent(key)}/status`);
    expect(statusResp.ok(), `/api/teams/${key}/status should return 200`).toBe(true);
    const data = await statusResp.json();
    expect(data.team).toBeTruthy();
    expect(data.team.key).toBe(key);
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
    const peopleBefore = await (await request.get('/api/people')).json();
    const countBefore = peopleBefore.length;

    // Use the first person whose key contains a space, or skip if none exist
    const spaceKeyPerson = peopleBefore.find(p => p.key && p.key.includes(' '));
    if (!spaceKeyPerson) {
        test.skip();
        return;
    }

    // POST a meeting with that person as attendee — title/notes have no @mentions
    const resp = await request.post('/api/meetings', {
        data: {
            title: 'Regression test meeting (auto-delete)',
            date: '2099-01-01',
            start: '10:00',
            end: '11:00',
            type: 'meeting',
            attendees: [spaceKeyPerson.key],
            notes: '',
        }
    });
    expect(resp.ok()).toBe(true);
    const created = await resp.json();

    // People count must not have changed
    const peopleAfter = await (await request.get('/api/people')).json();
    expect(peopleAfter.length).toBe(countBefore);

    // Clean up
    await request.delete(`/api/meetings/${created.meeting.id}`);
});

// Regression: updating a person whose firstName matches another person's firstName
// must NOT assign a duplicate key (e.g., both "Ole Hansen" and "Ole Johansen" getting key="ole").
// The update handler must use the same uniqueness logic as create (excluding self).
test('editing person with duplicate firstName preserves unique keys', async ({ request }) => {
    // Create two people with the same first name
    const r1 = await request.post('/api/people', {
        data: { firstName: 'RegTestOle', lastName: 'Hansen' }
    });
    expect(r1.ok()).toBe(true);
    const p1 = (await r1.json()).person;

    const r2 = await request.post('/api/people', {
        data: { firstName: 'RegTestOle', lastName: 'Johansen' }
    });
    expect(r2.ok()).toBe(true);
    const p2 = (await r2.json()).person;

    // Keys must differ (uniqueness on create)
    expect(p1.key).not.toBe(p2.key);

    // Now edit p2 (change email) — this used to reset key to firstName.toLowerCase()
    // causing a collision with p1
    const upd = await request.put(`/api/people/${p2.id}`, {
        data: { ...p2, email: 'ole.j@example.com' }
    });
    expect(upd.ok()).toBe(true);
    const updated = (await upd.json()).person;

    // Keys must still be distinct after edit
    expect(updated.key).not.toBe(p1.key);

    // Clean up
    await request.delete(`/api/people/${p1.id}`);
    await request.delete(`/api/people/${p2.id}`);
});

