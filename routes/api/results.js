'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const {
        extractMentions, getCurrentYearWeek, loadResults, readJsonBody, saveResults, syncMentions,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/results' && req.method === 'GET') {
        const week = new URL('http://x' + req.url).searchParams.get('week');
        let results = loadResults();
        if (week) results = results.filter(r => r.week === week);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
        return;
    }

    // API: create a free-form result (not tied to a task)
    if (pathname === '/api/results' && req.method === 'POST') {
        const data = await readJsonBody(req);
        const text = String(data.text || '').trim();
        if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'text required' })); return; }
        const week = String(data.week || '').trim() || getCurrentYearWeek();
        const people = extractMentions(text);
        const all = loadResults();
        const r = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            text,
            week,
            people,
            created: new Date().toISOString()
        };
        if (typeof data.goalId === 'string' && data.goalId.trim()) r.goalId = data.goalId.trim();
        if (data.sentiment === 'good' || data.sentiment === 'bad') r.sentiment = data.sentiment;
        all.push(r);
        saveResults(all);
        try { syncMentions(text); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: r }));
        return;
    }

    // API: edit result
    const editResultMatch = pathname.match(/^\/api\/results\/([^/]+)$/);
    if (editResultMatch && req.method === 'PUT') {
        const data = await readJsonBody(req);
        const results = loadResults();
        const r = results.find(r => r.id === editResultMatch[1]);
        if (!r) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
        if (data.text) r.text = data.text.trim();
        if (data.goalId === null || data.goalId === '') delete r.goalId;
        else if (typeof data.goalId === 'string' && data.goalId.trim()) r.goalId = data.goalId.trim();
        if (data.sentiment === 'good' || data.sentiment === 'bad') r.sentiment = data.sentiment;
        else if (data.sentiment === 'neutral' || data.sentiment === '') delete r.sentiment;
        saveResults(results);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: delete result
    if (editResultMatch && req.method === 'DELETE') {
        saveResults(loadResults().filter(r => r.id !== editResultMatch[1]));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // API: get all people
    };
};
