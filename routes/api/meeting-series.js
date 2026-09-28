'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const {
        loadMeetingSeries, saveMeetingSeries, meetingSeriesId, agendaItemId,
        loadMeetings, saveMeetings, loadTasks, saveTasks,
        extractMentions, readBody,
    } = _core;

    // Compute lightweight rollup fields for the series list view: number of
    // queued agenda items and the next/most-recent related occurrence date.
    function withRollup(s, meetings) {
        const related = meetings.filter(m => m.seriesId === s.id);
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = related
            .filter(m => m.status !== 'closed')
            .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))[0];
        const past = related
            .filter(m => m.status === 'closed')
            .sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')))[0];
        const queuedCount = (s.agendaItems || []).filter(a => a.state === 'queued').length;
        return {
            ...s,
            occurrenceCount: related.length,
            queuedAgendaCount: queuedCount,
            nextOccurrence: upcoming ? { id: upcoming.id, date: upcoming.date, start: upcoming.start, status: upcoming.status } : null,
            lastOccurrence: past ? { id: past.id, date: past.date, status: past.status } : null,
        };
    }

    return async function(req, res, ctx) {
        const { pathname } = ctx;

        // GET /api/meeting-series — list all series with rollup fields
        if (pathname === '/api/meeting-series' && req.method === 'GET') {
            const meetings = loadMeetings();
            const series = loadMeetingSeries().map(s => withRollup(s, meetings));
            series.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || (a.title || '').localeCompare(b.title || ''));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(series));
            return;
        }

        // POST /api/meeting-series — create a new series
        if (pathname === '/api/meeting-series' && req.method === 'POST') {
            const data = JSON.parse(await readBody(req) || '{}');
            const title = String(data.title || '').trim();
            if (!title) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'title required' }));
                return;
            }
            const series = loadMeetingSeries();
            const s = {
                id: meetingSeriesId(),
                title,
                description: (data.description || '').trim(),
                status: 'active',
                defaultAttendees: Array.isArray(data.defaultAttendees) ? data.defaultAttendees : extractMentions(data.description || ''),
                defaultLocation: (data.defaultLocation || '').trim(),
                defaultPlaceKey: (data.defaultPlaceKey || '').trim().toLowerCase(),
                defaultType: (data.defaultType || 'meeting').trim(),
                defaultDurationMins: Number.isFinite(data.defaultDurationMins) && data.defaultDurationMins > 0 ? data.defaultDurationMins : 60,
                agendaItems: [],
                created: new Date().toISOString(),
            };
            series.push(s);
            saveMeetingSeries(series);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, series: s }));
            return;
        }

        // GET /api/meeting-series/:id — single series + rollup
        const oneMatch = pathname.match(/^\/api\/meeting-series\/([^/]+)$/);
        if (oneMatch && req.method === 'GET') {
            const s = loadMeetingSeries().find(x => x.id === oneMatch[1]);
            if (!s) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(withRollup(s, loadMeetings())));
            return;
        }

        // PUT /api/meeting-series/:id — update series fields
        if (oneMatch && req.method === 'PUT') {
            const series = loadMeetingSeries();
            const s = series.find(x => x.id === oneMatch[1]);
            if (!s) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }
            const data = JSON.parse(await readBody(req) || '{}');
            if (data.title !== undefined) s.title = String(data.title).trim();
            if (data.description !== undefined) s.description = String(data.description || '').trim();
            if (data.status !== undefined && ['active', 'archived'].includes(data.status)) s.status = data.status;
            if (data.defaultAttendees !== undefined) {
                s.defaultAttendees = Array.isArray(data.defaultAttendees) ? data.defaultAttendees : [];
            }
            if (data.defaultLocation !== undefined) s.defaultLocation = String(data.defaultLocation || '').trim();
            if (data.defaultPlaceKey !== undefined) s.defaultPlaceKey = String(data.defaultPlaceKey || '').trim().toLowerCase();
            if (data.defaultType !== undefined) s.defaultType = String(data.defaultType || 'meeting').trim();
            if (data.defaultDurationMins !== undefined && Number.isFinite(data.defaultDurationMins) && data.defaultDurationMins > 0) {
                s.defaultDurationMins = data.defaultDurationMins;
            }
            s.updated = new Date().toISOString();
            saveMeetingSeries(series);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, series: withRollup(s, loadMeetings()) }));
            return;
        }

        // DELETE /api/meeting-series/:id — cascade: unlink occurrences + tasks
        // (occurrences and tasks are kept, just detached from the series)
        if (oneMatch && req.method === 'DELETE') {
            const id = oneMatch[1];
            const series = loadMeetingSeries();
            const idx = series.findIndex(x => x.id === id);
            if (idx === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }
            series.splice(idx, 1);
            saveMeetingSeries(series);

            const meetings = loadMeetings();
            let meetingsDirty = false;
            meetings.forEach(m => { if (m.seriesId === id) { delete m.seriesId; meetingsDirty = true; } });
            if (meetingsDirty) saveMeetings(meetings);

            const tasks = loadTasks();
            let tasksDirty = false;
            tasks.forEach(t => { if (t.meetingSeriesId === id) { delete t.meetingSeriesId; tasksDirty = true; } });
            if (tasksDirty) saveTasks(tasks);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/meeting-series/:id/agenda — add a new queued agenda item
        const agendaCollMatch = pathname.match(/^\/api\/meeting-series\/([^/]+)\/agenda$/);
        if (agendaCollMatch && req.method === 'POST') {
            const series = loadMeetingSeries();
            const s = series.find(x => x.id === agendaCollMatch[1]);
            if (!s) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }
            const data = JSON.parse(await readBody(req) || '{}');
            const title = String(data.title || '').trim();
            if (!title) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'title required' }));
                return;
            }
            if (!Array.isArray(s.agendaItems)) s.agendaItems = [];
            const item = {
                id: agendaItemId(),
                title,
                state: 'queued',
                order: s.agendaItems.length,
                createdAt: new Date().toISOString(),
            };
            s.agendaItems.push(item);
            s.updated = new Date().toISOString();
            saveMeetingSeries(series);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, item, series: withRollup(s, loadMeetings()) }));
            return;
        }

        // PUT/DELETE /api/meeting-series/:id/agenda/:itemId — edit or remove
        // a queued agenda item (does not touch occurrences that already
        // snapshotted this item's title into their own agenda log).
        const agendaItemMatch = pathname.match(/^\/api\/meeting-series\/([^/]+)\/agenda\/([^/]+)$/);
        if (agendaItemMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
            const series = loadMeetingSeries();
            const s = series.find(x => x.id === agendaItemMatch[1]);
            if (!s || !Array.isArray(s.agendaItems)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }
            const itemIdx = s.agendaItems.findIndex(a => a.id === agendaItemMatch[2]);
            if (itemIdx === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'agenda item not found' }));
                return;
            }
            if (req.method === 'DELETE') {
                s.agendaItems.splice(itemIdx, 1);
                s.updated = new Date().toISOString();
                saveMeetingSeries(series);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            const data = JSON.parse(await readBody(req) || '{}');
            const item = s.agendaItems[itemIdx];
            if (data.title !== undefined) item.title = String(data.title).trim();
            if (data.state !== undefined && ['queued', 'resolved', 'cancelled'].includes(data.state)) item.state = data.state;
            item.updatedAt = new Date().toISOString();
            s.updated = new Date().toISOString();
            saveMeetingSeries(series);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, item, series: withRollup(s, loadMeetings()) }));
            return;
        }
    };
};
