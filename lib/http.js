'use strict';

class HttpError extends Error {
    constructor(status, message, options) {
        super(message, options);
        this.status = status;
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        function cleanup() {
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            req.removeListener('error', onError);
            req.removeListener('aborted', onAborted);
        }
        function onData(chunk) { chunks.push(Buffer.from(chunk)); }
        function onEnd() {
            cleanup();
            resolve(Buffer.concat(chunks).toString('utf8'));
        }
        function onError(error) {
            cleanup();
            reject(error);
        }
        function onAborted() { onError(new HttpError(400, 'Request body was interrupted')); }
        req.on('data', onData);
        req.on('end', onEnd);
        req.on('error', onError);
        req.on('aborted', onAborted);
    });
}

async function readJsonBody(req, emptyValue = {}) {
    const body = await readBody(req);
    if (!body.trim()) return emptyValue;
    try {
        return JSON.parse(body);
    } catch (error) {
        throw new HttpError(400, 'Invalid JSON request body', { cause: error });
    }
}

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
    return true;
}

module.exports = { HttpError, readBody, readJsonBody, sendJson };
