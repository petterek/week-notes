'use strict';
module.exports = function(deps) {
    const _core = deps.core;
    const {
        loadAllPlaces, loadPlaces, readJsonBody, savePlaces,
    } = _core;
    return async function(req, res, ctx) {
        const { pathname, url } = ctx;
    if (pathname === '/api/places' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadPlaces()));
        return;
    }
    if (pathname === '/api/places' && req.method === 'POST') {
        try {
            const data = await readJsonBody(req);
            const name = String(data.name || '').trim();
            if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'name is required' })); return; }
            const all = loadAllPlaces();
            const baseKey = name.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '').slice(0, 24) || 'sted';
            let key = baseKey;
            const liveKeys = new Set(all.filter(p => !p.deleted).map(p => p.key));
            let n = 2;
            while (liveKeys.has(key)) { key = baseKey + n; n++; }
            const lat = data.lat !== undefined && data.lat !== null && data.lat !== '' ? parseFloat(data.lat) : null;
            const lng = data.lng !== undefined && data.lng !== null && data.lng !== '' ? parseFloat(data.lng) : null;
            const place = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                key,
                name,
                address: String(data.address || '').trim(),
                lat: Number.isFinite(lat) ? lat : null,
                lng: Number.isFinite(lng) ? lng : null,
                notes: String(data.notes || '').trim(),
                created: new Date().toISOString()
            };
            all.push(place);
            savePlaces(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, place }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
        }
        return;
    }
    const placeMatch = pathname.match(/^\/api\/places\/([^/]+)$/);
    if (placeMatch && req.method === 'PUT') {
        try {
            const data = await readJsonBody(req);
            const all = loadAllPlaces();
            const idx = all.findIndex(p => p.id === placeMatch[1]);
            if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); return; }
            const p = all[idx];
            if (data.name !== undefined) p.name = String(data.name).trim();
            if (data.address !== undefined) p.address = String(data.address).trim();
            if (data.notes !== undefined) p.notes = String(data.notes).trim();
            if (data.lat !== undefined) {
                const v = data.lat === null || data.lat === '' ? null : parseFloat(data.lat);
                p.lat = Number.isFinite(v) ? v : null;
            }
            if (data.lng !== undefined) {
                const v = data.lng === null || data.lng === '' ? null : parseFloat(data.lng);
                p.lng = Number.isFinite(v) ? v : null;
            }
            savePlaces(all);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, place: p }));
        } catch { res.writeHead(400); res.end(JSON.stringify({ ok: false })); }
        return;
    }
    if (placeMatch && req.method === 'DELETE') {
        const all = loadAllPlaces();
        const idx = all.findIndex(p => p.id === placeMatch[1]);
        if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Not found' })); return; }
        all[idx].deleted = true;
        all[idx].deletedAt = new Date().toISOString();
        savePlaces(all);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }


    // API: list meetings (?week=YYYY-WNN, ?upcoming=N days)
    };
};
