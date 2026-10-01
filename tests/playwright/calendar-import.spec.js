const { test, expect } = require('@playwright/test');

const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:import-utc@example.com
DTSTART:20990601T080000Z
DTEND:20990601T090000Z
SUMMARY:Review\\, planning
DESCRIPTION:First line\\nSecond line
LOCATION:Room A
END:VEVENT
BEGIN:VEVENT
UID:import-all-day@example.com
DTSTART;VALUE=DATE:20990602
DTEND;VALUE=DATE:20990604
SUMMARY:Conference
END:VEVENT
END:VCALENDAR`;

test('calendar imports ICS events, skips repeated UIDs and keeps events editable', async ({ page, request }) => {
    const uids = ['import-utc@example.com', 'import-all-day@example.com'];
    try {
        await page.goto('/calendar/2099-W23');
        const calendar = page.locator('week-notes-calendar');
        const upload = calendar.locator('input[type=file]');
        await expect(calendar.getByRole('button', { name: /Importer kalenderfil/ })).toBeVisible();
        await upload.setInputFiles({ name: 'events.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
        const preview = calendar.getByRole('dialog', { name: 'Forhåndsvis kalenderimport' });
        await expect(preview).toContainText('Review, planning');
        await expect(preview).toContainText('Conference');
        expect((await (await request.get('/api/meetings')).json()).filter(m => uids.includes(m.calendarUid))).toHaveLength(0);
        await preview.getByRole('button', { name: 'Avbryt' }).click();
        await expect(preview).toHaveCount(0);
        expect((await (await request.get('/api/meetings')).json()).filter(m => uids.includes(m.calendarUid))).toHaveLength(0);
        await upload.setInputFiles({ name: 'events.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
        await expect(preview).toContainText('Room A');
        await preview.getByRole('button', { name: 'Importer 2 møter' }).click();
        await expect(calendar.getByRole('status')).toContainText('2');
        const imported = (await (await request.get('/api/meetings')).json()).filter(m => uids.includes(m.calendarUid));
        expect(imported).toHaveLength(2);
        expect(imported.find(m => m.calendarUid === uids[0])).toMatchObject({
            date: '2099-06-01', start: '10:00', end: '11:00',
            title: 'Review, planning', notes: 'First line\nSecond line', location: 'Room A',
        });
        expect(imported.find(m => m.calendarUid === uids[1])).toMatchObject({
            date: '2099-06-02', endDate: '2099-06-03', start: '', end: '',
        });
        await upload.setInputFiles({ name: 'events.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
        await expect(preview).toContainText('Allerede importert');
        await preview.getByRole('button', { name: 'Avbryt' }).click();
        await expect(calendar.getByRole('status')).toContainText('Import avbrutt');
        expect((await (await request.get('/api/meetings')).json()).filter(m => uids.includes(m.calendarUid))).toHaveLength(2);
        await calendar.evaluate((el, id) => el._openEdit(id), imported[0].id);
        await expect(calendar.locator('meeting-edit input[name=title]')).toHaveValue('Review, planning');
    } finally {
        for (const m of (await (await request.get('/api/meetings')).json()).filter(m => uids.includes(m.calendarUid))) {
            await request.delete(`/api/meetings/${m.id}`);
        }
    }
});

test('calendar import accepts VCS, reports invalid files without partial writes', async ({ request }) => {
    const vcs = `BEGIN:VCALENDAR\r\nVERSION:1.0\r\nBEGIN:VEVENT\r\nUID:legacy-vcs@example.com\r\nDTSTART:20990605T120000\r\nDTEND:20990605T130000\r\nSUMMARY:Legacy meeting\r\nRRULE:D1 #5\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    try {
        const preview = await request.post('/api/meetings/import/preview', { data: { content: vcs, timeZone: 'Europe/Oslo' } });
        expect(preview.ok()).toBe(true);
        expect(await preview.json()).toMatchObject({ recurring: 1, events: [{ title: 'Legacy meeting', duplicate: false }] });
        expect((await (await request.get('/api/meetings')).json()).some(m => m.calendarUid === 'legacy-vcs@example.com')).toBe(false);
        const imported = await request.post('/api/meetings/import', { data: { content: vcs, timeZone: 'Europe/Oslo' } });
        expect(imported.ok()).toBe(true);
        expect(await imported.json()).toMatchObject({ imported: 1, skipped: 0, recurring: 1 });
        const bad = await request.post('/api/meetings/import', { data: {
            content: vcs.replace('Legacy meeting', 'Modified').replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nSUMMARY:Broken\r\nEND:VEVENT\r\nEND:VCALENDAR'),
            timeZone: 'Europe/Oslo',
        } });
        expect(bad.status()).toBe(400);
        expect((await (await request.get('/api/meetings')).json()).filter(m => m.calendarUid === 'legacy-vcs@example.com')).toHaveLength(1);
        expect((await request.post('/api/meetings/import', { data: { content: vcs, timeZone: 'Not/AZone' } })).status()).toBe(400);
    } finally {
        for (const m of (await (await request.get('/api/meetings')).json()).filter(m => m.calendarUid === 'legacy-vcs@example.com')) {
            await request.delete(`/api/meetings/${m.id}`);
        }
    }
});

test('calendar preview shows the validation error returned by the server', async ({ page }) => {
    await page.goto('/calendar');
    const calendar = page.locator('week-notes-calendar');
    await calendar.locator('input[type=file]').setInputFiles({
        name: 'invalid.ics',
        mimeType: 'text/calendar',
        buffer: Buffer.from(ics.replace('UID:import-utc@example.com\n', '')),
    });
    await expect(calendar.getByRole('status')).toContainText('Hendelsen mangler UID, starttid eller tittel');
    await expect(calendar.getByRole('dialog', { name: 'Forhåndsvis kalenderimport' })).toHaveCount(0);
});

