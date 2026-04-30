/**
 * embed-worker.js — feature-extraction in a worker thread.
 *
 * Runs the e5-small ONNX model out-of-process. Owns its own vector
 * cache (in-memory Map) keyed by {docKey -> {hash, vector}}, persists
 * to data/<ctx>/.cache/embeddings.json so cold-starts skip re-embedding
 * unchanged content.
 *
 * Messages in (from main thread):
 *   { type: 'init',  contextDir }                  → loads model, reads sidecar cache
 *   { type: 'index', docs: [{key, hash, text}] }   → embeds new/changed docs incrementally
 *   { type: 'query', q, requestId, topK? }         → cosine-sim against current vectors
 *
 * Messages out:
 *   { type: 'ready', count, docCount, ms }
 *   { type: 'indexed', changed, total, ms }
 *   { type: 'queryResult', requestId, hits: [{key, score}] }
 *   { type: 'error', error }
 *
 * Vectors are 384-d float32 (multilingual-e5-small). Stored in JSON for
 * v1 — small corpus, premature to invent a binary format.
 */

const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let extractor = null;
let modelId = null;
let dim = 0;
let contextDir = null;
let cachePath = null;
// docKey -> { hash, vector: Float32Array }
const vectors = new Map();

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

function loadCache() {
    if (!cachePath || !fs.existsSync(cachePath)) return 0;
    try {
        const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        if (!raw || !raw.entries) return 0;
        // Wrong model or wrong dim → cache is invalid for this run.
        if (raw.model && modelId && raw.model !== modelId) return 0;
        if (dim && raw.dim && raw.dim !== dim) return 0;
        // Adopt dim from cache if not yet known (we'll verify against
        // the first inference output).
        if (!dim && raw.dim) dim = raw.dim;
        let n = 0;
        for (const k of Object.keys(raw.entries)) {
            const v = raw.entries[k];
            if (!v || !Array.isArray(v.vector)) continue;
            if (dim && v.vector.length !== dim) continue;
            vectors.set(k, { hash: v.hash, vector: Float32Array.from(v.vector) });
            n++;
        }
        return n;
    } catch { return 0; }
}

let saveTimer = null;
function saveCacheDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCache, 1500);
}

function saveCache() {
    if (!cachePath) return;
    const dirP = path.dirname(cachePath);
    try { fs.mkdirSync(dirP, { recursive: true }); } catch {}
    const entries = {};
    for (const [k, { hash, vector }] of vectors) {
        entries[k] = { hash, vector: Array.from(vector) };
    }
    const tmp = cachePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ dim, model: modelId, entries }));
    fs.renameSync(tmp, cachePath);
}

async function ensureModel() {
    if (extractor) return;
    const { pipeline, env } = await import('@huggingface/transformers');
    // Allow downloads on first run; subsequent runs read from local cache.
    env.allowRemoteModels = true;
    env.localModelPath = path.join(__dirname, 'models');
    env.cacheDir = path.join(__dirname, 'models');
    extractor = await pipeline('feature-extraction', modelId, {
        dtype: 'q8',
        progress_callback: (p) => {
            try { parentPort.postMessage({ type: 'modelProgress', model: modelId, ...p }); } catch {}
        },
    });
}

async function embedBatch(prefix, texts) {
    // e5-family expects "passage: <text>" / "query: <text>". Other models
    // (MiniLM, bge) ignore the prefix as plain text — slight noise, no
    // structural problem.
    const inputs = texts.map(t => prefix + ': ' + t);
    const out = await extractor(inputs, { pooling: 'mean', normalize: true });
    if (!dim) dim = Math.floor(out.data.length / texts.length);
    const result = [];
    for (let i = 0; i < texts.length; i++) {
        result.push(out.data.slice(i * dim, (i + 1) * dim));
    }
    return result;
}

function cosine(a, b) {
    // Both vectors are L2-normalized so dot product = cosine similarity.
    let s = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
}

async function indexDocs(docs) {
    const t0 = Date.now();
    // Drop entries no longer present.
    const liveKeys = new Set(docs.map(d => d.key));
    for (const k of Array.from(vectors.keys())) {
        if (!liveKeys.has(k)) vectors.delete(k);
    }
    // Find changed/new docs.
    const todo = [];
    for (const d of docs) {
        const cur = vectors.get(d.key);
        if (!cur || cur.hash !== d.hash) todo.push(d);
    }
    if (todo.length === 0) {
        return { changed: 0, total: vectors.size, ms: Date.now() - t0 };
    }
    // Batch in groups of 16 to keep peak memory bounded.
    const BATCH = 16;
    for (let i = 0; i < todo.length; i += BATCH) {
        const slice = todo.slice(i, i + BATCH);
        const vecs = await embedBatch('passage', slice.map(d => d.text));
        for (let j = 0; j < slice.length; j++) {
            vectors.set(slice[j].key, { hash: slice[j].hash, vector: vecs[j] });
        }
    }
    saveCacheDebounced();
    return { changed: todo.length, total: vectors.size, ms: Date.now() - t0 };
}

async function query(q, topK) {
    if (!extractor || vectors.size === 0) return [];
    const [qv] = await embedBatch('query', [q]);
    const scored = [];
    for (const [key, { vector }] of vectors) {
        scored.push({ key, score: cosine(qv, vector) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK || 20);
}

parentPort.on('message', async (msg) => {
    try {
        if (msg.type === 'init') {
            const t0 = Date.now();
            contextDir = msg.contextDir;
            modelId = msg.model || 'Xenova/multilingual-e5-small';
            cachePath = path.join(contextDir, '.cache', 'embeddings.json');
            const cached = loadCache();
            await ensureModel();
            parentPort.postMessage({ type: 'ready', model: modelId, cached, docCount: vectors.size, ms: Date.now() - t0 });
            return;
        }
        if (msg.type === 'index') {
            const r = await indexDocs(msg.docs || []);
            parentPort.postMessage({ type: 'indexed', ...r });
            return;
        }
        if (msg.type === 'query') {
            const hits = await query(msg.q, msg.topK || 20);
            parentPort.postMessage({ type: 'queryResult', requestId: msg.requestId, hits });
            return;
        }
    } catch (e) {
        parentPort.postMessage({ type: 'error', error: e && e.message ? e.message : String(e), requestId: msg.requestId });
    }
});
