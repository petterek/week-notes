const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function mentionModule() {
    const file = path.resolve(__dirname, '../../domains/_shared/wn-mention-source.js');
    const code = fs.readFileSync(file, 'utf8').replace(
        /^import .+ from '\/components\/wn-autocomplete\.js';$/m,
        'const highlightMatch = value => value; const replaceRange = () => {};',
    );
    return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

test('shared mention triggers resolve the current @me identity and cache successful sources', async () => {
    const { createMentionSource } = await mentionModule();
    const calls = { people: 0, companies: 0, teams: 0 };
    const source = createMentionSource({
        meKey: 'ada',
        serviceFor(key) {
            return { list() {
                calls[key]++;
                return key === 'people' ? [{ key: 'ada', firstName: 'Ada', lastName: 'Test' }] : [];
            } };
        },
    });
    const first = await source.createTrigger().fetchItems();
    expect(first.find(item => item.kind === 'me')).toMatchObject({ label: 'Ada Test', hint: 'meg' });
    await source.createTrigger().fetchItems();
    expect(calls).toEqual({ people: 1, companies: 1, teams: 1 });
});

test('mention source failures reject and can be retried rather than becoming cached empty success', async () => {
    const { createMentionSource } = await mentionModule();
    let calls = 0;
    const source = createMentionSource({
        serviceFor(key) {
            return { list() {
                if (key !== 'people') return [];
                calls++;
                return calls === 1 ? Promise.reject(new Error('Unavailable')) : [{ key: 'ada', name: 'Ada' }];
            } };
        },
    });
    await expect(source.ensurePeople()).rejects.toThrow('Unavailable');
    expect(await source.ensurePeople()).toEqual([{ key: 'ada', name: 'Ada' }]);
});
