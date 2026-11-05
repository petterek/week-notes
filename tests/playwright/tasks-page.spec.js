const { test, expect } = require('@playwright/test');

for (const submit of ['Enter', 'button']) {
    test(`tasks quick-add via ${submit} reuses the create response without reloading data`, async ({ page, request }) => {
        await page.goto('/tasks');
        const tasks = page.locator('tasks-page');
        await expect(tasks.locator('.tp-create-input')).toBeVisible();
        await page.waitForLoadState('networkidle');

        const reads = [];
        page.on('request', req => {
            if (req.method() === 'GET' && /^\/api\/(tasks|people|companies|goals)$/.test(new URL(req.url()).pathname)) {
                reads.push(new URL(req.url()).pathname);
            }
        });
        const text = `Quick-add request regression ${submit}`;
        let id;
        try {
            await tasks.locator('.tp-filter').fill(text.toLowerCase());
            await tasks.locator('.tp-create-input').fill(text);
            const created = page.waitForResponse(res => new URL(res.url()).pathname === '/api/tasks' && res.request().method() === 'POST');
            if (submit === 'Enter') {
                await tasks.locator('.tp-create-input').press('Enter');
            } else {
                await tasks.locator('.tp-create-btn').click();
            }
            const response = await created;
            expect(response.ok()).toBe(true);
            const saved = await response.json();
            id = saved.find(task => task.text === text)?.id;
            expect(id).toBeTruthy();
            await expect(tasks.locator(`tr[data-taskid="${id}"]`)).toBeVisible();
            await expect(tasks.locator('.tp-create-input')).toHaveValue('');
            await expect(tasks.locator('.tp-filter')).toHaveValue(text.toLowerCase());
            expect(reads, 'Create already returns the task list; related data must stay cached').toEqual([]);
        } finally {
            if (id) await request.delete(`/api/tasks/${encodeURIComponent(id)}`);
        }
    });
}
