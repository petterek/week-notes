const { test, expect } = require('@playwright/test');
const http = require('node:http');

let alpha;
let beta;
let originalContext;

test.beforeEach(async ({ request }) => {
    originalContext = (await (await request.get('/api/contexts')).json()).active;
    const suffix = Date.now().toString(36);
    const create = async (name) => {
        const response = await request.post('/api/contexts', { data: { name } });
        expect(response.ok()).toBeTruthy();
        return (await response.json()).id;
    };
    alpha = await create('isolation-alpha-' + suffix);
    beta = await create('isolation-beta-' + suffix);
    const response = await request.post('/api/contexts/switch', { data: { id: beta } });
    expect(response.ok()).toBeTruthy();
});

test.afterEach(async ({ request }) => {
    if (originalContext) {
        const response = await request.post('/api/contexts/switch', { data: { id: originalContext } });
        expect(response.ok()).toBeTruthy();
    }
});

function contextHeaders(id) {
    return { Cookie: `wn_ctx=${encodeURIComponent(id)}` };
}

test('note saves, metadata and drafts use the request cookie rather than the global default', async ({ request }) => {
    for (const [id, title] of [[alpha, 'Alpha note'], [beta, 'Beta note']]) {
        const response = await request.post('/api/save', {
            headers: contextHeaders(id),
            data: { folder: '2099-W01', file: 'same.md', title, content: '# ' + title },
        });
        expect(response.status()).toBe(200);
        const draft = await request.post('/api/save', {
            headers: contextHeaders(id),
            data: { autosave: true, draft: true, content: 'Draft ' + title },
        });
        expect(draft.status()).toBe(200);
    }
    for (const [id, title] of [[alpha, 'Alpha note'], [beta, 'Beta note']]) {
        const headers = contextHeaders(id);
        const meta = await request.get('/api/notes/2099-W01/same.md/meta', { headers });
        expect(meta.status()).toBe(200);
        expect((await meta.json()).title).toBe(title);
        const rendered = await request.get('/api/notes/2099-W01/same.md/render', { headers });
        expect(rendered.status()).toBe(200);
        expect((await rendered.json()).html).toContain(title);
        const draft = await request.get('/api/save/draft', { headers });
        expect(draft.status()).toBe(200);
        expect((await draft.json()).content).toBe('Draft ' + title);
        const identity = await request.get('/api/me', { headers });
        expect((await identity.json()).context).toBe(id);
    }
});

test('a request awaiting its body retains the context captured before a global switch', async ({ request, baseURL }) => {
    expect((await request.post('/api/contexts/switch', { data: { id: alpha } })).ok()).toBeTruthy();
    const body = JSON.stringify({ text: 'Captured before switch', week: '2099-W01' });
    let pendingRequest;
    try {
        const status = await new Promise((resolve, reject) => {
            pendingRequest = http.request(new URL('/api/tasks', baseURL), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    Expect: '100-continue',
                },
            }, response => {
                response.resume();
                response.once('end', () => resolve(response.statusCode));
                response.once('error', reject);
            });
            pendingRequest.once('error', reject);
            pendingRequest.once('continue', async () => {
                try {
                    const switched = await request.post('/api/contexts/switch', { data: { id: beta } });
                    expect(switched.ok()).toBeTruthy();
                    pendingRequest.end(body);
                } catch (error) {
                    pendingRequest.destroy();
                    reject(error);
                }
            });
            pendingRequest.flushHeaders();
        });
        expect(status).toBe(200);
        const first = await request.get('/api/tasks', { headers: contextHeaders(alpha) });
        const second = await request.get('/api/tasks', { headers: contextHeaders(beta) });
        expect((await first.json()).map(task => task.text)).toContain('Captured before switch');
        expect((await second.json()).map(task => task.text)).not.toContain('Captured before switch');
    } finally {
        if (pendingRequest) pendingRequest.destroy();
    }
});

test('awaited routes reject malformed input and the obsolete session layout route is gone', async ({ request }) => {
    const malformed = await request.post('/api/tasks', {
        headers: { ...contextHeaders(alpha), 'Content-Type': 'application/json' },
        data: Buffer.from('{"broken":'),
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).error).toBe('Invalid JSON request body');
    const badPath = await request.get('/%ZZ');
    expect(badPath.status()).toBe(400);
    expect((await request.get('/_layouts')).status()).toBe(404);
});
