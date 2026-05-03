// Component-level scenarios.
// Each scenario in tests/scenarios.js is materialised as a Playwright
// test: we navigate to scenario.url, wait for the mock-services bundle
// to load, then inject scenario.run as a string via page.evaluate and
// run it against the live document.
const { test, expect } = require('@playwright/test');
const { SCENARIOS } = require('../scenarios.js');

// Helpers as plain functions so they serialise cleanly into page.evaluate.
const HELPERS_SRC = `
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function waitFor(fn, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 3000;
    var interval = opts.interval || 50;
    var label = opts.label || 'condition';
    return new Promise(function (resolve, reject) {
        var start = Date.now();
        (function tick() {
            var v;
            try { v = fn(); } catch (_) { v = null; }
            if (v) return resolve(v);
            if (Date.now() - start > timeout) return reject(new Error('waitFor timed out: ' + label));
            setTimeout(tick, interval);
        })();
    });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
`;

for (const s of SCENARIOS) {
    test(`[${s.id}] ${s.name}`, async ({ page }) => {
        const resp = await page.goto(s.url, { waitUntil: 'domcontentloaded' });
        expect(resp.ok(), `GET ${s.url}`).toBe(true);
        await page.waitForFunction(() => !!window.MockServices, null, { timeout: 5000 });

        const result = await page.evaluate(async ({ runSrc, helpersSrc }) => {
            // eslint-disable-next-line no-eval
            const helpers = (new Function(helpersSrc + '; return { sleep, waitFor, assert };'))();
            // eslint-disable-next-line no-eval
            const runFn = eval('(' + runSrc + ')');
            const ctx = {
                doc: document,
                win: window,
                sleep: helpers.sleep,
                waitFor: helpers.waitFor,
                assert: helpers.assert,
            };
            try {
                await runFn(ctx);
                return { ok: true };
            } catch (e) {
                return { ok: false, error: String(e && e.message || e), stack: e && e.stack };
            }
        }, { runSrc: s.run.toString(), helpersSrc: HELPERS_SRC });

        if (!result.ok) {
            throw new Error(result.error + (result.stack ? '\n' + result.stack : ''));
        }
    });
}
