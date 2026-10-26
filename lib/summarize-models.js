'use strict';

// Summarization models. Chat models run through local Ollama; Xenova
// seq2seq models run in summarize-worker.js via @huggingface/transformers.
const SUMMARIZE_MODELS = [
    {
        id: 'ollama:qwen3.5:9b',
        label: 'Ollama · qwen3.5:9b',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — Qwen 3.5 9B (6.6 GB). Sterk flerspråklig modell med god norsk.',
        ollama: true,
        recommended: true,
    },
    {
        id: 'ollama:gemma4:12b',
        label: 'Ollama · gemma4:12b',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — Gemma 4 12B (7.7 GB). God norsk forståelse.',
        ollama: true,
    },
    {
        id: 'ollama:gpt-oss:20b',
        label: 'Ollama · gpt-oss:20b',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — OpenAI gpt-oss 20B (14 GB, krever 16 GB+ RAM). Høy kvalitet.',
        ollama: true,
    },
    {
        id: 'ollama:gemma3',
        label: 'Ollama · gemma3',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — Gemma 3 (3.3 GB). God norsk forståelse.',
        ollama: true,
    },
    {
        id: 'ollama:gemma4',
        label: 'Ollama · gemma4',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — Gemma 4 (9.6 GB, krever mye RAM).',
        ollama: true,
    },
    {
        id: 'ollama:gemma3:1b',
        label: 'Ollama · gemma3:1b',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — 1B-variant. Veldig rask, middels kvalitet.',
        ollama: true,
    },
    {
        id: 'ollama:llama3.2',
        label: 'Ollama · llama3.2',
        sizeMb: 0,
        languages: 'NO/EN/multi',
        description: 'Lokal via Ollama — Llama 3.2 (3B). God balanse mellom hastighet og kvalitet.',
        ollama: true,
    },
    {
        id: 'Xenova/distilbart-cnn-6-6',
        label: 'distilbart-cnn-6-6',
        sizeMb: 150,
        languages: 'EN',
        description: 'Lokal. DistilBART trent på CNN/DailyMail. God kvalitet, kun engelsk.',
    },
    {
        id: 'Xenova/distilbart-cnn-12-6',
        label: 'distilbart-cnn-12-6',
        sizeMb: 310,
        languages: 'EN',
        description: 'Større DistilBART. Bedre kvalitet enn 6-6, kun engelsk.',
    },
    {
        id: 'Xenova/bart-large-cnn',
        label: 'bart-large-cnn',
        sizeMb: 440,
        languages: 'EN',
        description: 'Full BART-large. Toppkvalitet på engelsk, tung å laste.',
    },
    {
        id: 'Xenova/t5-small',
        label: 't5-small',
        sizeMb: 60,
        languages: 'EN',
        description: 'T5 small ("summarize: ..."-prefiks). Veldig liten, middels kvalitet.',
    },
];

const DEFAULT_SUMMARIZE_MODEL = 'ollama:gemma3';

// Auto-selection preference when the configured Ollama model is not installed.
const OLLAMA_AUTO_PRIORITY = [
    'ollama:qwen3.5:9b',
    'ollama:gemma4:12b',
    'ollama:gemma4',
    'ollama:gpt-oss:20b',
    'ollama:gemma3',
    'ollama:llama3.2',
    'ollama:gemma3:1b',
];

function isOllamaSummarizeModel(id) {
    return typeof id === 'string' && id.startsWith('ollama:');
}

// Ollama treats an untagged name as ":latest"; match both spellings.
function pickOllamaSummarizeModel(installedNames, currentId) {
    const installed = new Set();
    for (const name of installedNames || []) {
        if (typeof name !== 'string') continue;
        installed.add(name);
        if (name.endsWith(':latest')) installed.add(name.slice(0, -':latest'.length));
    }
    const isInstalled = id => installed.has(id.slice('ollama:'.length));
    if (isOllamaSummarizeModel(currentId) && SUMMARIZE_MODELS.some(m => m.id === currentId) && isInstalled(currentId)) {
        return currentId;
    }
    return OLLAMA_AUTO_PRIORITY.find(isInstalled) || null;
}

module.exports = {
    SUMMARIZE_MODELS,
    DEFAULT_SUMMARIZE_MODEL,
    OLLAMA_AUTO_PRIORITY,
    isOllamaSummarizeModel,
    pickOllamaSummarizeModel,
};
