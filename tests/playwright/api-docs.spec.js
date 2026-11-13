const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { once } = require('events');
const { test, expect } = require('@playwright/test');
const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv = require('ajv/dist/2020');
const createApiDocs = require('../../routes/api-docs');

const root = path.join(__dirname, '..', '..');
const document = JSON.parse(fs.readFileSync(path.join(root, 'openapi.json'), 'utf8'));

test('OpenAPI is valid and covers every implemented API path', async () => {
    await SwaggerParser.validate(structuredClone(document));
    const documented = Object.keys(document.paths).filter(p => p.startsWith('/api/'))
        .map(p => p.replace(/\{[^}]+\}/g, '{}'));
    const implemented = new Set();
    for (const file of fs.readdirSync(path.join(root, 'routes/api')).filter(f => f.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(root, 'routes/api', file), 'utf8');
        for (const match of source.matchAll(/pathname === '(\/api\/[^']+)'/g)) implemented.add(match[1]);
        for (const match of source.matchAll(/pathname\.match\(\/(.+)\/\)/g)) {
            if (!match[1].startsWith('^\\/api\\/')) continue;
            const template = match[1].replace(/^\^|\$$/g, '').replace(/\\\//g, '/')
                .replace(/\([^)]*\)/g, '{}');
            implemented.add(template);
        }
    }
    expect([...new Set(documented)].sort()).toEqual([...implemented].sort());
    const operationIds = Object.values(document.paths).flatMap(item =>
        Object.entries(item).filter(([method]) => ['get', 'post', 'put', 'delete'].includes(method))
            .map(([, operation]) => operation.operationId));
    expect(new Set(operationIds).size).toBe(operationIds.length);
});

test('the served spec describes real task, meeting and series mutation responses', async ({ request }) => {
    const response = await request.get('/openapi.json');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual(document);
    const api = await SwaggerParser.dereference(structuredClone(document));
    const ajv = new Ajv({ strict: false, formats: { date: true, 'date-time': true } });
    async function check(url, method, options, template = url, status = 200) {
        const res = await request.fetch(url, { method, ...options });
        expect(res.status(), `${method} ${url}`).toBe(status);
        const body = await res.json();
        const schema = api.paths[template][method.toLowerCase()].responses[status].content['application/json'].schema;
        const validate = ajv.compile(schema);
        expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
        return body;
    }
    let taskId, meetingId, seriesId;
    try {
        const tasks = await check('/api/tasks', 'POST', { data: { text: 'OpenAPI contract test' } });
        taskId = tasks.at(-1).id;
        await check(`/api/tasks/${taskId}`, 'PUT', { data: { note: 'Contract note', dueDate: null } }, '/api/tasks/{id}');
        const created = await check('/api/meeting-series', 'POST', { data: { title: 'OpenAPI contract series' } });
        seriesId = created.series.id;
        await check(`/api/meeting-series/${seriesId}`, 'GET', {}, '/api/meeting-series/{id}');
        const result = await check('/api/meetings', 'POST', { data: { seriesId, date: '2099-02-03' } });
        meetingId = result.meeting.id;
        await check(`/api/meetings/${meetingId}`, 'PUT', { data: { attendees: ['ada'] } }, '/api/meetings/{id}');
        await check(`/api/meeting-series/${seriesId}/agenda/reorder`, 'POST', { data: { ids: ['missing'] } }, '/api/meeting-series/{id}/agenda/reorder', 400);
        await check('/api/summarize', 'POST', { data: { week: '2099-W06' } }, '/api/summarize', 409);
        await check('/api/contexts', 'GET', {});
        await check('/api/me', 'GET', {});
        await check('/api/app-settings', 'GET', {});
        await check('/api/contexts/playwright/index-stats', 'GET', {}, '/api/contexts/{id}/index-stats');
        await check('/api/week/2099-W06', 'GET', {}, '/api/week/{week}');
    } finally {
        if (meetingId) await request.delete(`/api/meetings/${meetingId}`);
        if (seriesId) await request.delete(`/api/meeting-series/${seriesId}`);
        if (taskId) await request.delete(`/api/tasks/${taskId}`);
    }
});

