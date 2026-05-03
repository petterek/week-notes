// Shared UI test scenarios for week-notes.
//
// Each scenario is a self-contained async function that drives a single
// /debug/<component> playground page. Those debug pages preload
// domains/_mock-services.js, so any <component service="MockXxx">
// reads/writes against an in-memory store with no real I/O.
//
// The same scenarios run in two harnesses:
//
//   1) Playwright (Node)
//      tests/playwright/scenarios.spec.js requires this file, navigates
//      to scenario.url with `page.goto`, then injects scenario.run as a
//      string via `page.evaluate` to execute against the live document.
//
//   2) In-browser runner
//      /debug/tests loads this file as a regular <script> on the page,
//      iterates window.WN_TEST_SCENARIOS, and runs each scenario inside
//      an <iframe src="${scenario.url}">.
//
// Scenario contract:
//   {
//     id:   string                         // stable, kebab-case
//     name: string                         // human-readable description
//     url:  string                         // a /debug/* path the runner will load
//     run:  async ({ doc, win, sleep, waitFor, assert }) => void
//                                           // throws on failure (Error.message
//                                           // becomes the failure reason)
//   }
//
// Keep `run` purely DOM-driven (no Playwright APIs, no Node APIs). It
// receives a context object with a few small helpers; rely on those
// rather than referencing the global document so the same code works
// inside an iframe.

