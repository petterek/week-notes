'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const { escapeHtml, loadTeams, loadAllTeams, saveTeams, loadPeople, loadAllPeople, loadCompanies, savePeople, readBody, loadTasks, loadMeetings, searchMdFiles } = _core;
    return async function(req, res, ctx) {
        const { pathname } = ctx;

    // GET /api/teams — list all live teams
    if (pathname === '/api/teams' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadTeams()));
        return;
    }

    // POST /api/teams — create a team
    if (pathname === '/api/teams' && req.method === 'POST') {
        try {
            const data = JSON.parse(await readBody(req) || '{}');
            const name = String(data.name || '').trim();
            if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'name is required' })); return; }
            const all = loadAllTeams();
            // Generate key from name
            const baseKey = name.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '').slice(0, 24) || 'team';
            let key = baseKey;
            // Check collisions with people, companies, and existing teams
            const liveKeys = new Set([
                ...loadPeople().map(p => p.key),
                ...loadCompanies().map(c => c.key),
                ...all.filter(t => !t.deleted).map(t => t.key)
            ]);
            let n = 2;
            while (liveKeys.has(key)) { key = baseKey + n; n++; }
            const members = Array.isArray(data.members)
                ? [...new Set(data.members.map(m => String(m).trim().toLowerCase()).filter(Boolean))]
                : [];
            const team = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                key,
                name,
                members,
                created: new Date().toISOString()
            };
            if (data.notes) team.notes = String(data.notes).trim();
            all.push(team);
            saveTeams(all);
            // Also update people's teams array
            _syncPeopleTeams(all.filter(t => !t.deleted));
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(team));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }

    // GET /api/teams/:key/status — team relations (members, notes, meetings, tasks)
    const statusMatch = pathname.match(/^\/api\/teams\/([^/]+)\/status$/);
    if (statusMatch && req.method === 'GET') {
        const key = decodeURIComponent(statusMatch[1]).toLowerCase();
        const teams = loadTeams();
        const team = teams.find(t => t.key === key);
        if (!team) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' })); return; }

        const people = loadPeople();
        const memberSet = new Set(team.members || []);

        // 1. Member details
        const memberDetails = people.filter(p => memberSet.has(p.key));

        // 2. Notes mentioning @teamkey
        const notesMentioning = searchMdFiles('@' + team.key).map(r => ({
            week: r.week,
            file: r.file,
            title: r.file.replace(/\.md$/, ''),
            href: '/' + r.week + '/' + encodeURIComponent(r.file),
            snippet: r.snippet
        }));

        // 3. Meetings where any team member is an attendee
        const allMeetings = loadMeetings();
        const meetings = allMeetings.filter(m => {
            const att = (m.attendees || []).map(a => a.toLowerCase());
            return att.some(a => memberSet.has(a));
        }).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50);

        // 4. Tasks where responsible or participant is a team member
        const allTasks = loadTasks();
        const tasks = allTasks.filter(t => {
            if (t.responsible && memberSet.has(t.responsible.toLowerCase())) return true;
            if (Array.isArray(t.participants) && t.participants.some(p => memberSet.has(p.toLowerCase()))) return true;
            return false;
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ team, memberDetails, notesMentioning, meetings, tasks }));
        return;
    }

    // PUT /api/teams/:id — update a team
    const putMatch = pathname.match(/^\/api\/teams\/([^/]+)$/);
    if (putMatch && req.method === 'PUT') {
        try {
            const id = putMatch[1];
            const data = JSON.parse(await readBody(req) || '{}');
            const all = loadAllTeams();
            const team = all.find(t => t.id === id);
            if (!team) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
            if (typeof data.name === 'string' && data.name.trim()) team.name = data.name.trim();
            if (Array.isArray(data.members)) {
                team.members = [...new Set(data.members.map(m => String(m).trim().toLowerCase()).filter(Boolean))];
            }
            if (typeof data.notes === 'string') team.notes = data.notes.trim() || undefined;
            saveTeams(all);
            _syncPeopleTeams(all.filter(t => !t.deleted));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(team));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }

    // DELETE /api/teams/:id — soft delete
    const delMatch = pathname.match(/^\/api\/teams\/([^/]+)$/);
    if (delMatch && req.method === 'DELETE') {
        const id = delMatch[1];
        const all = loadAllTeams();
        const team = all.find(t => t.id === id);
        if (!team) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'not found' })); return; }
        team.deleted = true;
        team.members = [];
        saveTeams(all);
        _syncPeopleTeams(all.filter(t => !t.deleted));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // Keep people.teams in sync with teams.members (denormalized)
    function _syncPeopleTeams(liveTeams) {
        const people = loadAllPeople();
        let changed = false;
        for (const person of people) {
            const memberOf = liveTeams.filter(t => t.members.includes(person.key)).map(t => t.key);
            const current = person.teams || [];
            if (JSON.stringify([...current].sort()) !== JSON.stringify([...memberOf].sort())) {
                person.teams = memberOf.length ? memberOf : undefined;
                changed = true;
            }
        }
        if (changed) savePeople(people);
    }

    };
};
