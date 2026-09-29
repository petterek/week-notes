const { test, expect } = require('@playwright/test');

test('detached preview reports a missing component script instead of becoming ready', async ({ page }) => {
    await page.goto('/debug/markdown-preview', { waitUntil: 'domcontentloaded' });
    await page.route('**/components/inline-result.js', route => route.abort());
    const error = await page.evaluate(async () => {
        const { createDetachedMarkdownPreview } = await import('/services/_shared/wn-markdown-preview.js');
        const frame = document.createElement('iframe');
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
        document.body.appendChild(frame);
        await loaded;
        let preview;
        try {
            preview = createDetachedMarkdownPreview(frame.contentDocument, {
                services: window['week-note-services'],
            });
            await preview.ready;
            return '';
        } catch (failure) {
            return failure.message;
        } finally {
            if (preview) preview.destroy();
            frame.remove();
        }
    });
    expect(error).toBe('Cannot load preview component: /components/inline-result.js');
});
