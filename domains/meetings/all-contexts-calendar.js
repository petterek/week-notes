/**
 * <all-contexts-calendar> — read-only cross-context calendar page.
 *
 * Shows meetings from all contexts, colour-coded by context.
 * Read-only: clicking a meeting shows info but no editing.
 * Navigates at /calendar/all or /calendar/all/YYYY-WNN.
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const MONTH_NAMES = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function pad2(n) { return String(n).padStart(2, '0'); }

function isoWeekFromDate(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + pad2(weekNo);
}

function isoWeekMonday(yw) {
    const m = /^(\d{4})-W(\d{2})$/.exec(yw || '');
    if (!m) return null;
    const year = +m[1], week = +m[2];
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    return monday;
}

function shiftWeek(yw, delta) {
    const m = isoWeekMonday(yw); if (!m) return yw;
    m.setUTCDate(m.getUTCDate() + 7 * delta);
    return isoWeekFromDate(m);
}

function weekLabel(yw) {
    const monday = isoWeekMonday(yw); if (!monday) return yw;
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    const sm = MONTH_NAMES[monday.getUTCMonth()];
    const em = MONTH_NAMES[sunday.getUTCMonth()];
    const sd = monday.getUTCDate(), ed = sunday.getUTCDate();
    if (monday.getUTCMonth() === sunday.getUTCMonth()) return sd + '.–' + ed + '. ' + em;
    return sd + '. ' + sm + ' – ' + ed + '. ' + em;
}

// Default palette for contexts without a custom colour
const DEFAULT_COLORS = ['#4a6fa5', '#6b8e5a', '#c07038', '#8b5fa8', '#b55454', '#4a9e9e', '#8a7040', '#5e6eaa'];
function defaultColor(idx) { return DEFAULT_COLORS[idx % DEFAULT_COLORS.length]; }

function meetingToItem(m) {
    const icon = m._ctxIcon ? m._ctxIcon + ' ' : '';
    const start = m.start ? `${m.date}T${m.start}` : m.date;
    const end   = m.end   ? `${m.date}T${m.end}`   : start;
    const bodyParts = [];
    if (m.attendees && m.attendees.length) bodyParts.push(m.attendees.map(a => '@' + a).join(' '));
    if (m.location) bodyParts.push('📍 ' + m.location);
    return {
        id: m.id + ':' + m._ctx,
        startDate: start,
        endDate: end,
        heading: icon + (m.title || ''),
        body: bodyParts.join(' · '),
        type: '_ctx_' + m._ctx,
        moveable: false,
    };
}

const STYLES = `
    :host { display: block; box-sizing: border-box; }
    .page { display: flex; flex-direction: column; padding: 8px 12px; box-sizing: border-box; gap: 6px; }
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 2px; }
    .toolbar h1 { font-family: var(--font-heading); font-weight: 400; color: var(--accent); margin: 0; font-size: 1.05em; }
    .range { color: var(--text-muted); font-size: 0.85em; }
    .nav { display: flex; gap: 4px; margin-left: auto; }
    .nav button, .nav a { padding: 3px 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.9em; text-decoration: none; }
    .nav button:hover, .nav a:hover { background: var(--surface-alt); }

    .legend { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 2px 4px; }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 12px; font-size: 0.82em; cursor: pointer; border: 1px solid var(--border-soft, var(--border)); background: var(--surface); color: var(--text-strong); user-select: none; transition: opacity 0.15s; }
    .legend-item.hidden { opacity: 0.35; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .legend-icon { font-size: 1em; line-height: 1; }

    .empty-msg { padding: 40px 20px; text-align: center; color: var(--text-muted); font-style: italic; }
`;

class AllContextsCalendar extends WNElement {
    static get domain() { return 'meetings'; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._week = this._weekFromUrl() || isoWeekFromDate(new Date());
        this._hiddenCtx = new Set();
        this._onSpa = () => {
            const w = this._weekFromUrl() || isoWeekFromDate(new Date());
            if (w !== this._week) { this._week = w; this._refresh(); }
        };
        document.addEventListener('spa:navigated', this._onSpa);
    }

    disconnectedCallback() {
        if (this._onSpa) document.removeEventListener('spa:navigated', this._onSpa);
    }

    _refresh() { this.invalidateAwait(); this.requestRender(); }

    loadData() {
        return {
            meetings: async () => {
                if (!this.service || typeof this.service.list !== 'function') return [];
                try {
                    return await this.service.list({ week: this._week, allContexts: true });
                } catch (_) { return []; }
            },
        };
    }

    render(data = {}) {
        const meetings = (!data._loading && Array.isArray(data.meetings)) ? data.meetings : [];

        // Build context set
        const ctxMap = new Map();
        let cIdx = 0;
        for (const m of meetings) {
            if (!ctxMap.has(m._ctx)) {
                ctxMap.set(m._ctx, {
                    id: m._ctx,
                    name: m._ctxName || m._ctx,
                    icon: m._ctxIcon || '📁',
                    color: m._ctxColor || defaultColor(cIdx),
                    active: !!m._ctxActive,
                });
                cIdx++;
            }
        }
        this._ctxMap = ctxMap;

        // Filter by hidden
        const visible = meetings.filter(m => !this._hiddenCtx.has(m._ctx));
        const items = visible.map(m => meetingToItem(m));

        // Build eventTypes for colour mapping
        const eventTypes = [];
        for (const [id, c] of ctxMap) {
            eventTypes.push({ typeId: '_ctx_' + id, icon: c.icon, name: c.name, color: c.color });
        }
        this._eventTypes = eventTypes;
        this._items = items;

        const legendItems = [...ctxMap.values()].map(c => {
            const hidden = this._hiddenCtx.has(c.id);
            return html`<span class="legend-item ${hidden ? 'hidden' : ''}" data-ctx-filter="${c.id}" title="${c.active ? 'Aktiv kontekst' : c.name}">
                <span class="legend-dot" style="background:${c.color}"></span>
                <span class="legend-icon">${c.icon}</span>
                <span>${c.name}</span>
            </span>`;
        });

        const noMeetings = !data._loading && items.length === 0;

        return html`
            <div class="page">
                <div class="toolbar">
                    <h1>🌐 Alle kontekster</h1>
                    <span class="range" data-range>${this._week} · ${weekLabel(this._week)}</span>
                    <div class="nav">
                        <button type="button" data-nav="prev" title="Forrige uke">‹</button>
                        <button type="button" data-nav="today">I dag</button>
                        <button type="button" data-nav="next" title="Neste uke">›</button>
                        <a href="/calendar" data-link>📅 Kalender</a>
                    </div>
                </div>
                ${ctxMap.size > 1 ? html`<div class="legend">${legendItems}</div>` : ''}
                ${noMeetings
                    ? html`<div class="empty-msg">Ingen møter denne uken</div>`
                    : html`<week-calendar></week-calendar>`
                }
            </div>
        `;
    }

    afterRender(data) {
        if (!data || data._loading) return;
        if (!this._wired) { this._wired = true; this._wireEvents(); }
        const cal = this.shadowRoot.querySelector('week-calendar');
        if (!cal) return;
        const monday = isoWeekMonday(this._week);
        if (monday) {
            const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
            const fmt = d => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
            cal.setAttribute('start-date', fmt(monday));
            cal.setAttribute('end-date', fmt(sunday));
        }
        cal.eventTypes = (this._eventTypes || []).map(t => ({
            typeId: t.typeId, icon: t.icon, name: t.name, color: t.color,
        }));
        if (typeof cal.setItems === 'function') cal.setItems(this._items || []);
    }

    _wireEvents() {
        const root = this.shadowRoot;
        root.addEventListener('click', (ev) => {
            const navBtn = ev.target.closest('[data-nav]');
            if (navBtn) { this._onNav(navBtn.dataset.nav); return; }

            const filterItem = ev.target.closest('[data-ctx-filter]');
            if (filterItem) {
                const ctxId = filterItem.dataset.ctxFilter;
                if (this._hiddenCtx.has(ctxId)) this._hiddenCtx.delete(ctxId);
                else this._hiddenCtx.add(ctxId);
                this.requestRender();
                return;
            }

            // SPA link
            const link = ev.target.closest('[data-link]');
            if (link) {
                ev.preventDefault();
                const href = link.getAttribute('href');
                if (href && window.history) {
                    window.history.pushState(null, '', href);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                }
            }
        });
    }

    _onNav(nav) {
        let target = this._week;
        if (nav === 'prev') target = shiftWeek(this._week, -1);
        else if (nav === 'next') target = shiftWeek(this._week, +1);
        else if (nav === 'today') target = isoWeekFromDate(new Date());
        if (target === this._week) return;
        this._week = target;
        const newPath = '/calendar/all/' + target;
        if (window.history) window.history.pushState(null, '', newPath);
        this._refresh();
    }

    _weekFromUrl() {
        if (typeof window === 'undefined' || !window.location) return '';
        const m = window.location.pathname.match(/^\/calendar\/all\/(\d{4}-W\d{2})$/);
        return m ? m[1] : '';
    }
}

if (!customElements.get('all-contexts-calendar')) customElements.define('all-contexts-calendar', AllContextsCalendar);
