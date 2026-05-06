'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const { loadGoals, saveGoals, loadTasks, saveTasks, loadResults, saveResults, readBody } = _core;

    const VALID_STATUS = new Set(['active', 'achieved', 'abandoned']);

    function newId() {
        return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function sanitize(g) {
        if (!g) return null;
        const out = {
            id: g.id,
            title: String(g.title || '').trim(),
            description: String(g.description || ''),
            status: VALID_STATUS.has(g.status) ? g.status : 'active',
            created: g.created,
            updated: g.updated || null,
        };
        if (g.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(String(g.targetDate).trim())) {
            out.targetDate = String(g.targetDate).trim();
        }
        if (g.achievedAt) out.achievedAt = g.achievedAt;
        return out;
    }

    return async function(req, res, ctx) {
        const { pathname } = ctx;

        if (pathname === '/api/goals' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(loadGoals()));
            return;
        }

        if (pathname === '/api/goals' && req.method === 'POST') {
            const data = JSON.parse(await readBody(req) || '{}');
            const title = String(data.title || '').trim();
            if (!title) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'title required' }));
                return;
            }
            const goal = sanitize({
                id: newId(),
                title,
                description: data.description || '',
                status: data.status || 'active',
                targetDate: data.targetDate,
                created: new Date().toISOString(),
            });
            const all = loadGoals();
            all.push(goal);
            saveGoals(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, goal }));
            return;
        }

        const editMatch = pathname.match(/^\/api\/goals\/([^/]+)$/);
        if (editMatch && req.method === 'PUT') {
            const data = JSON.parse(await readBody(req) || '{}');
            const goals = loadGoals();
            const g = goals.find(x => x.id === editMatch[1]);
            if (!g) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
            if (typeof data.title === 'string' && data.title.trim()) g.title = data.title.trim();
            if (typeof data.description === 'string') g.description = data.description;
            if (typeof data.status === 'string' && VALID_STATUS.has(data.status)) {
                if (g.status !== data.status) {
                    g.status = data.status;
                    if (data.status === 'achieved') g.achievedAt = new Date().toISOString();
                    else delete g.achievedAt;
                }
            }
            if (data.targetDate === null || data.targetDate === '') {
                delete g.targetDate;
            } else if (typeof data.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.targetDate.trim())) {
                g.targetDate = data.targetDate.trim();
            }
            g.updated = new Date().toISOString();
            saveGoals(goals);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, goal: sanitize(g) }));
            return;
        }

        if (editMatch && req.method === 'DELETE') {
            const id = editMatch[1];
            saveGoals(loadGoals().filter(g => g.id !== id));
            // Unlink from tasks/results so dangling refs don't survive.
            const tasks = loadTasks();
            let tasksDirty = false;
            tasks.forEach(t => { if (t.goalId === id) { delete t.goalId; tasksDirty = true; } });
            if (tasksDirty) saveTasks(tasks);
            const results = loadResults();
            let resultsDirty = false;
            results.forEach(r => { if (r.goalId === id) { delete r.goalId; resultsDirty = true; } });
            if (resultsDirty) saveResults(results);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
    };
};
