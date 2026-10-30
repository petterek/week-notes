const { test, expect } = require('@playwright/test');
const { createCleanupStack } = require('../helpers/playwright-fixtures');

async function findRecord(request, path, predicate) {
    await expect.poll(async () => {
        const response = await request.get(path);
        const items = await response.json();
        return Array.isArray(items) ? items.find(predicate) || null : null;
    }).not.toBeNull();
    const items = await (await request.get(path)).json();
    return items.find(predicate);
}

test('results editor saves Markdown, emoji, and escaped HTML for rich displays', async ({ page, request }) => {
    const cleanup = createCleanupStack();
    const marker = `Rich result ${Date.now()}`;
    const text = `**${marker}** :rocket: <b>safe</b>`;
    try {
        await page.goto('/results');
        const resultsPage = page.locator('results-page');
        await resultsPage.locator('#rpNewBtn').click();

        const editor = resultsPage.locator('feature-rich-text-area#rpModalText');
        await expect(editor).toHaveAttribute('features', 'emoji,mentions');
        await expect(editor).toHaveAttribute('rows', '3');
        await editor.locator('textarea').fill(text);
        await editor.locator('textarea').press('Control+Enter');

        const created = await findRecord(request, '/api/results', result => result.text === text);
        cleanup.add(async () => { await request.delete(`/api/results/${created.id}`); });
        const row = resultsPage.locator(`#rp-card-${created.id} .rp-text`);
        await expect(row.locator('strong')).toHaveText(marker);
        await expect(row).toContainText('🚀');
        await expect(row).toContainText('<b>safe</b>');
        await expect(row.locator('b')).toHaveCount(0);

        await page.goto('/');
        await page.evaluate(async ({ week }) => {
            await import('/components/week-results.js');
            const list = document.createElement('week-results');
            list.id = 'rich-week-results';
            list.setAttribute('week', week);
            list.setAttribute('results_service', 'week-note-services.results_service');
            list.setAttribute('people_service', 'week-note-services.people_service');
            list.setAttribute('companies_service', 'week-note-services.companies_service');
            document.body.appendChild(list);
        }, { week: created.week });
        const weekResult = page.locator('#rich-week-results .result').filter({ hasText: marker });
        await expect(weekResult).toContainText('🚀');
        await expect(weekResult.locator('strong')).toHaveText(marker);
    } finally {
        await cleanup.run();
    }
});

test('goal editor and Alt+C goal dialog save rich descriptions and render linked results safely', async ({ page, request }) => {
    const cleanup = createCleanupStack();
    const marker = `Rich goal ${Date.now()}`;
    const description = `**${marker}** :rocket: <b>safe</b>`;
    try {
        await page.goto('/goals');
        const goalsPage = page.locator('goals-page');
        await goalsPage.locator('#gpNewBtn').click();

        const editor = goalsPage.locator('feature-rich-text-area#gpModalDesc');
        await expect(editor).toHaveAttribute('features', 'lists,emoji,mentions');
        await expect(editor).toHaveAttribute('rows', '4');
        await goalsPage.locator('#gpModalTitle').fill(marker);
        await editor.locator('textarea').fill(description);
        await editor.locator('textarea').press('Control+Enter');

        const goal = await findRecord(request, '/api/goals', item => item.title === marker);
        cleanup.add(async () => { await request.delete(`/api/goals/${goal.id}`); });
        await expect(goalsPage.locator('.gp-desc strong')).toHaveText(marker);
        await expect(goalsPage.locator('.gp-desc')).toContainText('🚀');
        await expect(goalsPage.locator('.gp-desc')).toContainText('<b>safe</b>');
        await expect(goalsPage.locator('.gp-desc b')).toHaveCount(0);

        const resultText = `**Linked ${marker}** :rocket: <b>safe</b>`;
        const resultResponse = await request.post('/api/results', { data: { text: resultText, goalId: goal.id } });
        expect(resultResponse.ok()).toBe(true);
        const results = await findRecord(request, '/api/results', item => item.text === resultText && item.goalId === goal.id);
        cleanup.add(async () => { await request.delete(`/api/results/${results.id}`); });
        await page.goto('/results');
        await page.goto(`/goals#g-${encodeURIComponent(goal.id)}`);
        const linkedResult = page.locator('.gp-detail .text').filter({ hasText: `Linked ${marker}` });
        await expect(linkedResult.locator('strong')).toHaveText(`Linked ${marker}`);
        await expect(linkedResult).toContainText('🚀');
        await expect(linkedResult).toContainText('<b>safe</b>');
        await expect(linkedResult.locator('b')).toHaveCount(0);

        await page.evaluate(() => window.openCreateModal());
        await page.locator('#createModalOverlay [data-action="goal"]').click();
        const globalEditor = page.locator('feature-rich-text-area[name="description"]');
        await expect(globalEditor).toHaveAttribute('features', 'lists,emoji,mentions');
        await expect(globalEditor).toHaveAttribute('rows', '2');
        await page.locator('modal-container input[name="title"]').fill(`${marker} Alt C`);
        await globalEditor.locator('textarea').fill(`**${marker}** :rocket:`);
        await page.getByRole('button', { name: 'Opprett' }).click();

        const globalGoal = await findRecord(request, '/api/goals', item => item.title === `${marker} Alt C`);
        cleanup.add(async () => { await request.delete(`/api/goals/${globalGoal.id}`); });
        expect(globalGoal.description).toBe(`**${marker}** :rocket:`);
    } finally {
        await cleanup.run();
    }
});
