'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const {
        loadAllCompanies, loadCompanies, loadPeople, readJsonBody, saveCompanies,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/companies' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadCompanies()));
        return;
    }
    if (pathname === '/api/companies' && req.method === 'POST') {
        try {
            const data = await readJsonBody(req);
            const name = String(data.name || '').trim();
            if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'name is required' })); return; }
            const all = loadAllCompanies();
            const baseKey = name.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '').slice(0, 24) || 'firma';
            let key = baseKey;
            const liveKeys = new Set([
                ...all.filter(c => !c.deleted).map(c => c.key),
                ...loadPeople().map(p => p.key)
            ]);
            let n = 2;
            while (liveKeys.has(key)) { key = baseKey + n; n++; }
            const company = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                key,
                name,
                orgnr: String(data.orgnr || '').trim(),
                url: String(data.url || '').trim(),
                address: String(data.address || '').trim(),
                notes: String(data.notes || '').trim(),
                created: new Date().toISOString()
            };
            all.push(company);
            saveCompanies(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, company }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }
    const companyMatch = pathname.match(/^\/api\/companies\/([^/]+)$/);
    if (companyMatch && req.method === 'PUT') {
        try {
            const data = await readJsonBody(req);
            const all = loadAllCompanies();
            const idx = all.findIndex(c => c.id === companyMatch[1]);
            if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
            const c = all[idx];
            if (data.name !== undefined) c.name = String(data.name).trim();
            if (data.orgnr !== undefined) c.orgnr = String(data.orgnr).trim();
            if (data.url !== undefined) c.url = String(data.url).trim();
            if (data.address !== undefined) c.address = String(data.address).trim();
            if (data.notes !== undefined) c.notes = String(data.notes).trim();
            if (data.inactive !== undefined) c.inactive = !!data.inactive;
            saveCompanies(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, company: c }));
        } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false })); }
        return;
    }
    if (companyMatch && req.method === 'DELETE') {
        const all = loadAllCompanies();
        const idx = all.findIndex(c => c.id === companyMatch[1]);
        if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Not found' })); return; }
        all[idx].deleted = true;
        all[idx].deletedAt = new Date().toISOString();
        saveCompanies(all);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // ===== Places =====
    };
};
