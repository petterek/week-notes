const { test, expect } = require('@playwright/test');
const { PassThrough } = require('node:stream');
const { readBody, readJsonBody, HttpError } = require('../../lib/http');

test('request bodies decode UTF-8 after all chunks have arrived', async () => {
    const request = new PassThrough();
    const body = { title: 'M\u00f8te \u{1F4DD}' };
    const pending = readJsonBody(request);
    for (const byte of Buffer.from(JSON.stringify(body))) request.write(Buffer.from([byte]));
    request.end();
    expect(await pending).toEqual(body);
    for (const event of ['data', 'end', 'error', 'aborted']) {
        expect(request.listenerCount(event)).toBe(0);
    }
});

test('malformed JSON is rejected as a bad request rather than accepted as empty', async () => {
    const request = new PassThrough();
    const pending = readJsonBody(request);
    request.end('{"title":');
    await expect(pending).rejects.toMatchObject({ status: 400, message: 'Invalid JSON request body' });
});

test('empty request bodies use the explicitly supplied default', async () => {
    const request = new PassThrough();
    const pending = readJsonBody(request, []);
    request.end();
    expect(await pending).toEqual([]);
});

test('interrupted bodies reject and release request listeners', async () => {
    const request = new PassThrough();
    const pending = readBody(request);
    request.emit('aborted');
    await expect(pending).rejects.toBeInstanceOf(HttpError);
    for (const event of ['data', 'end', 'error', 'aborted']) {
        expect(request.listenerCount(event)).toBe(0);
    }
    request.destroy();
});

for (const [method, pathname] of [
    ['POST', '/api/tasks'],
    ['PUT', '/api/tasks/task-1/toggle'],
    ['POST', '/api/tasks/task-1/close-from-note'],
]) {
    test(`${method} ${pathname} rejects malformed JSON without modifying tasks`, async () => {
        let writes = 0;
        const handler = require('../../routes/api/tasks')({
            core: {
                readBody, readJsonBody,
                loadTasks: () => [{ id: 'task-1', done: false }],
                saveTasks: () => { writes++; },
                getCurrentYearWeek: () => '2099-W01',
                getDataContext: () => 'test',
                getMePersonKey: () => '',
            },
        });
        const request = new PassThrough();
        request.method = method;
        const response = { writeHead() {}, end() {} };
        const pending = handler(request, response, { pathname, url: new URL(pathname, 'http://localhost') });
        request.end('{"broken":');
        await expect(pending).rejects.toMatchObject({ status: 400 });
        expect(writes).toBe(0);
    });
}

test('note-save malformed JSON uses the common bad-request status', async () => {
    const handler = require('../../routes/api/misc')({ core: { readBody, readJsonBody } });
    const request = new PassThrough();
    request.method = 'POST';
    let status;
    const response = { writeHead(value) { status = value; }, end() {} };
    const pending = handler(request, response, {
        pathname: '/api/save', url: new URL('http://localhost/api/save'),
    });
    request.end('{"broken":');
    await pending;
    expect(status).toBe(400);
});
