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
            name: 'task-add-modal + click dispatches task:request-edit (create mode)',
            url: '/debug/task-add-modal',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tam = await ctx.waitFor(function () { return doc.querySelector('task-add-modal'); }, { label: 'task-add-modal' });
                var sr = tam.shadowRoot;
                var trigger = await ctx.waitFor(function () { return sr.querySelector('button[data-act="add"]'); }, { label: '+ trigger' });
                var captured = null;
                doc.addEventListener('task:request-edit', function (ev) { captured = ev.detail; }, { once: true });
                trigger.click();
                ctx.assert(captured, 'expected task:request-edit to fire');
                ctx.assert(captured.task && !captured.task.id, 'expected empty task (create mode)');
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
            id: 'task-note-modal-mention-autocomplete',
            name: 'task-note-modal @mention autocomplete opens and inserts',
            url: '/debug/task-note-modal',
            run: async function (ctx) {
                var doc = ctx.doc;
                var modal = await ctx.waitFor(function () { return doc.querySelector('task-note-modal'); }, { label: 'task-note-modal' });
                ctx.assert(typeof modal.open === 'function', 'expected open()');
                modal.setAttribute('people_service', 'MockPeopleService');
                modal.setAttribute('companies_service', 'MockCompaniesService');
                modal.setAttribute('teams_service', 'MockTeamsService');
                modal.open({ id: 'demo-note', text: 'Demo task', note: '' }, function () {});
                var ta = await ctx.waitFor(function () {
                    var input = modal.shadowRoot && modal.shadowRoot.querySelector('[data-el="note"]');
                    return input && input.textarea ? input.textarea : null;
                }, { label: 'note textarea' });
                ta.focus();
                ta.value = '@me';
                ta.selectionStart = ta.selectionEnd = ta.value.length;
                ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

                var pop = await ctx.waitFor(function () {
                    var p = ta.getRootNode().querySelector('[role="listbox"]');
                    return p && !p.hidden && p.children.length > 0 ? p : null;
                }, { label: 'mention dropdown visible', timeout: 2000 });

                ctx.assert(pop.textContent.indexOf('meg') >= 0 || pop.textContent.indexOf('me') >= 0,
                    'dropdown should show matching person, got: ' + pop.textContent.slice(0, 80));
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                await ctx.sleep(100);
                ctx.assert(ta.value.indexOf('@me') >= 0,
                    'textarea should contain @mention after selection, got: ' + ta.value);
                modal.close();
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
            id: 'task-modal-reconnect-shortcuts',
            name: 'task modals restore keyboard shortcuts after reconnecting',
            url: '/debug/task-note-modal',
            run: async function (ctx) {
                await import('/components/task-note-modal.js');
                await import('/components/task-complete-modal.js');
                var variants = [
                    { tag: 'task-note-modal', input: 'note', flag: 'saved' },
                    { tag: 'task-complete-modal', input: 'comment', flag: 'confirmed' },
                ];
                for (var variant of variants) {
                    var modal = ctx.doc.createElement(variant.tag);
                    ctx.doc.body.appendChild(modal);
                    modal.remove();
                    ctx.doc.body.appendChild(modal);
                    var result = null;
                    try {
                        modal.open({ id: 'reconnected', text: 'Synthetic task' }, function (value) { result = value; });
                        var input = await ctx.waitFor(function () {
                            var field = modal.shadowRoot.querySelector('[data-el="' + variant.input + '"]');
                            return field && field.textarea ? field.textarea : null;
                        }, { label: variant.tag + ' ready' });
                        input.value = 'Saved after reconnect';
                        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        input.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter', ctrlKey: true, bubbles: true, composed: true, cancelable: true,
                        }));
                        await ctx.waitFor(function () { return result; }, { label: variant.tag + ' callback' });
                        ctx.assert(result[variant.flag] === true, 'keyboard action must succeed after reconnect');
                        ctx.assert(result[variant.input] === 'Saved after reconnect', 'keyboard action must preserve the text');
                    } finally {
                        modal.close();
                        modal.remove();
                    }
                }
            },
        },

        {
            id: 'time-picker-rounds-to-step',
            name: 'time-picker setter rounds to step',
            url: '/debug/time-picker',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tp = await ctx.waitFor(function () { return doc.querySelector('time-picker'); }, { label: 'time-picker' });
                await ctx.waitFor(function () { return tp.shadowRoot && tp.shadowRoot.querySelector('select'); }, { label: 'time-picker upgraded' });
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
            id: 'markdown-preview-detached-custom-elements',
            name: 'markdown-preview helper renders custom elements in detached docs',
            url: '/debug/markdown-preview',
            run: async function (ctx) {
                var doc = ctx.doc;
                var win = ctx.win;
                await ctx.waitFor(function () { return win.marked && win.marked.parse; }, { label: 'window.marked', timeout: 5000 });
                var helper = await import('/services/_shared/wn-markdown-preview.js');
                var frame = doc.createElement('iframe');
                var loaded = new Promise(function (resolve) { frame.addEventListener('load', resolve, { once: true }); });
                frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
                doc.body.appendChild(frame);
                var preview;
                try {
                    await loaded;
                    preview = helper.createDetachedMarkdownPreview(frame.contentDocument, {
                        marked: win.marked,
                        services: win['week-note-services'],
                        title: 'Scenario preview',
                    });
                    await preview.ready;
                    preview.render('# Hello\n\n<entity-mention kind="person" key="ada" label="Ada Test"></entity-mention>\n\n<inline-action kind="task" label="Ring @ada"></inline-action>');

                    await ctx.waitFor(function () {
                        var root = frame.contentDocument.querySelector('#pip-root');
                        if (!root) return null;
                        return root.querySelector('entity-mention') && root.querySelector('inline-action') ? root : null;
                    }, { label: 'detached preview rendered', timeout: 5000 });

                    var root = frame.contentDocument.querySelector('#pip-root');
                    var cwin = frame.contentWindow;
                    ctx.assert(cwin.getComputedStyle(root).paddingTop === '20px', 'expected shared detached padding, got ' + cwin.getComputedStyle(root).paddingTop);
                    var entity = root.querySelector('entity-mention');
                    ctx.assert(entity && entity.shadowRoot && /Ada Test/.test(entity.shadowRoot.textContent), 'expected entity-mention to render label');
                    var pill = root.querySelector('inline-action');
                    ctx.assert(pill && pill.shadowRoot && /Ring/.test(pill.shadowRoot.textContent), 'expected inline-action to render label');
                    ctx.assert(!!(pill && pill.shadowRoot && pill.shadowRoot.querySelector('entity-mention')), 'expected inline-action nested mention chip');
                } finally {
                    if (preview) preview.destroy();
                    frame.remove();
                }
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
            id: 'feature-rich-text-area-form-field',
            name: 'feature-rich-text-area works as a form field with selectable features',
            url: '/debug/feature-rich-text-area',
            run: async function (ctx) {
                var doc = ctx.doc;
                await ctx.waitFor(function () { return doc.defaultView.customElements.get('feature-rich-text-area'); }, { label: 'editor defined' });
                var form = doc.createElement('form');
                form.innerHTML = '<feature-rich-text-area name="notes" rows="3" features="emoji,mentions" value="Start"></feature-rich-text-area>';
                doc.body.appendChild(form);
                try {
                    var field = form.querySelector('feature-rich-text-area');
                    var ta = await ctx.waitFor(function () { return field.textarea; }, { label: 'field textarea' });
                    ctx.assert(new FormData(form).get('notes') === 'Start', 'FormData should read the initial value');
                    ctx.assert(!field.shadowRoot.querySelector('.editor-help'), 'help line should be hidden unless enabled');
                    ctx.assert(field.getBoundingClientRect().height < 200, 'rows should size the field to its content, got ' + field.getBoundingClientRect().height);

                    field.focus();
                    ctx.assert(field.shadowRoot.activeElement === ta, 'focus() should focus the inner textarea');

                    var changed = 0;
                    field.addEventListener('change', function () { changed++; });
                    ta.value = 'Ny tekst';
                    ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    ta.dispatchEvent(new Event('change', { bubbles: true }));
                    ctx.assert(changed === 1, 'change should be re-dispatched on the host');
                    ctx.assert(new FormData(form).get('notes') === 'Ny tekst', 'FormData should follow edits');

                    ta.value = '- item';
                    ta.setSelectionRange(6, 6);
                    var enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
                    ta.dispatchEvent(enter);
                    ctx.assert(!enter.defaultPrevented, 'list continuation should be off when "lists" is not enabled');
                    var tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
                    ta.dispatchEvent(tab);
                    ctx.assert(!tab.defaultPrevented, 'Tab must move focus when "indent" is not enabled');

                    var picked;
                    field.triggers = [{
                        detect: function (text, caret) { return text.slice(0, caret).endsWith('%x') ? { query: '', start: caret - 2, end: caret } : null; },
                        fetchItems: async function () { return [{ value: 'X', label: 'Eksempel' }]; },
                        onSelect: function (item) { picked = item.value; },
                    }];
                    ta.value = '%x';
                    ta.setSelectionRange(2, 2);
                    ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    await ctx.waitFor(function () {
                        var pop = field.shadowRoot.querySelector('[role="listbox"]');
                        return pop && !pop.hidden && pop.querySelector('button');
                    }, { label: 'host trigger suggestions' });
                    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                    ctx.assert(picked === 'X', 'host-provided triggers should be selectable');

                    field.setAttribute('readonly', '');
                    ta = await ctx.waitFor(function () { return field.textarea && field.textarea.readOnly ? field.textarea : null; }, { label: 'readonly textarea' });
                    ta.value = 'låst ::';
                    ta.setSelectionRange(7, 7);
                    ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    ctx.assert(!field.shadowRoot.querySelector('.emoji-pop[open]'), 'readonly field should not open the emoji picker');

                    form.reset();
                    ctx.assert(field.value === 'Start', 'form reset should restore the initial value, got ' + field.value);
                } finally {
                    form.remove();
                }
            },
        },

        {
            id: 'feature-rich-text-area-smart-markdown',
            name: 'feature-rich-text-area continues lists and inserts emoji at selection',
            url: '/debug/feature-rich-text-area',
            run: async function (ctx) {
                var doc = ctx.doc;
                var editor = await ctx.waitFor(function () {
                    return doc.querySelector('#dbg-rich-text');
                }, { label: 'feature-rich-text-area' });
                var preview = await ctx.waitFor(function () {
                    return doc.querySelector('#dbg-rich-text-preview');
                }, { label: 'paired Markdown renderer' });
                var ta = await ctx.waitFor(function () { return editor.textarea; }, { label: 'Markdown textarea' });
                ctx.assert(ta.value.indexOf('# Smart Markdown') === 0, 'initial Markdown value should reach the textarea');
                ctx.assert(editor.shadowRoot.querySelector('.editor-help')?.textContent.includes('Ctrl+M møte'),
                    'editor should show its feature help line');
                ta.focus();
                ta.value = 'Hei @ast';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                var mentionRow = await ctx.waitFor(function () {
                    var pop = editor.shadowRoot.querySelector('[role="listbox"]');
                    return pop && !pop.hidden ? pop.querySelector('button[data-idx]') : null;
                }, { label: '@mention suggestions owned by the rich editor' });
                ctx.assert(mentionRow.textContent.includes('Astrid'), '@ast should suggest Astrid, got: ' + mentionRow.textContent);
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                ctx.assert(ta.value === 'Hei @astrid ', 'Enter should insert the mention, got: ' + JSON.stringify(ta.value));
                var win = doc.defaultView;
                var apiCalls = [];
                var realFetch = win.fetch;
                win.fetch = function (url) {
                    if (String(url).indexOf('/api/') >= 0) apiCalls.push(String(url));
                    return realFetch.apply(this, arguments);
                };
                try {
                    var bare = doc.createElement('feature-rich-text-area');
                    var bareMd = doc.createElement('feature-rich-markdown');
                    doc.body.appendChild(bare);
                    doc.body.appendChild(bareMd);
                    var bareTa = await ctx.waitFor(function () { return bare.textarea; }, { label: 'bare editor textarea' });
                    bareTa.value = '@ast';
                    bareTa.setSelectionRange(4, 4);
                    bareTa.dispatchEvent(new Event('input', { bubbles: true }));
                    bareMd.value = 'Hei @astrid';
                    await ctx.sleep(300);
                    ctx.assert(apiCalls.length === 0, 'mentions must use injected services, not direct API calls: ' + apiCalls.join(', '));
                    bare.remove();
                    bareMd.remove();
                } finally {
                    win.fetch = realFetch;
                }
                ta.value = '# Smart Markdown';
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                await ctx.waitFor(function () {
                    return preview.shadowRoot.querySelector('.root h1')?.textContent === 'Smart Markdown';
                }, { label: 'initial Markdown rendered beside editor' });
                var publishedInput;
                editor.addEventListener('feature-rich-text-area:input', function (event) {
                    publishedInput = { value: event.detail?.value, bubbles: event.bubbles, composed: event.composed };
                });
                function press(key, opts) {
                    ta.dispatchEvent(new KeyboardEvent('keydown', Object.assign({
                        key: key, bubbles: true, cancelable: true,
                    }, opts || {})));
                }

                ta.value = '1. First';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                press('Enter');
                ctx.assert(ta.value === '1. First\n2. ', 'ordered list should increment, got: ' + JSON.stringify(ta.value));

                ta.value = '- one two';
                ta.setSelectionRange(5, 5);
                press('Enter');
                ctx.assert(ta.value === '- one\n- two', 'Enter should split a list item at the caret, got: ' + JSON.stringify(ta.value));

                ta.value = '- [x] Completed';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                press('Enter');
                ctx.assert(ta.value === '- [x] Completed\n- [ ] ', 'new task-list item should be unchecked, got: ' + JSON.stringify(ta.value));

                ta.value = '- ';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                press('Enter');
                ctx.assert(ta.value === '\n', 'empty list should exit, got: ' + JSON.stringify(ta.value));

                ta.value = 'first\nsecond';
                ta.setSelectionRange(0, ta.value.length);
                press('Tab');
                ctx.assert(ta.value === '    first\n    second', 'Tab should indent selected lines, got: ' + JSON.stringify(ta.value));
                press('Tab', { shiftKey: true });
                ctx.assert(ta.value === 'first\nsecond', 'Shift+Tab should outdent selected lines, got: ' + JSON.stringify(ta.value));
                ta.value = 'first\nsecond';
                ta.setSelectionRange(0, 6);
                press('Tab');
                ctx.assert(ta.value === '    first\nsecond', 'indent should not affect an unselected next line, got: ' + JSON.stringify(ta.value));
                ta.value = 'beforeafter';
                ta.setSelectionRange(6, 6);
                press('Tab');
                ctx.assert(ta.value === 'before    after', 'Tab at a caret should insert indentation, got: ' + JSON.stringify(ta.value));

                ta.value = '{{?';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                var taskOptions = await ctx.waitFor(function () {
                    var list = editor.shadowRoot.querySelector('[role="listbox"]');
                    return list && !list.hidden && list.children.length ? list : null;
                }, { label: 'standalone task suggestions' });
                ctx.assert(taskOptions.textContent.indexOf('Forberede demo for fredag') >= 0,
                    'rich editor should load task suggestions from tasks_service');
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                ctx.assert(ta.value === '{{?t1}} ', 'task shortcut should insert a task marker, got: ' + ta.value);

                ta.value = 'a::c';
                ta.setSelectionRange(3, 3);
                ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await ctx.waitFor(function () {
                    return preview.value === 'a::c';
                }, { label: 'renderer follows editor input' });
                ctx.assert(publishedInput?.value === 'a::c' && publishedInput.bubbles && publishedInput.composed,
                    'editor should publish the current value in a bubbling, composed input event');
                ctx.assert(!editor.shadowRoot.querySelector('.emoji-toggle'), 'emoji toolbar button should be removed');
                var picker = editor.shadowRoot.querySelector('icon-picker');
                var pop = await ctx.waitFor(function () {
                    return editor.shadowRoot.querySelector('.emoji-pop[open]');
                }, { label: 'emoji selector opens for ::' });
                var search = editor.shadowRoot.querySelector('.emoji-search');
                function emojiKey(key) {
                    search.dispatchEvent(new KeyboardEvent('keydown', {
                        key: key, bubbles: true, composed: true, cancelable: true,
                    }));
                }
                function activeEmoji() {
                    var cells = picker.shadowRoot.querySelectorAll('.cell.selected');
                    return cells.length === 1 ? cells[0].dataset.icon : 'highlighted=' + cells.length;
                }
                function searchFor(text) {
                    search.value = text;
                    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                }
                try { localStorage.removeItem('wn-emoji-recent'); } catch (_) {}
                ctx.assert(editor.shadowRoot.activeElement === search, 'emoji search should get focus on ::');
                ctx.assert(activeEmoji() === '😀', 'first emoji should be highlighted, got: ' + activeEmoji());
                ctx.assert(editor.shadowRoot.querySelector('.emoji-preview-name').textContent === ':grinning:',
                    'preview line should show the highlighted shortcode');
                emojiKey('ArrowRight');
                ctx.assert(activeEmoji() === '😃', 'ArrowRight should move to the next emoji');
                emojiKey('ArrowDown');
                emojiKey('ArrowUp');
                emojiKey('ArrowLeft');
                ctx.assert(activeEmoji() === '😀', 'arrow keys should navigate the emoji grid');
                emojiKey('Enter');
                ctx.assert(ta.value === 'a:grinning:c', 'Enter should replace :: with the emoji shortcode, got: ' + ta.value);
                ctx.assert(!pop.hasAttribute('open'), 'selector should close after selecting');
                await ctx.waitFor(function () {
                    return preview.shadowRoot.querySelector('.root')?.textContent.indexOf('a😀c') >= 0;
                }, { label: 'emoji shortcode rendered as emoji' });

                ta.value = 'r::';
                ta.setSelectionRange(3, 3);
                ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await ctx.waitFor(function () { return pop.hasAttribute('open'); }, { label: 'emoji selector opens for search' });
                ctx.assert(search.value === '', 'search should reset when the selector reopens');
                ctx.assert(picker.shadowRoot.querySelector('.group-name')?.textContent === 'Nylig brukt',
                    'recently used emojis should be listed first');
                ctx.assert(activeEmoji() === '😀', 'recent emoji should be highlighted first');
                searchFor('qxqx');
                ctx.assert(!editor.shadowRoot.querySelector('.emoji-empty').hidden, 'no-match message should show');
                emojiKey('Enter');
                ctx.assert(ta.value === 'r::' && pop.hasAttribute('open'), 'Enter without matches should do nothing');
                searchFor('rocket');
                ctx.assert(activeEmoji() === '🚀', 'exact shortcode match should rank first');
                searchFor('tommel');
                ctx.assert(activeEmoji() === '👍', 'Norwegian keyword should find thumbs up, got: ' + activeEmoji());
                searchFor('avocado');
                await ctx.waitFor(function () { return activeEmoji() === '🥑'; },
                    { label: 'search should cover the full renderable emoji catalog' });
                searchFor('hart');
                var hartHits = Array.prototype.map.call(picker.shadowRoot.querySelectorAll('.cell'), function (cell) {
                    return cell.dataset.icon;
                });
                ctx.assert(hartHits.indexOf('🥰') >= 0, 'misspelled "hart" should find smiling_face_with_three_hearts');
                ctx.assert(hartHits.indexOf('📈') === -1 || hartHits.indexOf('📈') > hartHits.indexOf('🥰'),
                    'typo matches on whole words should rank above mid-word substrings like chart, got: ' + hartHits.join(''));
                searchFor('har');
                var harHits = Array.prototype.map.call(picker.shadowRoot.querySelectorAll('.cell'), function (cell) {
                    return cell.dataset.icon;
                });
                ctx.assert(harHits.slice(0, 5).join('') === hartHits.slice(0, 5).join(''),
                    '"har" and "hart" should rank the same heart emojis first, got: ' + harHits.slice(0, 5).join('') + ' vs ' + hartHits.slice(0, 5).join(''));
                searchFor('three hearts');
                var threeHits = Array.prototype.map.call(picker.shadowRoot.querySelectorAll('.cell'), function (cell) {
                    return cell.dataset.icon;
                });
                ctx.assert(threeHits[0] === '🥰', '_ should separate words so "three hearts" finds smiling_face_with_three_hearts first, got: ' + threeHits.join(''));
                searchFor('twoheart');
                ctx.assert(!picker.shadowRoot.querySelector('[data-icon="💕"]'),
                    'a query word must not match across _ (two_hearts) boundaries');
                searchFor('avocado');
                emojiKey('Enter');
                ctx.assert(ta.value === 'r:avocado:', 'Enter should insert the searched emoji, got: ' + ta.value);
                await ctx.waitFor(function () {
                    return preview.shadowRoot.querySelector('.root')?.textContent.indexOf('r🥑') >= 0;
                }, { label: 'catalog emoji renders in preview' });

                ta.value = 'x::y';
                ta.setSelectionRange(3, 3);
                ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await ctx.waitFor(function () { return pop.hasAttribute('open'); }, { label: 'emoji selector reopens' });
                emojiKey('Escape');
                ctx.assert(!pop.hasAttribute('open'), 'Esc should close the emoji selector');
                ctx.assert(ta.value === 'xy', 'Esc should remove the :: trigger, got: ' + ta.value);

                ta.value = 'date ';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
                var datePicker = await ctx.waitFor(function () {
                    return doc.querySelector('body > date-time-picker[mode="date"]');
                }, { label: 'standalone date shortcut' });
                datePicker.value = '2026-10-30';
                datePicker.dispatchEvent(new CustomEvent('datetime-selected', {
                    detail: { value: '2026-10-30' }, bubbles: true, composed: true,
                }));
                ctx.assert(ta.value === 'date 2026-10-30', 'Ctrl+D should insert the selected date');

                ta.value = 'meeting ';
                ta.setSelectionRange(ta.value.length, ta.value.length);
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true, cancelable: true }));
                var title = await ctx.waitFor(function () { return doc.querySelector('input.m-title'); }, { label: 'standalone meeting shortcut' });
                title.value = 'Demo meeting';
                doc.querySelector('.m-insert').click();
                ctx.assert(ta.value.indexOf('meeting {{m:Demo meeting @ ') === 0, 'Ctrl+M should insert a meeting marker at the caret, got: ' + ta.value);
            },
        },

        {
            id: 'note-editor-feature-preview',
            name: 'note-editor passes task and mention features to its live renderer',
            url: '/debug/note-editor',
            run: async function (ctx) {
                var doc = ctx.doc;
                var editor = await ctx.waitFor(function () {
                    return doc.querySelector('note-editor');
                }, { label: 'note-editor' });
                await ctx.waitFor(function () {
                    return editor._previewEl && editor._previewEl._featureDataLoaded;
                }, { label: 'preview feature data loaded' });
                var control = editor.shadowRoot.querySelector('.ne-content');
                var textarea = control && control.textarea;
                ctx.assert(textarea, 'note editor Markdown input should be available');
                textarea.value = '{{?';
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                var taskOptions = await ctx.waitFor(function () {
                    var list = control.shadowRoot.querySelector('[role="listbox"]');
                    return list && !list.hidden && list.children.length ? list : null;
                }, { label: 'task autocomplete options' });
                ctx.assert(taskOptions.textContent.indexOf('Forberede demo for fredag') >= 0,
                    'typing {{? should offer open tasks, got: ' + taskOptions.textContent);
                textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                ctx.assert(textarea.value === '{{?t1}} ', 'selecting a task should insert its task marker, got: ' + textarea.value);
                editor.setContent('{{?t1}}\n\n@astrid');
                editor._renderPreview();
                await ctx.waitFor(function () {
                    var root = editor._previewEl.shadowRoot.querySelector('.root');
                    return root.querySelector('input[type="checkbox"][disabled]') &&
                        root.querySelector('entity-mention');
                }, { label: 'task and mention rendered' });
                var root = editor._previewEl.shadowRoot.querySelector('.root');
                ctx.assert(root.textContent.indexOf('Forberede demo for fredag') >= 0,
                    'preview should resolve task text from the note editor service');
            },
        },

        {
            id: 'feature-rich-markdown-renders-features',
            name: 'feature-rich-markdown renders task markers and entity mentions',
            url: '/debug/feature-rich-markdown',
            run: async function (ctx) {
                var doc = ctx.doc;
                var preview = await ctx.waitFor(function () {
                    return doc.querySelector('#dbg-rich-markdown');
                }, { label: 'feature-rich-markdown' });
                await ctx.waitFor(function () {
                    return preview._featureDataLoaded &&
                        preview.shadowRoot.querySelector('.root entity-mention');
                }, { label: 'entity mention rendered' });
                var root = preview.shadowRoot.querySelector('.root');
                ctx.assert(root.textContent.indexOf('Forberede demo for fredag') >= 0,
                    'task marker should resolve seeded task text, got: ' + root.textContent);
                ctx.assert(root.querySelector('input[type="checkbox"][disabled]'),
                    'task marker should render a disabled checkbox');
                ctx.assert(root.querySelector('input[type="checkbox"][disabled][checked]'),
                    'completed task marker should render checked');
                ctx.assert(root.querySelector('entity-mention'),
                    'person mention should render as an entity-mention component');
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
                    var control = ne.shadowRoot && ne.shadowRoot.querySelector('.ne-content');
                    return control && control.textarea;
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

        // ---- overdue tasks sort to top with visual indicator ----
        {
            id: 'task-open-list-overdue-sort',
            name: 'task-open-list sorts overdue tasks to top with .overdue class',
            url: '/debug/task-open-list',
            run: async function (ctx) {
                var doc = ctx.doc;
                var list = await ctx.waitFor(function () { return doc.querySelector('task-open-list'); }, { label: 'task-open-list element' });
                var rows = await ctx.waitFor(function () {
                    var sr = list.shadowRoot;
                    if (!sr) return null;
                    var n = sr.querySelectorAll('.sidebar-task');
                    return n.length >= 4 ? n : null;
                }, { label: 'open task rows (>=4)' });

                // t7 has dueDate in the past → should be first and have .overdue
                var firstText = rows[0].textContent;
                ctx.assert(/faktura/i.test(firstText), 'first task should be overdue "faktura" task, got: ' + firstText.trim().slice(0, 60));
                ctx.assert(rows[0].classList.contains('overdue'), 'first row should have .overdue class');

                // non-overdue rows should NOT have .overdue
                var nonOverdue = 0;
                for (var i = 1; i < rows.length; i++) {
                    if (!rows[i].classList.contains('overdue')) nonOverdue++;
                }
                ctx.assert(nonOverdue >= 1, 'at least one non-overdue row should exist');
            },
        },

        // ---- today-calendar renders a grid ----
        {
            id: 'today-calendar-renders-grid',
            name: 'today-calendar renders the mini calendar grid',
            url: '/debug/today-calendar',
            run: async function (ctx) {
                var doc = ctx.doc;
                var tc = await ctx.waitFor(function () { return doc.querySelector('today-calendar'); }, { label: 'today-calendar element' });
                // Wait for the inner week-calendar to appear and render its grid
                await ctx.waitFor(function () {
                    var sr = tc.shadowRoot;
                    if (!sr) return null;
                    var wc = sr.querySelector('week-calendar');
                    if (!wc || !wc.shadowRoot) return null;
                    return wc.shadowRoot.querySelector('.grid');
                }, { label: 'week-calendar grid rendered', timeout: 5000 });

                // Verify heading includes today's date text
                var sr = tc.shadowRoot;
                var heading = sr.querySelector('h3, .heading, [class*="head"]');
                ctx.assert(heading, 'today-calendar should have a heading element');
                var headText = heading.textContent.trim();
                ctx.assert(headText.length > 0, 'heading should contain text');
                ctx.assert(/dag|mon|tir|ons|tor|fre|lør|søn/i.test(headText), 'heading should contain a day name, got: ' + headText);
            },
        },

        // ---- ctx-switcher shows color dots ----
        {
            id: 'ctx-switcher-color-dots',
            name: 'ctx-switcher renders color dots for contexts with a color',
            url: '/debug/ctx-switcher',
            run: async function (ctx) {
                var doc = ctx.doc;
                var cs = await ctx.waitFor(function () { return doc.querySelector('ctx-switcher'); }, { label: 'ctx-switcher element' });
                await ctx.waitFor(function () {
                    var sr = cs.shadowRoot;
                    return sr && sr.textContent && sr.textContent.trim().length > 0;
                }, { label: 'ctx-switcher rendered' });

                // Open the dropdown
                var sr = cs.shadowRoot;
                var trigger = sr.querySelector('.ctx-trigger');
                if (trigger) trigger.click();
                await ctx.waitFor(function () {
                    return sr.querySelectorAll('.ctx-item').length >= 3;
                }, { label: 'context items visible', timeout: 3000 });

                // Check for color dots
                var dots = sr.querySelectorAll('.ctx-color-dot');
                ctx.assert(dots.length >= 2, 'expected >=2 color dots in dropdown, got ' + dots.length);
            },
        },

        // ---- settings page renders app-level tabs ----
        {
            id: 'settings-page-app-tabs',
            name: 'settings-page renders app-level tabs including Kalender',
            url: '/debug/settings-page',
            run: async function (ctx) {
                var doc = ctx.doc;
                var sp = await ctx.waitFor(function () { return doc.querySelector('settings-page'); }, { label: 'settings-page element' });
                // Wait for the component to finish rendering
                await ctx.waitFor(function () {
                    var sr = sp.shadowRoot;
                    if (!sr) return null;
                    // The settings page should have rendered its tab bar
                    var tabs = sr.querySelectorAll('.app-tab, [data-app-tab], .tab-btn, button');
                    return tabs.length >= 3 ? tabs : null;
                }, { label: 'settings tabs rendered', timeout: 5000 });

                // Find the Kalender tab specifically
                var sr = sp.shadowRoot;
                var allText = sr.textContent || '';
                ctx.assert(/Kalender|📅/i.test(allText), 'settings page should contain Kalender tab text');
            },
        },

        // ---- goals-page master/detail layout ----
        {
            id: 'goals-page-master-detail',
            name: 'goals-page renders master list and detail pane',
            url: '/debug/goals-page',
            run: async function (ctx) {
                var doc = ctx.doc;
                var gp = await ctx.waitFor(function () { return doc.querySelector('goals-page'); }, { label: 'goals-page element' });
                // Wait for goals to load and render
                var masterItems = await ctx.waitFor(function () {
                    var sr = gp.shadowRoot;
                    if (!sr) return null;
                    var items = sr.querySelectorAll('.gp-item');
                    return items.length >= 2 ? items : null;
                }, { label: 'goal items rendered', timeout: 5000 });

                ctx.assert(masterItems.length >= 2, 'expected >=2 goal items, got ' + masterItems.length);

                // Verify master panel exists
                var sr = gp.shadowRoot;
                var master = sr.querySelector('.gp-master');
                ctx.assert(master, 'master panel (.gp-master) should exist');

                // Verify detail pane exists
                var detail = sr.querySelector('.gp-detail-pane');
                ctx.assert(detail, 'detail pane (.gp-detail-pane) should exist');

                // An active goal should be auto-selected — detail should have content
                await ctx.waitFor(function () {
                    return detail.textContent.trim().length > 10;
                }, { label: 'detail pane populated', timeout: 3000 });

                // The detail should show the first active goal's title
                var detailText = detail.textContent;
                ctx.assert(/Lansere|plattformen|omsetning/i.test(detailText), 'detail should show a goal title');
            },
        },

        // ---- pick-date-time-span renders and selects ----
        {
            id: 'pick-date-time-span-renders',
            name: 'pick-date-time-span renders triggers and supports selection',
            url: '/debug/pick-date-time-span',
            run: async function (ctx) {
                var doc = ctx.doc;
                var span = await ctx.waitFor(function () { return doc.querySelector('pick-date-time-span'); }, { label: 'pick-date-time-span element' });

                // Set start/end programmatically
                span.start = '2026-05-20 09:00';
                span.end = '2026-05-20 10:00';

                // Wait for re-render showing the formatted values
                var sr = span.shadowRoot;
                await ctx.waitFor(function () {
                    var startBtn = sr.querySelector('[data-trigger="start"]');
                    return startBtn && /20\.5/.test(startBtn.textContent);
                }, { label: 'start trigger shows date', timeout: 3000 });

                var startBtn = sr.querySelector('[data-trigger="start"]');
                var endBtn = sr.querySelector('[data-trigger="end"]');
                ctx.assert(startBtn, 'start trigger should exist');
                ctx.assert(endBtn, 'end trigger should exist');
                ctx.assert(/09:00/.test(startBtn.textContent), 'start trigger should show 09:00, got: ' + startBtn.textContent);
                ctx.assert(/10:00/.test(endBtn.textContent), 'end trigger should show 10:00, got: ' + endBtn.textContent);

                // Setting start past end should push end forward
                span.start = '2026-05-20 11:00';
                await ctx.waitFor(function () {
                    return span.end > '2026-05-20 11:00';
                }, { label: 'end pushed forward', timeout: 2000 });
                ctx.assert(span.end >= '2026-05-20 12:00', 'end should be pushed to at least 12:00, got: ' + span.end);
            },
        },

        // ---- date-time-picker min attribute disables days ----
        {
            id: 'date-time-picker-min-disables-days',
            name: 'date-time-picker min attribute disables earlier days',
            url: '/debug/date-time-picker',
            run: async function (ctx) {
                var doc = ctx.doc;
                var picker = await ctx.waitFor(function () { return doc.querySelector('date-time-picker'); }, { label: 'date-time-picker element' });

                // Set to a known date and add min
                picker.value = '2026-05-20';
                picker.setAttribute('min', '2026-05-15');

                // Wait for render
                await ctx.sleep(200);

                var sr = picker.shadowRoot;
                var days = sr.querySelectorAll('.day:not(.is-out)');
                var disabledDays = sr.querySelectorAll('.day:not(.is-out).is-disabled');
                var enabledDays = sr.querySelectorAll('.day:not(.is-out):not(.is-disabled)');

                // Days 1-14 should be disabled (before min of 15th)
                ctx.assert(disabledDays.length >= 14, 'expected >=14 disabled days (1-14), got ' + disabledDays.length);
                ctx.assert(enabledDays.length >= 16, 'expected >=16 enabled days (15-31), got ' + enabledDays.length);

                // Day 14 should be disabled
                var day14 = Array.from(days).find(function (d) { return d.textContent.trim() === '14'; });
                ctx.assert(day14 && day14.classList.contains('is-disabled'), 'day 14 should be disabled');

                // Day 15 should NOT be disabled
                var day15 = Array.from(days).find(function (d) { return d.textContent.trim() === '15'; });
                ctx.assert(day15 && !day15.classList.contains('is-disabled'), 'day 15 should not be disabled');
            },
        },

        // ---- meeting create end > start server validation ----
        {
            id: 'meeting-create-end-before-start-rejected',
            name: 'meeting-create rejects end time before start time',
            url: '/debug/meeting-create',
            run: async function (ctx) {
                var doc = ctx.doc;
                var mc = await ctx.waitFor(function () { return doc.querySelector('meeting-create'); }, { label: 'meeting-create element' });
                var sr = mc.shadowRoot;

                // Wait for the form to render
                await ctx.waitFor(function () {
                    return sr.querySelector('pick-date-time-span');
                }, { label: 'form rendered', timeout: 5000 });

                // The pick-date-time-span should be present
                var span = sr.querySelector('pick-date-time-span');
                ctx.assert(span, 'pick-date-time-span should be in meeting-create form');

                // Verify start/end are populated and end > start by default
                await ctx.sleep(200);
                ctx.assert(span.start, 'start should be set by default');
                ctx.assert(span.end, 'end should be set by default');
                ctx.assert(span.end > span.start, 'default end should be after start, got start=' + span.start + ' end=' + span.end);

                // Setting start past current end should auto-push end
                var origEnd = span.end;
                span.start = '2026-12-31 23:00';
                await ctx.sleep(100);
                ctx.assert(span.end > '2026-12-31 23:00', 'end should be pushed past new start, got ' + span.end);
            },
        },

        {
            id: 'meeting-create-submit-emits-created',
            name: 'meeting-create submit fires meeting-create:created and does not throw',
            url: '/debug/meeting-create',
            run: async function (ctx) {
                var doc = ctx.doc;
                var mc = await ctx.waitFor(function () { return doc.querySelector('meeting-create'); }, { label: 'meeting-create element' });
                var sr = mc.shadowRoot;

                // Wait for the form to render
                await ctx.waitFor(function () {
                    return sr.querySelector('form[data-form]');
                }, { label: 'form rendered', timeout: 5000 });
                await ctx.sleep(200);

                // Fill in the title
                var titleInput = sr.querySelector('input[name="title"]');
                ctx.assert(titleInput, 'title input should be present');
                titleInput.value = 'Test meeting regression';

                // Capture the created event
                var created = null;
                mc.addEventListener('meeting-create:created', function (ev) { created = ev.detail; });

                // Submit the form via the submit button so _submit() runs end-to-end
                var submitBtn = sr.querySelector('[data-submit]');
                ctx.assert(submitBtn, 'submit button should be present');
                submitBtn.click();

                // Wait for created event (mock service resolves synchronously)
                await ctx.waitFor(function () { return created !== null; }, { label: 'meeting-create:created event', timeout: 3000 });
                ctx.assert(created && created.meeting, 'created event should carry a meeting object');
            },
        },

        {
            id: 'note-editor-mention-autocomplete',
            name: 'note-editor @mention autocomplete opens and selects',
            url: '/debug/note-editor',
            run: async function (ctx) {
                var doc = ctx.doc;
                var editor = await ctx.waitFor(function () { return doc.querySelector('note-editor'); }, { label: 'note-editor' });
                var sr = editor.shadowRoot;
                await ctx.waitFor(function () { return editor._acAttached; }, { label: 'autocomplete attached', timeout: 5000 });

                var control = sr.querySelector('.ne-content');
                var ta = control && control.textarea;
                ctx.assert(ta, 'textarea found');

                // Use a person from MockPeopleService, not the active context.
                ta.focus();
                ta.value = '@ast';
                ta.selectionStart = ta.selectionEnd = 4;
                ta.dispatchEvent(new Event('input', { bubbles: true }));

                var pop = await ctx.waitFor(function () {
                    var p = control.shadowRoot.querySelector('[role="listbox"]');
                    return p && !p.hidden && p.children.length > 0 ? p : null;
                }, { label: 'mention dropdown owned by feature-rich-text-area', timeout: 2000 });

                ctx.assert(pop.textContent.toLowerCase().indexOf('astrid') >= 0,
                    'dropdown should show matching person, got: ' + pop.textContent.slice(0, 80));

                // Select with Enter
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                await ctx.sleep(100);

                ctx.assert(ta.value.indexOf('@astrid') >= 0,
                    'textarea should contain @mention after selection, got: ' + ta.value);
            },
        },

        {
            id: 'note-editor-tag-autocomplete',
            name: 'note-editor #tag autocomplete shows new tag option',
            url: '/debug/note-editor',
            run: async function (ctx) {
                var doc = ctx.doc;
                var editor = await ctx.waitFor(function () { return doc.querySelector('note-editor'); }, { label: 'note-editor' });
                var sr = editor.shadowRoot;
                await ctx.waitFor(function () { return editor._acAttached; }, { label: 'autocomplete attached', timeout: 5000 });

                var control = sr.querySelector('.ne-content');
                var ta = control && control.textarea;
                ctx.assert(ta, 'textarea found');

                // Type #newtag — should show "ny" (new) option
                ta.focus();
                ta.value = '#newtag';
                ta.selectionStart = ta.selectionEnd = 7;
                ta.dispatchEvent(new Event('input', { bubbles: true }));

                // The rich editor owns the popup, so it lives in its shadow root.
                var pop = await ctx.waitFor(function () {
                    var p = control.shadowRoot.querySelector('[role="listbox"]');
                    return p && !p.hidden && p.children.length > 0 ? p : null;
                }, { label: 'tag dropdown visible', timeout: 2000 });

                ctx.assert(pop.textContent.indexOf('newtag') >= 0,
                    'dropdown should show typed tag, got: ' + pop.textContent.slice(0, 80));
                ctx.assert(pop.textContent.indexOf('ny') >= 0,
                    'dropdown should show "ny" hint for new tag');
            },
        },

        {
            id: 'note-editor-tag-space-underscore',
            name: 'note-editor space inside #tag inserts underscore',
            url: '/debug/note-editor',
            run: async function (ctx) {
                var doc = ctx.doc;
                var editor = await ctx.waitFor(function () { return doc.querySelector('note-editor'); }, { label: 'note-editor' });
                var sr = editor.shadowRoot;
                await ctx.waitFor(function () { return editor._tagSpaceWired; }, { label: 'tag-space wired', timeout: 5000 });

                var control = sr.querySelector('.ne-content');
                var ta = control && control.textarea;
                ctx.assert(ta, 'textarea found');

                // Close any autocomplete first
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await ctx.sleep(50);

                // Set up #hello and press space
                ta.value = '#hello';
                ta.selectionStart = ta.selectionEnd = 6;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                await ctx.sleep(50);

                // Close autocomplete popup so space goes to tag handler
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await ctx.sleep(50);

                ta.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
                await ctx.sleep(50);

                ctx.assert(ta.value === '#hello_', 'space should become underscore, got: ' + JSON.stringify(ta.value));
            },
        },

        {
            id: 'note-editor-ctrl-m-popup-unmount',
            name: 'note-editor closes the Ctrl+M popup on disconnect',
            url: '/debug/note-editor',
            run: async function (ctx) {
                var doc = ctx.doc;
                var editor = await ctx.waitFor(function () { return doc.querySelector('note-editor'); }, { label: 'note-editor' });
                var ta = await ctx.waitFor(function () {
                    var control = editor.shadowRoot && editor.shadowRoot.querySelector('.ne-content');
                    return control && control.textarea;
                }, { label: 'editor textarea' });

                ta.focus();
                ta.value = 'Nytt møte ';
                ta.selectionStart = ta.selectionEnd = ta.value.length;
                ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true, cancelable: true }));
                ctx.assert(!!doc.querySelector('input.m-title'), 'Ctrl+M must open the popup before testing its cleanup');
                editor.remove();

                await ctx.sleep(100);
                ctx.assert(!doc.querySelector('input.m-title'), 'expected Ctrl+M popup to be removed after disconnect');

                doc.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                await ctx.sleep(50);
                ctx.assert(!doc.querySelector('input.m-title'), 'expected no popup after document mousedown');
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