test('API explorer loads locally, executes GETs, and confirms mutations', async ({ page, baseURL }) => {
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', req => {
        if (new URL(req.url()).origin !== new URL(baseURL).origin) externalRequests.push(req.url());
    });
    await page.goto('/api-explorer?url=https://example.invalid/spec.json');
    await expect(page.getByRole('heading', { name: 'API-utforsker', exact: true })).toBeVisible();
    await expect(page.getByText('Ikke et testmiljø:', { exact: true })).toBeVisible();
    await page.locator('#operations-tag-Tasks').click();
    const list = page.locator('#operations-Tasks-listTasks');
    await list.locator('.opblock-summary').click();
    await list.getByRole('button', { name: 'Try it out' }).click();
    const fetched = page.waitForResponse(res => new URL(res.url()).pathname === '/api/tasks' && res.request().method() === 'GET');
    await list.getByRole('button', { name: 'Execute', exact: true }).click();
    expect((await fetched).status()).toBe(200);
    await expect(list.locator('.responses-inner')).toContainText('200');

    const create = page.locator('#operations-Tasks-createTask');
    await create.locator('.opblock-summary').click();
    await create.getByRole('button', { name: 'Try it out' }).click();
    let posted = false;
    page.on('request', req => {
        if (new URL(req.url()).pathname === '/api/tasks' && req.method() === 'POST') posted = true;
    });
    page.once('dialog', dialog => dialog.dismiss());
    await create.getByRole('button', { name: 'Execute', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Forespørselen ble avbrutt.');
    expect(posted).toBe(false);
    await create.locator('textarea').fill(JSON.stringify({ text: 'Explorer confirmed task' }));
    page.once('dialog', dialog => dialog.accept());
    const saved = page.waitForResponse(res => new URL(res.url()).pathname === '/api/tasks' && res.request().method() === 'POST');
    await create.getByRole('button', { name: 'Execute', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const task = (await response.json()).find(t => t.text === 'Explorer confirmed task');
    expect(task).toBeTruthy();
    await page.request.delete(`/api/tasks/${task.id}`);
    await expect(page.getByRole('alert')).toBeHidden();
    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('API documentation works before a context exists and only exposes fixed assets', async () => {
    const handler = createApiDocs({
        rootDir: root,
        core: { getActiveTheme: () => 'paper', escapeHtml: value => value },
    });
    const response = {
        writeHead: (status, headers) => { response.status = status; response.headers = headers; },
        end: body => { response.body = body; },
    };
    await handler({ method: 'GET' }, response, { pathname: '/api-explorer', contextId: '' });
    expect(response.status).toBe(200);
    expect(response.body).toContain('Ingen kontekst');
    expect(response.headers['Content-Security-Policy']).toContain("connect-src 'self'");
    expect(createApiDocs.isApiDocsPath('/api-explorer')).toBe(true);
    expect(createApiDocs.isApiDocsPath('/openapi.json')).toBe(true);
    expect(createApiDocs.isApiDocsPath('/api-explorer-assets/../../package.json')).toBe(false);
    const unknown = { writeHead: () => { throw new Error('Unexpected response'); }, end: () => {} };
    await handler({ method: 'GET' }, unknown, { pathname: '/api-explorer-assets/package.json' });
    await handler({ method: 'POST' }, unknown, { pathname: '/openapi.json' });
});

test('the first-run guard serves documentation while redirecting normal API requests', async ({ request }) => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weeknotes-api-docs-'));
    fs.writeFileSync(path.join(dataRoot, 'app-settings.json'), JSON.stringify({
        summarization: { enabled: false }, searchIndex: { enabled: false },
    }));
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const child = spawn(process.execPath, ['server.js'], {
        cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: dataRoot },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timer;
    const exited = once(child, 'exit');
    try {
        await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`Test server did not start: ${output}`)), 5000);
            child.on('error', reject);
            child.once('exit', code => reject(new Error(`Test server exited ${code}: ${output}`)));
            child.stderr.on('data', chunk => { output += chunk; });
            child.stdout.on('data', chunk => {
                output += chunk;
                if (output.includes('Weeks server running')) resolve();
            });
            clearTimeout(timer);
        });
        const base = `http://127.0.0.1:${port}`;
        for (const url of ['/openapi.json', '/api-explorer', '/api-explorer.js', '/api-explorer-assets/swagger-ui-bundle.js', '/api-explorer-assets/LICENSE']) {
            expect((await request.get(base + url, { maxRedirects: 0 })).status(), url).toBe(200);
        }
        const response = await request.get(base + '/api/tasks', { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(response.headers().location).toBe('/welcome');
    } finally {
        clearTimeout(timer);
        if (child.exitCode === null) child.kill('SIGTERM');
        await exited;
        fs.rmSync(dataRoot, { recursive: true, force: true });
    }
});
