/**
 * Mock services for the /debug component playground.
 *
 * Each Mock<Name>Service mirrors the public method shape of the real
 * service in domains/<name>/service.js, but works against an in-memory
 * data store. No fetches, no side effects on real data — perfect for
 * exercising components in isolation.
 *
 * Registered on window so demos can do:
 *     <task-open-list service="MockTaskService"></task-open-list>
 *
 * Reset everything by reloading the page; data is recreated from the
 * seed below on every load.
 */
(function () {
    const delay = (v, ms = 60) => new Promise(r => setTimeout(() => r(v), ms));
    const uid = (p = 'm') => p + '-' + Math.random().toString(36).slice(2, 9);
    const now = () => new Date().toISOString();

    function pad2(n) { return String(n).padStart(2, '0'); }
    function isoWeek(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return d.getUTCFullYear() + '-W' + pad2(weekNo);
    }
    const today = new Date();
    const thisWeek = isoWeek(today);
    const lastWeek = (() => { const d = new Date(today); d.setDate(d.getDate() - 7); return isoWeek(d); })();
    const twoWeeksAgo = (() => { const d = new Date(today); d.setDate(d.getDate() - 14); return isoWeek(d); })();
    const fmtDate = d => d.toISOString().slice(0, 10);
    const dayOffset = n => { const d = new Date(today); d.setDate(d.getDate() + n); return fmtDate(d); };
    function isoWeekMonday(yw) {
        const m = String(yw || '').match(/^(\d{4})-W(\d{2})$/);
        if (!m) return null;
        const year = +m[1], week = +m[2];
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const jan4Day = jan4.getUTCDay() || 7;
        const mon = new Date(jan4);
        mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
        return mon;
    }
    function weekDateRange(yw) {
        const mon = isoWeekMonday(yw);
        if (!mon) return '';
        const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
        const fmt = d => `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}`;
        return `${fmt(mon)}–${fmt(sun)}`;
    }

    // ---------- People ----------
    const people = [
        { key: 'petter', name: 'Petter Eriksen', firstName: 'Petter', lastName: 'Eriksen', title: 'Lead', email: 'petter@example.com', phone: '+47 900 11 222', primaryCompanyKey: 'acmeas', notes: 'Lager mock-data og rydder kode.' },
        { key: 'astrid', name: 'Astrid Holm', firstName: 'Astrid', lastName: 'Holm', title: 'Designer', email: 'astrid@example.com', primaryCompanyKey: 'acmeas', notes: 'Står for wireframes og UX.' },
        { key: 'olav', name: 'Olav Berg', firstName: 'Olav', lastName: 'Berg', title: 'PM', email: 'olav@example.com' },
    ];

    window.MockPeopleService = {
        list:   () => delay(JSON.parse(JSON.stringify(people))),
        create: (p) => { const np = Object.assign({ key: uid('p') }, p); people.push(np); return delay(np); },
        update: (id, patch) => {
            const i = people.findIndex(x => x.key === id);
            if (i < 0) return Promise.reject(new Error('not found'));
            Object.assign(people[i], patch);
            return delay(people[i]);
        },
        remove: (id) => { const i = people.findIndex(x => x.key === id); if (i >= 0) people.splice(i, 1); return delay({ ok: true }); },
    };

    // ---------- Companies ----------
    const companies = [
        { key: 'acmeas', name: 'Acme AS', url: 'https://acme.example', address: 'Storgata 1, Oslo', orgnr: '912 345 678', notes: 'Største kunde. Kontrakt fornyes Q3.' },
        { key: 'globex', name: 'Globex Corp', url: 'https://globex.example', notes: 'Pilotprosjekt for analytics.' },
    ];
    window.MockCompaniesService = {
        list:   () => delay(JSON.parse(JSON.stringify(companies))),
        create: (c) => { const nc = Object.assign({ key: uid('c') }, c); companies.push(nc); return delay(nc); },
        update: (id, patch) => { const i = companies.findIndex(x => x.key === id); if (i < 0) return Promise.reject(new Error('not found')); Object.assign(companies[i], patch); return delay(companies[i]); },
        remove: (id) => { const i = companies.findIndex(x => x.key === id); if (i >= 0) companies.splice(i, 1); return delay({ ok: true }); },
    };

    // ---------- Places ----------
    const places = [
        { id: 'pl1', key: 'mathallen', name: 'Mathallen Oslo', address: 'Vulkan 5, 0178 Oslo', lat: 59.9226, lng: 10.7517, notes: 'Bra for lunsjmøter.', created: now() },
        { id: 'pl2', key: 'hovedkontor', name: 'Hovedkontoret', address: 'Storgata 1, 0155 Oslo', notes: 'Møterom 3 i 4. etasje.', created: now() },
    ];
    window.MockPlacesService = {
        list:   () => delay(JSON.parse(JSON.stringify(places))),
        create: (p) => { const np = Object.assign({ id: uid('pl'), key: uid('plk'), created: now() }, p); places.push(np); return delay(np); },
        update: (id, patch) => { const i = places.findIndex(x => x.id === id || x.key === id); if (i < 0) return Promise.reject(new Error('not found')); Object.assign(places[i], patch); return delay(places[i]); },
        remove: (id) => { const i = places.findIndex(x => x.id === id || x.key === id); if (i >= 0) places.splice(i, 1); return delay({ ok: true }); },
    };

    // ---------- Tasks ----------
    const tasks = [
        { id: 't1', text: 'Forberede demo for fredag', done: false, created: now(), week: thisWeek, order: 0 },
        { id: 't2', text: 'Snakke med @astrid om mockups', done: false, created: now(), week: thisWeek, order: 1 },
        { id: 't3', text: 'Skrive ukerapport', done: true, created: now(), completed: now(), week: thisWeek, completedWeek: thisWeek, order: 2 },
        { id: 't4', text: 'Oppdatere @acmeas-avtalen', done: true, created: now(), completed: now(), week: lastWeek, completedWeek: lastWeek, order: 3 },
        { id: 't5', text: 'Rydde i innboks', done: true, created: now(), completed: now(), week: twoWeeksAgo, completedWeek: twoWeeksAgo, order: 4 },
        { id: 't6', text: 'Lese gjennom designforslag', done: false, created: now(), week: thisWeek, order: 5 },
    ];

    window.MockTaskService = {
        list:   () => delay(JSON.parse(JSON.stringify(tasks))),
        create: (text) => {
            const t = { id: uid('t'), text: String(text || ''), done: false, created: now(), week: thisWeek, order: tasks.length };
            tasks.push(t);
            return delay(JSON.parse(JSON.stringify(tasks)));
        },
        update: (id, patch) => { const i = tasks.findIndex(x => x.id === id); if (i < 0) return Promise.reject(new Error('not found')); Object.assign(tasks[i], patch); return delay(tasks[i]); },
        remove: (id) => { const i = tasks.findIndex(x => x.id === id); if (i >= 0) tasks.splice(i, 1); return delay({ ok: true }); },
        toggle: (id, comment = '') => {
            const i = tasks.findIndex(x => x.id === id);
            if (i < 0) return Promise.reject(new Error('not found'));
            tasks[i].done = !tasks[i].done;
            if (tasks[i].done) { tasks[i].completed = now(); tasks[i].completedWeek = thisWeek; if (comment) tasks[i].completedComment = comment; }
            else { delete tasks[i].completed; delete tasks[i].completedWeek; delete tasks[i].completedComment; }
            return delay(tasks[i]);
        },
        merge: (srcId, tgtId) => {
            const s = tasks.findIndex(x => x.id === srcId);
            if (s < 0) return Promise.reject(new Error('source not found'));
            tasks.splice(s, 1);
            return delay({ ok: true, merged: srcId, into: tgtId });
        },
        reorder: (ids) => { const map = new Map(ids.map((id, i) => [id, i])); tasks.forEach(t => { if (map.has(t.id)) t.order = map.get(t.id); }); return delay({ ok: true }); },
    };

    // ---------- Results ----------
    function extractMentionsM(text) {
        const out = []; const re = /@([a-z0-9._-]+)/gi; let m;
        while ((m = re.exec(String(text || '')))) if (!out.includes(m[1])) out.push(m[1]);
        return out;
    }
    const results = [
        { id: 'r1', week: thisWeek, text: 'Lansert ny landingsside — bounce-rate redusert 12% etter @astrid sin redesign.', people: ['astrid'], created: now() },
        { id: 'r2', week: thisWeek, text: 'Beslutning: bytter til Postgres etter diskusjon med @olav (JSONB-støtte).', people: ['olav'], created: now() },
        { id: 'r3', week: lastWeek, text: 'Fullført Q1-rapport. Sendt til styret tirsdag.', people: [], created: now() },
    ];

    window.MockResultsService = {
        list: (filter = {}) => {
            let out = results.slice();
            if (filter.week) out = out.filter(r => r.week === filter.week);
            return delay(JSON.parse(JSON.stringify(out)));
        },
        create: (d) => {
            const text = String(d.text || '').trim();
            const r = { id: uid('r'), created: now(), week: d.week || thisWeek, text, people: extractMentionsM(text) };
            results.unshift(r); return delay(r);
        },
        update: (id, patch) => { const i = results.findIndex(x => x.id === id); if (i < 0) return Promise.reject(new Error('not found')); Object.assign(results[i], patch); return delay(results[i]); },
        remove: (id) => { const i = results.findIndex(x => x.id === id); if (i >= 0) results.splice(i, 1); return delay({ ok: true }); },
    };

    // ---------- Meetings ----------
    const meetingTypes = [
        { key: 'standup',  label: 'Standup',     icon: '🔄', mins: 15,  color: '#7ab648' },
        { key: 'meeting',  label: 'Møte',        icon: '👥', mins: 60,  color: '#4a90e2' },
        { key: 'focus',    label: 'Fokustid',    icon: '🎯', mins: 90,  color: '#d35400' },
        { key: '1on1',     label: '1:1',         icon: '☕', mins: 30,  color: '#a05a2c' },
        { key: 'block',    label: 'Blokkert',    icon: '🔴', mins: 60,  color: '#c0392b' },
        { key: 'workshop', label: 'Workshop',    icon: '🛠️', mins: 120, color: '#e08a3c' },
        { key: 'demo',     label: 'Demo',        icon: '🎬', mins: 45,  color: '#9b59b6' },
        { key: 'planning', label: 'Planlegging', icon: '📋', mins: 60,  color: '#3aa3a3' },
        { key: 'review',   label: 'Gjennomgang', icon: '🔍', mins: 45,  color: '#34495e' },
        { key: 'social',   label: 'Sosialt',     icon: '🎉', mins: 60,  color: '#e91e63' },
        { key: 'call',     label: 'Telefon',     icon: '📞', mins: 30,  color: '#16a085' },
        { key: 'travel',   label: 'Reise',       icon: '✈️', mins: 120, color: '#7f8c8d' },
        { key: 'vacation', label: 'Ferie',       icon: '🌴',           color: '#2ecc71', allDay: true },
    ];
    const meetings = [
        { id: uid('mt'), title: 'Daily standup', type: 'standup', date: dayOffset(0), start: '09:00', end: '09:15', attendees: ['astrid', 'olav'], location: 'Teams', week: thisWeek },
        { id: uid('mt'), title: 'Sprint review med @acmeas', type: 'meeting', date: dayOffset(1), start: '13:00', end: '14:00', attendees: ['acmeas'], location: 'Møterom 3', placeKey: 'hovedkontor', week: thisWeek },
        { id: uid('mt'), title: 'Fokustid: refaktorering', type: 'focus', date: dayOffset(2), start: '08:30', end: '11:00', attendees: [], location: '', week: thisWeek },
        { id: uid('mt'), title: 'Lege', type: 'block', date: dayOffset(3), start: '15:00', end: '16:00', attendees: [], location: 'Sentrum legesenter', week: thisWeek },
        { id: uid('mt'), title: 'Lunsj med @petter', type: '1on1', date: dayOffset(5), start: '11:30', end: '12:30', attendees: ['petter'], location: 'Mathallen', placeKey: 'mathallen', week: thisWeek },
    ];

    window.MockMeetingsService = {
        list: (filter = {}) => {
            let out = meetings.slice();
            if (filter.week) out = out.filter(m => m.week === filter.week);
            if (filter.upcoming) {
                const days = Number(filter.upcoming) || 14;
                const today = new Date().toISOString().slice(0, 10);
                const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
                out = out.filter(m => m.date >= today && m.date <= cutoff);
            }
            out.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
            return delay(JSON.parse(JSON.stringify(out)));
        },
        create: (d) => { const m = Object.assign({ id: uid('mt'), week: thisWeek }, d); meetings.push(m); return delay(m); },
        update: (id, patch) => { const i = meetings.findIndex(x => x.id === id); if (i < 0) return Promise.reject(new Error('not found')); Object.assign(meetings[i], patch); return delay(meetings[i]); },
        remove: (id) => { const i = meetings.findIndex(x => x.id === id); if (i >= 0) meetings.splice(i, 1); return delay({ ok: true }); },
        listTypes: () => delay(JSON.parse(JSON.stringify(meetingTypes))),
        saveTypes: (types) => { meetingTypes.length = 0; (types || []).forEach(t => meetingTypes.push(t)); return delay({ ok: true }); },
    };

    // ---------- Notes ----------
    const notes = {};
    // ISO date string for a specific weekday (0=Mon, 6=Sun) within the given ISO week.
    function weekDay(yw, dayIdx) {
        const mon = isoWeekMonday(yw); if (!mon) return null;
        const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + dayIdx);
        return d.toISOString();
    }
    const seedNote = (week, file, content, dayIdx = 0) => {
        const created = (dayIdx != null && weekDay(week, dayIdx)) || now();
        notes[week + '/' + file] = { week, file, content, pinned: false, created };
    };
    seedNote(thisWeek, 'mandag.md',
        '# Mandag\n\n- Standup gikk bra\n- Snakket med @astrid om wireframes\n- [beslutning] Vi går for Postgres over MySQL\n\n## Notater\nVi diskuterte ytelse og endte på at JSONB-støtten i Postgres er avgjørende.', 0);
    seedNote(thisWeek, 'tirsdag.md',
        '# Tirsdag\n\n- Lansert ny landingsside 🚀\n- Møte med @acmeas — alt i orden\n', 1);
    seedNote(thisWeek, 'onsdag.md',
        '# Onsdag\n\n- Refaktorert API-laget\n- Code review med @olav\n', 2);
    seedNote(lastWeek, 'oppsummering.md',
        '# Forrige uke\n\nFullført Q1-rapport. Sendt til styret. Fikk gode tilbakemeldinger fra @olav.', 4);
    seedNote(lastWeek, 'mandag.md',
        '# Forrige mandag\n\n- Planlegging av Q1-rapport\n', 0);
    seedNote(twoWeeksAgo, 'reise.md',
        '# Reise til Oslo\n\nMøte med @acmeas på onsdag. Lunsj med @petter etterpå.', 2);
    // Pin one note in the current week so the 📌 group is demonstrable.
    if (notes[thisWeek + '/mandag.md']) notes[thisWeek + '/mandag.md'].pinned = true;

    function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fakeRender(md) {
        const safe = escapeHtml(md);
        return safe
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>[\s\S]*?<\/li>)+/g, m => '<ul>' + m + '</ul>')
            .replace(/@([a-z0-9_-]+)/gi, '<a class="mention-link" data-person-key="$1" href="#">@$1</a>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^/, '<p>').replace(/$/, '</p>');
    }
    function summary(md) {
        const lines = String(md || '').split('\n').filter(Boolean);
        const headerIdx = lines.findIndex(l => /^#\s/.test(l));
        const after = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;
        const para = after.find(l => !/^#/.test(l) && !/^- /.test(l)) || '';
        return para.slice(0, 140);
    }
    function title(md) { const m = String(md || '').match(/^#\s+(.+)$/m); return m ? m[1] : ''; }

    window.MockNotesService = {
        save: ({ folder, file, content, themes }) => {
            if (!folder || !file) return Promise.reject(new Error('folder and file required'));
            seedNote(folder, file, content);
            const n = notes[folder + '/' + file];
            if (n && Array.isArray(themes)) n.themes = themes.slice();
            return delay({ ok: true, path: '/' + folder + '/' + file });
        },
        raw: (week, file) => {
            const n = notes[week + '/' + file];
            return n ? delay(n.content) : Promise.reject(new Error('not found'));
        },
        renderHtml: (week, file) => {
            const n = notes[week + '/' + file];
            return n ? delay(fakeRender(n.content)) : Promise.reject(new Error('not found'));
        },
        meta: (week, file) => {
            const n = notes[week + '/' + file];
            if (!n) return Promise.reject(new Error('not found'));
            return delay({ week: n.week, file: n.file, title: title(n.content), pinned: n.pinned, created: n.created, themes: Array.isArray(n.themes) ? n.themes : [] });
        },
        card: (week, file) => {
            const n = notes[week + '/' + file];
            if (!n) return Promise.reject(new Error('not found'));
            const name = n.file.replace(/\.md$/, '');
            return delay({
                ok: true,
                week: n.week,
                file: n.file,
                name,
                type: n.type || 'note',
                pinned: !!n.pinned,
                presentationStyle: n.presentationStyle || null,
                themes: Array.isArray(n.themes) ? n.themes : [],
                snippet: summary(n.content),
            });
        },
        setPinned: (week, file, pinned) => { const n = notes[week + '/' + file]; if (!n) return Promise.reject(new Error('not found')); n.pinned = !!pinned; return delay({ ok: true }); },
        remove: (week, file) => { delete notes[week + '/' + file]; return delay({ ok: true }); },
        listWeeks: () => {
            const seen = new Set();
            Object.values(notes).forEach(n => seen.add(n.week));
            return delay(Array.from(seen).sort().reverse());
        },
        getWeek: (week) => {
            const noteList = Object.values(notes).filter(n => n.week === week)
                .map(n => ({ file: n.file, pinned: !!n.pinned, created: n.created || '' }))
                .sort((a, b) => {
                    if (!!a.pinned !== !!b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
                    if (a.created && b.created) return b.created.localeCompare(a.created);
                    return b.file.localeCompare(a.file);
                });
            return delay({
                week,
                weekNum: (week.split('-')[1] || ''),
                dateRange: weekDateRange(week),
                notes: noteList,
                hasSummary: !!notes[week + '/summarize.md'],
            });
        },
    };

    // ---------- Search ----------
    window.MockSearchService = {
        search: (q) => {
            const needle = String(q || '').toLowerCase().trim();
            if (!needle) return delay([]);
            const out = [];
            Object.values(notes).forEach(n => {
                const hay = (n.content || '').toLowerCase();
                if (hay.includes(needle)) {
                    const name = n.file.replace(/\.md$/, '');
                    out.push({
                        type: 'note',
                        identifier: n.week + '/' + encodeURIComponent(n.file),
                        title: title(n.content) || name,
                        subtitle: n.week + '/' + n.file,
                        href: '/' + n.week + '/' + encodeURIComponent(n.file),
                        snippet: summary(n.content)
                    });
                }
            });
            tasks.forEach(t => {
                if ((t.text || '').toLowerCase().includes(needle)) {
                    out.push({
                        type: 'task',
                        identifier: t.id,
                        title: t.text || '(uten tittel)',
                        subtitle: (t.done ? '✓ ' : '☐ ') + (t.completedWeek || t.week || ''),
                        href: '/tasks',
                        snippet: t.note || ''
                    });
                }
            });
            people.forEach(p => {
                if ((p.name || '').toLowerCase().includes(needle) || (p.key || '').toLowerCase().includes(needle)) {
                    const display = p.firstName ? (p.lastName ? p.firstName + ' ' + p.lastName : p.firstName) : (p.name || p.key);
                    out.push({
                        type: 'person',
                        identifier: p.key || '',
                        title: display,
                        subtitle: p.title || p.email || '@' + (p.key || ''),
                        href: '/people#' + encodeURIComponent(p.key || ''),
                        snippet: p.notes || ''
                    });
                }
            });
            results.forEach(r => {
                if ((r.text || '').toLowerCase().includes(needle)) {
                    out.push({
                        type: 'result',
                        identifier: r.id,
                        title: r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text,
                        subtitle: r.week || '',
                        href: '/results',
                        snippet: r.text
                    });
                }
            });
            return delay(out);
        },
    };

    // ---------- Context ----------
    const contexts = [
        { id: 'demo', name: 'Demo-arbeidsplass', icon: '🧪', description: 'Mock-kontekst for debug-siden', active: true },
        { id: 'work',  name: 'Jobb',                 icon: '💼', description: 'Hovedarbeidsplass', active: false },
        { id: 'home',  name: 'Hjemme',               icon: '🏠', description: 'Personlige notater', active: false },
    ];
    const disconnected = [{ id: 'old-project', name: 'Gammelt prosjekt', remote: 'git@example.com:me/old.git' }];

    window.MockContextService = {
        list: () => delay(JSON.parse(JSON.stringify(contexts))),
        create: (data) => { const c = Object.assign({ id: uid('ctx'), active: false, icon: '📁' }, data); contexts.push(c); return delay(c); },
        clone: (data) => { const c = Object.assign({ id: uid('ctx'), active: false, icon: '📁', cloned: true }, data); contexts.push(c); return delay(c); },
        switchTo: (id) => { contexts.forEach(c => c.active = (c.id === id)); return delay({ ok: true, active: id }); },
        listDisconnected: () => delay(JSON.parse(JSON.stringify(disconnected))),
        forgetDisconnected: (id) => { const i = disconnected.findIndex(x => x.id === id); if (i >= 0) disconnected.splice(i, 1); return delay({ ok: true }); },
        disconnect: (id) => { const i = contexts.findIndex(x => x.id === id); if (i >= 0) { disconnected.push({ id, name: contexts[i].name }); contexts.splice(i, 1); } return delay({ ok: true }); },
        commit: (id, body) => delay({ ok: true, committed: true, message: (body && body.message) || '' }),
        gitStatus: (id) => delay({ ok: true, clean: true, branch: 'main', remote: 'origin', ahead: 0, behind: 0 }),
        push: (id) => delay({ ok: true, pushed: true }),
        pull: (id) => delay({ ok: true, pulled: true }),
    };

    // ---------- Settings ----------
    const settingsByCtx = {};
    const themes = [
        { id: 'paper', name: 'Papir', builtin: true },
        { id: 'dark', name: 'Mørk', builtin: true },
        { id: 'nord', name: 'Nord', builtin: true },
        { id: 'forest', name: 'Skog', builtin: true },
    ];
    function ensureSettings(id) {
        if (!settingsByCtx[id]) {
            settingsByCtx[id] = {
                name: (contexts.find(c => c.id === id) || {}).name || id,
                icon: (contexts.find(c => c.id === id) || {}).icon || '📁',
                description: (contexts.find(c => c.id === id) || {}).description || '',
                theme: 'paper',
                defaultMeetingMinutes: 60,
                workHours: [
                    { start: '09:00', end: '17:00' },
                    { start: '09:00', end: '17:00' },
                    { start: '09:00', end: '17:00' },
                    { start: '09:00', end: '17:00' },
                    { start: '09:00', end: '15:00' },
                    null, null,
                ],
            };
        }
        return settingsByCtx[id];
    }

    window.MockSettingsService = {
        getSettings:      (id) => delay(JSON.parse(JSON.stringify(ensureSettings(id)))),
        saveSettings:     (id, body) => { settingsByCtx[id] = Object.assign(ensureSettings(id), body || {}); return delay({ ok: true }); },
        getMeetingTypes:  (id) => delay(JSON.parse(JSON.stringify(meetingTypes))),
        saveMeetingTypes: (id, types) => { meetingTypes.length = 0; (types || []).forEach(t => meetingTypes.push(t)); return delay({ ok: true }); },
        listThemes:  () => delay(JSON.parse(JSON.stringify(themes))),
        createTheme: (data) => { const t = Object.assign({ id: uid('th'), builtin: false }, data); themes.push(t); return delay(t); },
        updateTheme: (id, body) => { const i = themes.findIndex(t => t.id === id); if (i < 0) return Promise.reject(new Error('not found')); Object.assign(themes[i], body); return delay(themes[i]); },
        removeTheme: (id) => { const i = themes.findIndex(t => t.id === id); if (i >= 0 && !themes[i].builtin) themes.splice(i, 1); return delay({ ok: true }); },
    };

    // Convenience: also expose as a single namespace
    window.MockServices = {
        people:    window.MockPeopleService,
        companies: window.MockCompaniesService,
        places:    window.MockPlacesService,
        tasks:    window.MockTaskService,
        results:  window.MockResultsService,
        meetings: window.MockMeetingsService,
        notes:    window.MockNotesService,
        search:   window.MockSearchService,
        context:  window.MockContextService,
        settings: window.MockSettingsService,
    };
})();