(function (root) {
    function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

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
                if (Date.now() - start > timeout) {
                    return reject(new Error('waitFor timed out: ' + label));
                }
                setTimeout(tick, interval);
            })();
        });
    }

    function assert(cond, msg) {
        if (!cond) throw new Error(msg || 'assertion failed');
    }

    function shadowOf(el) {
        return el && el.shadowRoot ? el.shadowRoot : null;
    }

    // ---------- scenarios ----------

    var SCENARIOS = [
        {
            id: 'task-open-list-renders',
            name: 'task-open-list renders seeded mock tasks',
            url: '/debug/task-open-list',
            run: async function (ctx) {
                var doc = ctx.doc;
                var list = await ctx.waitFor(function () { return doc.querySelector('task-open-list'); }, { label: 'task-open-list element' });
                var rows = await ctx.waitFor(function () {
                    var sr = list.shadowRoot;
                    if (!sr) return null;
                    var n = sr.querySelectorAll('.sidebar-task');
                    return n.length > 0 ? n : null;
                }, { label: 'open task rows' });
                ctx.assert(rows.length >= 1, 'expected at least one open task, got ' + rows.length);
                var firstText = rows[0].textContent.replace(/\s+/g, ' ').trim();
                ctx.assert(firstText.length > 0, 'first task should have text');
            },
        },

        {
            id: 'task-create-emits-event',
            name: 'task-create dispatches task:created on submit',
            url: '/debug/task-create',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tc = await ctx.waitFor(function () { return doc.querySelector('task-create'); }, { label: 'task-create element' });
                var sr = tc.shadowRoot;
                var input = await ctx.waitFor(function () { return sr.querySelector('input.txt'); }, { label: 'task-create input' });
                var btn = sr.querySelector('button.btn');
                var fired = null;
                tc.addEventListener('task:created', function (e) { fired = e.detail; });

                input.focus();
                input.value = 'Scenario task ' + Date.now();
                input.dispatchEvent(new Event('input', { bubbles: true }));
                btn.click();

                await ctx.waitFor(function () { return fired; }, { label: 'task:created event' });
                ctx.assert(fired && fired.task, 'expected event detail.task');
                ctx.assert(/Scenario task /.test(fired.task.text), 'unexpected task text: ' + (fired.task && fired.task.text));
            },
        },

        {
            id: 'task-add-modal-opens',
            name: 'task-add-modal opens on + click and shows task-create',
            url: '/debug/task-add-modal',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tam = await ctx.waitFor(function () { return doc.querySelector('task-add-modal'); }, { label: 'task-add-modal' });
                var sr = tam.shadowRoot;
                var trigger = await ctx.waitFor(function () { return sr.querySelector('button[data-act="add"]'); }, { label: '+ trigger' });
                trigger.click();
                var modal = sr.querySelector('modal-container');
                ctx.assert(modal, 'modal-container should be in shadow root');
                await ctx.waitFor(function () { return modal.hasAttribute('open') || (modal.shadowRoot && modal.shadowRoot.querySelector('.backdrop:not([hidden])')); }, { label: 'modal open' });
                var tc = modal.querySelector('task-create');
                ctx.assert(tc, 'expected <task-create> inside modal');
            },
        },

        {
            id: 'people-page-lists',
            name: 'people-page renders mock person/company/place cards',
            url: '/debug/people-page',
            run: async function (ctx) {
                var doc = ctx.doc;
                var pp = await ctx.waitFor(function () { return doc.querySelector('people-page'); }, { label: 'people-page' });
                var sr = await ctx.waitFor(function () { return pp.shadowRoot; }, { label: 'people-page shadow' });
                var personCards = await ctx.waitFor(function () {
                    var n = sr.querySelectorAll('person-card');
                    return n.length > 0 ? n : null;
                }, { label: 'person-card elements', timeout: 5000 });
                ctx.assert(personCards.length === 3, 'expected 3 mock people, got ' + personCards.length);
                var companyCards = sr.querySelectorAll('company-card');
                ctx.assert(companyCards.length === 2, 'expected 2 mock companies, got ' + companyCards.length);
                var placeCards = sr.querySelectorAll('place-card');
                ctx.assert(placeCards.length === 2, 'expected 2 mock places, got ' + placeCards.length);
            },
        },

        {
            id: 'modal-container-open-close',
            name: 'modal-container opens and closes via API',
            url: '/debug/modal-container',
            run: async function (ctx) {
                var doc = ctx.doc;
                var m = doc.createElement('modal-container');
                doc.body.appendChild(m);
                ctx.assert(typeof m.setup === 'function', 'modal.setup() should exist');
                m.setup({
                    title: 'Scenario modal',
                    content: '<p data-marker="hello">hello</p>',
                });
                m.open();
                await ctx.waitFor(function () { return m.hasAttribute('open'); }, { label: 'modal [open]' });
                // Content is slotted into light DOM children.
                ctx.assert(m.querySelector('[data-marker="hello"]'), 'expected slotted content child');
                m.close('button');
                await ctx.waitFor(function () { return !m.hasAttribute('open'); }, { label: 'modal closed' });
                m.remove();
            },
        },

        {
            id: 'json-table-renders-rows',
            name: 'json-table renders rows for an array of objects',
            url: '/debug/json-table',
            run: async function (ctx) {
                var doc = ctx.doc;
                var jt = await ctx.waitFor(function () { return doc.querySelector('json-table'); }, { label: 'json-table' });
                // Wait for the demo's seed to land first, then overwrite.
                await ctx.waitFor(function () {
                    return Array.isArray(jt._data) && jt._data.length > 0;
                }, { label: 'demo seed loaded' });
                var marker = 'Z' + Date.now();
                jt.data = [{ id: 1, m: marker }, { id: 2, m: marker }, { id: 3, m: marker }];
                await ctx.waitFor(function () {
                    var sr = jt.shadowRoot;
                    if (!sr) return null;
                    // <json-table> renders the table twice (inline + overlay
                    // for fullscreen). Scope the count to the inline copy.
                    var rows = sr.querySelectorAll('.inline tbody tr');
                    if (rows.length !== 3) return null;
                    return sr.textContent.indexOf(marker) >= 0 ? rows : null;
                }, { label: 'three body rows with marker' });
            },
        },

        {
            id: 'global-search-runs-query',
            name: 'global-search opens modal and shows results from MockSearchService',
            url: '/debug/global-search',
            run: async function (ctx) {
                var doc = ctx.doc;
                var gs = await ctx.waitFor(function () { return doc.querySelector('global-search'); }, { label: 'global-search' });
                // global-search renders its trigger + modal in LIGHT DOM (shadow is just <slot>).
                var trigger = await ctx.waitFor(function () { return gs.querySelector('.gs-trigger'); }, { label: 'gs-trigger' });
                trigger.click();
                var input = await ctx.waitFor(function () { return gs.querySelector('.gs-input'); }, { label: 'gs-input' });
                input.focus();
                input.value = 'demo';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await ctx.waitFor(function () {
                    return gs.querySelector('.search-result, .sr-group, .gs-empty');
                }, { label: 'search results UI', timeout: 4000 });
            },
        },

        {
            id: 'task-completed-renders-completed',
            name: 'task-completed renders strike-through completed tasks for a week',
            url: '/debug/task-completed',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tc = await ctx.waitFor(function () { return doc.querySelector('task-completed'); }, { label: 'task-completed' });
                var sr = await ctx.waitFor(function () { return tc.shadowRoot; }, { label: 'shadow' });
                // Wait for either some rows or an explicit "no completed" empty state.
                await ctx.waitFor(function () {
                    var t = sr.textContent || '';
                    if (/Laster/i.test(t)) return null;
                    return sr.querySelector('.row, .completed-task, li, p');
                }, { label: 'task-completed rendered', timeout: 4000 });
                // Sanity: the heading should mention completed tasks.
                ctx.assert(/Fullf/i.test(sr.textContent), 'expected "Fullført…" heading');
            },
        },

        {
            id: 'task-complete-modal-confirm',
            name: 'task-complete-modal confirm fires callback with id + comment',
            url: '/debug/task-complete-modal',
            run: async function (ctx) {
                var doc = ctx.doc;
                var modal = await ctx.waitFor(function () { return doc.querySelector('task-complete-modal'); }, { label: 'task-complete-modal' });
                ctx.assert(typeof modal.open === 'function', 'expected open()');
                var got = null;
                modal.open({ id: 'demo-1', text: 'Demo task' }, function (res) { got = res; });
                var ta = await ctx.waitFor(function () {
                    return modal.shadowRoot && modal.shadowRoot.querySelector('[data-el="comment"]');
                }, { label: 'comment textarea' });
                ta.value = 'Done with notes';
                var confirmBtn = modal.shadowRoot.querySelector('button[data-act="confirm"]');
                ctx.assert(confirmBtn, 'confirm button not found');
                confirmBtn.click();
                await ctx.waitFor(function () { return got; }, { label: 'callback fired' });
                ctx.assert(got.confirmed === true, 'expected confirmed:true');
                ctx.assert(got.id === 'demo-1', 'expected id demo-1, got ' + got.id);
                ctx.assert(/Done with notes/.test(got.comment || ''), 'expected comment, got ' + got.comment);
            },
        },

        {
            id: 'icon-picker-emits-change',
            name: 'icon-picker fires valueChanged on selection',
            url: '/debug/icon-picker',
            run: async function (ctx) {
                var doc = ctx.doc;
                var ip = await ctx.waitFor(function () { return doc.querySelector('icon-picker'); }, { label: 'icon-picker' });
                var sr = ip.shadowRoot;
                var btn = await ctx.waitFor(function () {
                    var bs = sr.querySelectorAll('button');
                    return bs.length > 0 ? bs[Math.min(2, bs.length - 1)] : null;
                }, { label: 'icon button' });
                var fired = null;
                ip.addEventListener('valueChanged', function (e) { fired = e.detail; });
                btn.click();
                await ctx.waitFor(function () { return fired || ip.value; }, { label: 'value set' });
                ctx.assert(ip.value, 'expected non-empty value after click, got "' + ip.value + '"');
            },
        },

        {
            id: 'time-picker-rounds-to-step',
            name: 'time-picker setter rounds to step',
            url: '/debug/time-picker',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tp = await ctx.waitFor(function () { return doc.querySelector('time-picker'); }, { label: 'time-picker' });
                tp.setAttribute('step', '15');
                tp.value = '08:23';
                ctx.assert(tp.value === '08:15' || tp.value === '08:30', 'expected snap to 15-min, got ' + tp.value);
                tp.value = '12:08';
                ctx.assert(tp.value === '12:00' || tp.value === '12:15', 'expected snap, got ' + tp.value);
            },
        },

        {
            id: 'week-pill-clicks-emit-event',
            name: 'week-pill emits week-clicked with year + weekNumber',
            url: '/debug/week-pill',
            run: async function (ctx) {
                var doc = ctx.doc;
                var wp = await ctx.waitFor(function () { return doc.querySelector('week-pill'); }, { label: 'week-pill' });
                var fired = null;
                wp.addEventListener('week-clicked', function (e) { fired = e.detail; });
                wp.shadowRoot.querySelector('button, span, a, .pill, *').click();
                // Fall back to clicking the host itself if shadow click didn't bubble out
                if (!fired) wp.click();
                await ctx.waitFor(function () { return fired; }, { label: 'week-clicked event' });
                ctx.assert(typeof fired.year === 'number' && fired.year > 2000, 'expected numeric year, got ' + fired.year);
                ctx.assert(typeof fired.weekNumber === 'number' && fired.weekNumber >= 1 && fired.weekNumber <= 53, 'expected weekNumber 1..53, got ' + fired.weekNumber);
            },
        },

        {
            id: 'markdown-preview-renders-html',
            name: 'markdown-preview renders markdown to HTML',
            url: '/debug/markdown-preview',
            run: async function (ctx) {
                var doc = ctx.doc;
                var win = ctx.win;
                await ctx.waitFor(function () { return win.marked && win.marked.parse; }, { label: 'window.marked', timeout: 5000 });
                // Use a fresh element to bypass the demo page's seed wiring + any
                // pre-upgrade data-property shadowing.
                var mp = doc.createElement('markdown-preview');
                doc.body.appendChild(mp);
                mp.value = '# Hello\n\nThis is **bold** text.';
                await ctx.waitFor(function () {
                    var sr = mp.shadowRoot;
                    if (!sr) return null;
                    var root = sr.querySelector('.root');
                    if (!root) return null;
                    var h1 = root.querySelector('h1');
                    var strong = root.querySelector('strong');
                    return h1 && /Hello/.test(h1.textContent) && strong ? true : null;
                }, { label: 'rendered h1 + strong', timeout: 4000 });
            },
        },

        {
            id: 'note-card-emits-actions',
            name: 'note-card emits view/edit/delete events from header buttons',
            url: '/debug/note-card',
            run: async function (ctx) {
                var doc = ctx.doc;
                var nc = await ctx.waitFor(function () { return doc.querySelector('note-card'); }, { label: 'note-card' });
                // Wait for setData to populate.
                await ctx.waitFor(function () {
                    var sr = nc.shadowRoot;
                    return sr && !/Laster/i.test(sr.textContent);
                }, { label: 'note-card data populated' });
                var seen = {};
                ['view', 'edit', 'delete'].forEach(function (evt) {
                    nc.addEventListener(evt, function (e) { seen[evt] = e.detail; });
                });
                var sr = nc.shadowRoot;
                var btns = sr.querySelectorAll('button[data-act], button[title]');
                ctx.assert(btns.length > 0, 'expected action buttons, found ' + btns.length);
                // Click the "view" button (or first button as fallback).
                var viewBtn = sr.querySelector('button[data-act="view"]') || btns[0];
                viewBtn.click();
                await ctx.waitFor(function () { return Object.keys(seen).length > 0; }, { label: 'at least one action event' });
                var first = Object.keys(seen)[0];
                ctx.assert(seen[first] && seen[first].file, 'event detail should include .file, got ' + JSON.stringify(seen[first]));
            },
        },

        {
            id: 'help-modal-opens',
            name: 'help-modal open() sets [open] attribute and exposes a body',
            url: '/debug/help-modal',
            run: async function (ctx) {
                var doc = ctx.doc;
                var hm = await ctx.waitFor(function () { return doc.querySelector('help-modal'); }, { label: 'help-modal' });
                ctx.assert(typeof hm.open === 'function', 'expected open()');
                hm.open();
                ctx.assert(hm.hasAttribute('open'), 'expected [open] attribute after open()');
                var body = await ctx.waitFor(function () {
                    return hm.shadowRoot && hm.shadowRoot.querySelector('.body');
                }, { label: '.body element' });
                ctx.assert(body, 'expected a body element inside help-modal shadow');
                hm.close();
                ctx.assert(!hm.hasAttribute('open'), 'expected [open] removed after close()');
            },
        },

        {
            id: 'upcoming-meetings-lists-mocks',
            name: 'upcoming-meetings renders cards from MockMeetingsService',
            url: '/debug/upcoming-meetings',
            run: async function (ctx) {
                var doc = ctx.doc;
                var um = await ctx.waitFor(function () { return doc.querySelector('upcoming-meetings'); }, { label: 'upcoming-meetings' });
                await ctx.waitFor(function () {
                    var sr = um.shadowRoot;
                    if (!sr) return null;
                    var t = sr.textContent || '';
                    if (/Laster/i.test(t)) return null;
                    // Either a card was rendered, or "no upcoming meetings" is shown.
                    return sr.querySelector('a, .meeting, .card, li') || /Ingen kommende|No upcoming/i.test(t);
                }, { label: 'upcoming-meetings rendered', timeout: 5000 });
            },
        },

        {
            id: 'person-card-renders-data',
            name: 'person-card renders fields from setData',
            url: '/debug/person-card',
            run: async function (ctx) {
                var doc = ctx.doc;
                var pc = await ctx.waitFor(function () { return doc.querySelector('person-card'); }, { label: 'person-card' });
                pc.setData({
                    person: {
                        key: 'scenario-1',
                        firstName: 'Scenario',
                        lastName: 'Person',
                        name: 'Scenario Person',
                        title: 'QA',
                        email: 'sp@example.com',
                    },
                    primaryCompany: null,
                    extraCompanies: [],
                });
                await ctx.waitFor(function () {
                    var sr = pc.shadowRoot;
                    if (!sr) return null;
                    var t = sr.textContent || '';
                    return /Scenario Person/.test(t);
                }, { label: 'person fields rendered' });
            },
        },

        {
            id: 'ctx-switcher-lists-mock-contexts',
            name: 'ctx-switcher exposes the mock context list',
            url: '/debug/ctx-switcher',
            run: async function (ctx) {
                var doc = ctx.doc;
                var cs = await ctx.waitFor(function () { return doc.querySelector('ctx-switcher'); }, { label: 'ctx-switcher' });
                await ctx.waitFor(function () {
                    var sr = cs.shadowRoot;
                    return sr && sr.textContent && sr.textContent.trim().length > 0;
                }, { label: 'ctx-switcher rendered' });
                // The MockContextService seed exposes >=1 context. The trigger
                // shows the active one; clicking should reveal a list.
                var sr = cs.shadowRoot;
                var trigger = sr.querySelector('button, .trigger, [role="button"]');
                if (trigger) trigger.click();
                await ctx.waitFor(function () {
                    return sr.querySelectorAll('a, button[data-ctx], li, [role="menuitem"]').length >= 1;
                }, { label: 'context options visible', timeout: 3000 });
            },
        },

        {
            id: 'note-editor-ctrl-d-date-trigger',
            name: 'note-editor: Ctrl+D opens date picker, Ctrl+Shift+D opens datetime picker',
            url: '/debug/note-editor',
            run: async function (ctx) {
                var doc = ctx.doc;
                var win = ctx.win || (doc.defaultView);
                var ne = await ctx.waitFor(function () { return doc.querySelector('note-editor'); }, { label: 'note-editor' });
                var ta = await ctx.waitFor(function () {
                    return ne.shadowRoot && ne.shadowRoot.querySelector('textarea');
                }, { label: 'editor textarea' });

                function pickers() {
                    return doc.querySelectorAll('body > date-time-picker');
                }
                function fireKey(target, key, opts) {
                    var ev = new (win.KeyboardEvent || KeyboardEvent)('keydown', Object.assign({
                        key: key, bubbles: true, cancelable: true,
                    }, opts || {}));
                    target.dispatchEvent(ev);
                }

                // 1) Ctrl+D in textarea → date-time-picker opens in date mode.
                ta.focus();
                ta.value = 'note ';
                ta.selectionStart = ta.selectionEnd = ta.value.length;
                fireKey(ta, 'd', { ctrlKey: true });
                var picker = await ctx.waitFor(function () {
                    var ps = pickers();
                    if (ps.length !== 1) return null;
                    return ps[0].getAttribute('mode') !== 'datetime' ? ps[0] : null;
                }, { label: 'date picker open' });
                var today = new Date();
                var pad = function (n) { return String(n).padStart(2, '0'); };
                var expectedToday = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
                ctx.assert(picker.value === expectedToday, 'picker should default to today ' + expectedToday + ', got ' + picker.value);

                // 2) Set value & dispatch change → trigger inserts formatted date.
                picker.value = '2026-01-15';
                picker.dispatchEvent(new (win.CustomEvent || CustomEvent)('datetime-selected', {
                    detail: { value: '2026-01-15' }, bubbles: true, composed: true,
                }));
                await ctx.waitFor(function () {
                    return ta.value === 'note 2026-01-15';
                }, { label: 'textarea contains formatted date' });
                ctx.assert(pickers().length === 0, 'picker should close after selection');

                // 3) Ctrl+Shift+D → datetime picker opens.
                ta.value = 'when ';
                ta.selectionStart = ta.selectionEnd = ta.value.length;
                ta.focus();
                fireKey(ta, 'D', { ctrlKey: true, shiftKey: true });
                var dtPicker = await ctx.waitFor(function () {
                    var ps = pickers();
                    if (ps.length !== 1) return null;
                    return ps[0].getAttribute('mode') === 'datetime' ? ps[0] : null;
                }, { label: 'datetime picker open' });
                ctx.assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dtPicker.value), 'datetime picker should default to YYYY-MM-DD HH:MM, got ' + dtPicker.value);
                dtPicker.value = '2026-12-31 15:30';
                dtPicker.dispatchEvent(new (win.CustomEvent || CustomEvent)('datetime-selected', {
                    detail: { value: '2026-12-31 15:30' }, bubbles: true, composed: true,
                }));
                await ctx.waitFor(function () {
                    return ta.value === 'when 2026-12-31 15:30';
                }, { label: 'textarea contains formatted datetime' });

                // 4) Esc on the picker cancels without inserting.
                ta.value = 'cancel ';
                ta.selectionStart = ta.selectionEnd = ta.value.length;
                ta.focus();
                fireKey(ta, 'd', { ctrlKey: true });
                await ctx.waitFor(function () { return pickers()[0]; }, { label: 'picker re-opens' });
                doc.dispatchEvent(new (win.KeyboardEvent || KeyboardEvent)('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
                await ctx.waitFor(function () { return pickers().length === 0; }, { label: 'picker closes on Escape' });
                ctx.assert(ta.value === 'cancel ', 'textarea unchanged after Escape, got ' + ta.value);
            },
        },
    ];

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SCENARIOS: SCENARIOS, sleep: sleep, waitFor: waitFor, assert: assert };
    } else {
        root.WN_TEST_SCENARIOS = SCENARIOS;
        root.WN_TEST_HELPERS = { sleep: sleep, waitFor: waitFor, assert: assert, shadowOf: shadowOf };
    }
})(typeof window !== 'undefined' ? window : globalThis);