test('calendar preview accepts Outlook Windows time zones without saving', async ({ request }) => {
    const content = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:outlook-windows-zone@example.com
DTSTART;TZID="W. Europe Standard Time":20990601T100000
DTEND;TZID="W. Europe Standard Time":20990601T110000
SUMMARY:Outlook event
END:VEVENT
END:VCALENDAR`;
    const preview = await request.post('/api/meetings/import/preview', {
        data: { content, timeZone: 'Europe/Oslo' },
    });
    expect(preview.ok()).toBe(true);
    expect(await preview.json()).toMatchObject({
        events: [{ title: 'Outlook event', date: '2099-06-01', start: '10:00', end: '11:00', duplicate: false }],
    });
    const meetings = await (await request.get('/api/meetings')).json();
    expect(meetings.some(m => m.calendarUid === 'outlook-windows-zone@example.com')).toBe(false);
});

test('calendar import offers the Teams join link in preview and editor', async ({ page, request }) => {
    const joinUrl = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_test%40thread.v2/0?context=example';
    const otherUrl = 'https://teams.microsoft.com/l/meetup-join/other';
    const content = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:teams-join-test@example.com
DTSTART:20990601T080000Z
DTEND:20990601T090000Z
SUMMARY:Teams meeting
DESCRIPTION:Join meeting <${otherUrl}>\\nKeep this invitation
X-MICROSOFT-SKYPETEAMSMEETINGURL:${joinUrl}
END:VEVENT
END:VCALENDAR`;
    try {
        await page.goto('/calendar/2099-W23');
        const calendar = page.locator('week-notes-calendar');
        await calendar.locator('input[type=file]').setInputFiles({ name: 'teams.ics', mimeType: 'text/calendar', buffer: Buffer.from(content) });
        const preview = calendar.getByRole('dialog', { name: 'Forhåndsvis kalenderimport' });
        await expect(preview.getByRole('link', { name: 'Bli med i Teams-møtet' })).toHaveAttribute('href', joinUrl);
        expect((await (await request.get('/api/meetings')).json()).some(m => m.calendarUid === 'teams-join-test@example.com')).toBe(false);
        await preview.getByRole('button', { name: 'Importer 1 møter' }).click();
        const meeting = (await (await request.get('/api/meetings')).json()).find(m => m.calendarUid === 'teams-join-test@example.com');
        expect(meeting).toMatchObject({ joinUrl, notes: `Join meeting <${otherUrl}>\nKeep this invitation` });
        await calendar.evaluate((el, id) => el._openEdit(id), meeting.id);
        await expect(calendar.locator('meeting-edit').getByRole('link', { name: 'Bli med i Teams-møtet' })).toHaveAttribute('href', joinUrl);
    } finally {
        for (const m of (await (await request.get('/api/meetings')).json()).filter(m => m.calendarUid === 'teams-join-test@example.com')) {
            await request.delete(`/api/meetings/${m.id}`);
        }
    }
});

test('calendar preview falls back to a Teams link in the description and ignores unsafe URLs', async ({ request }) => {
    const content = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:teams-fallback-test@example.com
DTSTART:20990601T080000Z
SUMMARY:Fallback
DESCRIPTION:Join <https://teams.microsoft.com/l/meetup-join/fallback?context=ok>\\nOther https://teams.microsoft.com.evil.test/l/meetup-join/evil
X-MICROSOFT-SKYPETEAMSMEETINGURL:javascript:alert(1)
END:VEVENT
BEGIN:VEVENT
UID:teams-unsafe-test@example.com
DTSTART:20990601T080000Z
SUMMARY:Unsafe
DESCRIPTION:https://teams.microsoft.com.evil.test/l/meetup-join/evil
END:VEVENT
END:VCALENDAR`;
    const preview = await request.post('/api/meetings/import/preview', { data: { content, timeZone: 'Europe/Oslo' } });
    expect(preview.ok()).toBe(true);
    const { events } = await preview.json();
    expect(events[0].joinUrl).toBe('https://teams.microsoft.com/l/meetup-join/fallback?context=ok');
    expect(events[1].joinUrl).toBeUndefined();
});

test('calendar import handles TZID, folded lines, cancelled events and rejects oversized files', async ({ request }) => {
    const content = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:timezone@example.com
DTSTART;TZID=America/New_York:20990115T090000
DTEND;TZID=America/New_York:20990115T100000
SUMMARY:Time zone
 folded
END:VEVENT
BEGIN:VEVENT
UID:cancelled@example.com
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;
    try {
        const response = await request.post('/api/meetings/import', { data: { content, timeZone: 'Europe/Oslo' } });
        expect(response.ok()).toBe(true);
        expect(await response.json()).toMatchObject({ imported: 1, skipped: 0 });
        const meetings = await (await request.get('/api/meetings')).json();
        expect(meetings.find(m => m.calendarUid === 'timezone@example.com')).toMatchObject({
            date: '2099-01-15', start: '15:00', end: '16:00', title: 'Time zonefolded',
        });
        expect(meetings.some(m => m.calendarUid === 'cancelled@example.com')).toBe(false);
        const tooLarge = await request.post('/api/meetings/import', {
            data: { content: 'x'.repeat(512 * 1024 + 1), timeZone: 'Europe/Oslo' },
        });
        expect(tooLarge.status()).toBe(413);
    } finally {
        for (const m of (await (await request.get('/api/meetings')).json()).filter(m => m.calendarUid === 'timezone@example.com')) {
            await request.delete(`/api/meetings/${m.id}`);
        }
    }
});
