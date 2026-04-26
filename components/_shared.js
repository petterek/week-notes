/**
 * Shared client-side helpers for week-notes web components.
 * Exposed as window.WN so plain <script> tags can use it without modules.
 *
 * Caches /api/* responses so multiple component instances don't refetch.
 */
(function () {
    if (window.WN) return;

    const cache = {};
    function once(key, url) {
        if (!cache[key]) {
            cache[key] = fetch(url).then(r => r.json()).catch(() => []);
        }
        return cache[key];
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Mirror server-side linkMentions: convert @key tokens in HTML into
     * <a class="mention-link"> anchors. Operates on already-escaped HTML.
     */
    function linkMentions(html, people, companies) {
        if (!html) return html;
        return html.replace(/(^|[\s\n(\[>])@([a-zA-ZæøåÆØÅ][a-zA-ZæøåÆØÅ0-9_-]*)/g, (_m, pre, name) => {
            const lc = name.toLowerCase();
            const c = companies.find(x => x.key === lc);
            if (c) {
                return `${pre}<a href="/people#tab=companies&key=${encodeURIComponent(c.key)}" class="mention-link mention-company" data-company-key="${escapeHtml(c.key)}">${escapeHtml(c.name || name)}</a>`;
            }
            const p = people.find(x => x.name === name || x.key === lc);
            const display = p ? (p.firstName ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : p.name) : name;
            const key = p ? (p.key || (p.name || '').toLowerCase()) : lc;
            return `${pre}<a href="/people" class="mention-link" data-person-key="${escapeHtml(key)}">${escapeHtml(display)}</a>`;
        });
    }

    /**
     * Wire a host element so that clicking any .mention-link inside it
     * preventDefaults the navigation and bubbles a 'mention-clicked' event
     * (handled by pageHtml's body-level listener).
     */
    function wireMentionClicks(host) {
        host.addEventListener('click', (ev) => {
            const a = ev.target.closest('a.mention-link');
            if (!a || !host.contains(a)) return;
            ev.preventDefault();
            host.dispatchEvent(new CustomEvent('mention-clicked', {
                bubbles: true,
                detail: {
                    kind: a.classList.contains('mention-company') ? 'company' : 'person',
                    key: a.dataset.companyKey || a.dataset.personKey || '',
                    name: a.textContent,
                    href: a.getAttribute('href'),
                    originalEvent: ev,
                },
            }));
        });
    }

    /** ISO week of a Date. */
    function isoWeek(d) {
        const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dow = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - dow + 3);
        const fy = t.getUTCFullYear();
        const ft = new Date(Date.UTC(fy, 0, 4));
        const fdow = (ft.getUTCDay() + 6) % 7;
        ft.setUTCDate(ft.getUTCDate() - fdow + 3);
        const w = 1 + Math.round((t - ft) / (7 * 24 * 3600 * 1000));
        return `${fy}-W${String(w).padStart(2, '0')}`;
    }

    window.WN = {
        people:       () => once('people',       '/api/people'),
        companies:    () => once('companies',    '/api/companies'),
        tasks:        () => once('tasks',        '/api/tasks'),
        results:      () => once('results',      '/api/results'),
        meetings:     (q = '') => once(`meetings${q}`, `/api/meetings${q}`),
        meetingTypes: () => once('meetingTypes', '/api/meeting-types'),
        escapeHtml,
        linkMentions,
        wireMentionClicks,
        isoWeek,
    };
})();
