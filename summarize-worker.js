/**
 * summarize-worker.js — local seq2seq summarization in a worker thread.
 *
 * Mirrors embed-worker.js: loads a transformers.js 'summarization' (or
 * 'text2text-generation') pipeline, caches model files under models/.
 * Long inputs are chunked to fit the model's max input window (~1024
 * tokens for BART, ~512 for T5/mT5) and the per-chunk summaries are
 * concatenated.
 *
 * Messages in:
 *   { type: 'init', model }
 *   { type: 'summarize', text, requestId }
 *
 * Messages out:
 *   { type: 'modelProgress', model, status, file?, progress? }
 *   { type: 'ready', model, ms }
 *   { type: 'summaryResult', requestId, text }
 *   { type: 'error', error, requestId? }
 */

const { parentPort } = require('worker_threads');
const path = require('path');

let pipe = null;
let modelId = null;
let pipelineTask = 'summarization';
// Words per chunk. Conservative cut so tokenized length stays well under
// 1024 tokens for BART-family models. T5 chunks should be smaller; we
// just use one cap and accept slightly suboptimal use for T5.
const CHUNK_WORDS = 600;

async function ensureModel() {
    if (pipe) return;
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = true;
    env.localModelPath = path.join(__dirname, 'models');
    env.cacheDir = path.join(__dirname, 'models');
    // mT5/T5 are seq2seq with task prefixes — both work via the
    // 'summarization' pipeline in transformers.js.
    pipelineTask = 'summarization';
    pipe = await pipeline(pipelineTask, modelId, {
        dtype: 'q8',
        progress_callback: (p) => {
            try { parentPort.postMessage({ type: 'modelProgress', model: modelId, ...p }); } catch {}
        },
    });
}

function chunkText(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length <= CHUNK_WORDS) return [words.join(' ')];
    const chunks = [];
    for (let i = 0; i < words.length; i += CHUNK_WORDS) {
        chunks.push(words.slice(i, i + CHUNK_WORDS).join(' '));
    }
    return chunks;
}

async function summarize(text) {
    const chunks = chunkText(text);
    const out = [];
    for (const ch of chunks) {
        const r = await pipe(ch, {
            max_new_tokens: 220,
            min_new_tokens: 30,
            do_sample: false,
        });
        // pipeline returns array of { summary_text } (or { generated_text })
        const first = Array.isArray(r) ? r[0] : r;
        const s = (first && (first.summary_text || first.generated_text)) || '';
        if (s) out.push(s.trim());
    }
    return out.join('\n\n');
}

parentPort.on('message', async (msg) => {
    try {
        if (msg.type === 'init') {
            const t0 = Date.now();
            modelId = msg.model;
            await ensureModel();
            parentPort.postMessage({ type: 'ready', model: modelId, ms: Date.now() - t0 });
            return;
        }
        if (msg.type === 'summarize') {
            const text = await summarize(msg.text || '');
            parentPort.postMessage({ type: 'summaryResult', requestId: msg.requestId, text });
            return;
        }
    } catch (e) {
        parentPort.postMessage({
            type: 'error',
            error: e && e.message ? e.message : String(e),
            requestId: msg.requestId,
        });
    }
});
