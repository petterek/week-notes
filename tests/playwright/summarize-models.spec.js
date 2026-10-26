const { test, expect } = require('@playwright/test');

const {
    SUMMARIZE_MODELS,
    pickOllamaSummarizeModel,
} = require('../../lib/summarize-models');

test('summarize models offer current Ollama models and no retired GitHub Models option', () => {
    const ids = SUMMARIZE_MODELS.map(m => m.id);
    expect(ids).toEqual(expect.arrayContaining(['ollama:qwen3.5:9b', 'ollama:gemma4:12b', 'ollama:gpt-oss:20b']));
    expect(ids.some(id => id.startsWith('remote:'))).toBe(false);
    expect(SUMMARIZE_MODELS.some(m => m.remote)).toBe(false);
});

test('Ollama auto-selection keeps an installed choice and matches exact tags', () => {
    expect(pickOllamaSummarizeModel(['gemma4:12b', 'qwen3.5:9b'], 'ollama:gemma4:12b')).toBe('ollama:gemma4:12b');
    expect(pickOllamaSummarizeModel(['gemma3:latest', 'qwen3.5:9b'], 'ollama:gpt-oss:20b')).toBe('ollama:qwen3.5:9b');
    expect(pickOllamaSummarizeModel(['gemma4:latest'], 'ollama:gemma4:12b')).toBe('ollama:gemma4');
    expect(pickOllamaSummarizeModel(['gemma3:latest'], 'ollama:gemma3')).toBe('ollama:gemma3');
    expect(pickOllamaSummarizeModel(['qwen3.5:27b'], 'ollama:gemma3')).toBeNull();
});

test('summarizing while summarization is off reports how to enable it', async ({ request }) => {
    const before = (await (await request.get('/api/app-settings')).json()).settings;
    try {
        expect((await request.put('/api/app-settings', { data: { summarization: { enabled: false } } })).ok()).toBe(true);
        const settings = await (await request.get('/api/app-settings')).json();
        expect(settings.summarizeModels.map(m => m.id)).not.toContain('remote:github-models/gpt-4o-mini');
        const response = await request.post('/api/summarize', { data: { week: '2099-W23' } });
        expect(response.status()).toBe(409);
        expect((await response.json()).error).toMatch(/Innstillinger/);
    } finally {
        await request.put('/api/app-settings', { data: { summarization: before.summarization } });
    }
});
