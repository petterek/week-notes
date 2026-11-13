const { test, expect } = require('@playwright/test');

const {
    SUMMARIZE_MODELS,
    pickOllamaSummarizeModel,
} = require('../../lib/summarize-models');

test('summarize models offer only Ollama models', () => {
    const ids = SUMMARIZE_MODELS.map(m => m.id);
    expect(ids).toEqual(expect.arrayContaining(['ollama:qwen3.5:9b', 'ollama:gemma4:12b', 'ollama:gpt-oss:20b']));
    expect(SUMMARIZE_MODELS.every(m => m.ollama && m.id.startsWith('ollama:'))).toBe(true);
});

test('settings reject retired AI options without changing the configured summary model', async ({ request }) => {
    const before = (await (await request.get('/api/app-settings')).json()).settings;
    for (const data of [
        { vectorSearch: { enabled: true } },
        { summarization: { enabled: true, model: 'Xenova/distilbart-cnn-6-6' } },
    ]) {
        const response = await request.put('/api/app-settings', { data });
        expect(response.status()).toBe(400);
        expect((await response.json()).error).toBeTruthy();
    }
    const response = await (await request.get('/api/app-settings')).json();
    expect(response.settings).not.toHaveProperty('vectorSearch');
    expect(response).not.toHaveProperty('models');
    expect(response.settings.summarization).toEqual(before.summarization);
    expect(response.summarizeModels.every(m => m.ollama)).toBe(true);
});

test('retired vector, model-download and worker-status endpoints are not served', async ({ request }) => {
    for (const route of [
        '/api/embed-search?q=synthetic', '/api/embed/status', '/api/embed/events',
        '/api/summarize/status', '/api/summarize/events',
    ]) {
        expect((await request.get(route)).status()).toBe(404);
    }
    expect((await request.delete('/api/app-settings/models/ollama%3Agemma3')).status()).toBe(404);
});

test('settings and global search use only retained AI features', async ({ page }) => {
    const apiRequests = [];
    const errors = [];
    page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('gs.embed', '1'));
    await page.goto('/settings');
    await page.locator('settings-page [data-app-tab="summarize"]').click();
    const rows = page.locator('settings-page [data-sm="tbody"] tr');
    await expect(rows.first()).toContainText('Ollama');
    await expect(page.locator('settings-page [data-sm-act]')).not.toHaveCount(0);
    await expect(page.locator('settings-page [data-sm-del], settings-page [data-vs]')).toHaveCount(0);
    await page.evaluate(() => window.openSearch());
    await expect(page.locator('#gsInput')).toBeVisible();
    await expect(page.locator('#gsEmbed')).toHaveCount(0);
    await page.locator('#gsInput').fill('Ada');
    await expect(page.locator('#gsResults a.search-result').first()).toContainText('Ada');
    expect(apiRequests.some(url => new URL(url).pathname === '/api/search')).toBe(true);
    expect(apiRequests.some(url => /\/api\/(?:embed|summarize\/(?:events|status))/.test(url))).toBe(false);
    expect(errors).toEqual([]);
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
