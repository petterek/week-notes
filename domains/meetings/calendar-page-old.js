/**
 * <calendar-page> — page wrapper for the calendar feature.
 *
 * Renders the toolbar (title, range, prev/today/next nav) and embeds a
 * <week-calendar> for the current week. Reacts to /calendar/YYYY-WNN
 * URL changes via the SPA navigation event.
 *
 * Attributes:
 *   week     — ISO week "YYYY-WNN" (otherwise read from URL).
 *   settings — JSON object with at least { workHours }. If omitted,
 *              the active context settings are fetched from /api/contexts.
 *
 * Property: element.settings = {...}
 */
(function () {
    if (customElements.get('calendar-page')) return;

    const { html } = window.WN;

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

    const CSS = `
        :host { display: block; box-sizing: border-box; }
        .page { display: flex; flex-direction: column; padding: 8px 12px; box-sizing: border-box; gap: 6px; }
        .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 2px; }
        .toolbar h1 { font-family: var(--font-heading); font-weight: 400; color: var(--accent); margin: 0; font-size: 1.05em; }
        .range { color: var(--text-muted); font-size: 0.85em; }
        .nav { display: flex; gap: 4px; margin-left: auto; }
        .nav button { padding: 3px 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.9em; }
        .nav button:hover { background: var(--surface-alt); }
    `;

    class CalendarPage extends HTMLElement {
        static get observedAttributes() { return ['settings', 'week']; }


        get service() {
            const name = this.getAttribute('service');
            return name ? (window[name] || null) : null;
        }

        connectedCallback() {
            if (!this.service) {
                const n = this.getAttribute('service');
                const why = !n ? 'missing "service" attribute' : 'service "' + n + '" not registered on window';
                console.error('<calendar-page>:', why);
                const markup = html`<p style="color: var(--danger);font-style:italic;margin:0">no service connected</p>`;
                if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
                this.shadowRoot.innerHTML = markup;
                return;
            }
            if (!this.shadowRoot) {
                this.attachShadow({ mode: 'open' });
                this.shadowRoot.innerHTML = `<style>${CSS}</style>${html`
                    <div class="page">
                        <div class="toolbar">
                            <h1>📅 Kalender</h1>
                            <span class="range" data-range></span>
                            <div class="nav">
                                <button type="button" data-nav="prev" title="Forrige uke">‹</button>
                                <button type="button" data-nav="today">I dag</button>
                                <button type="button" data-nav="next" title="Neste uke">›</button>
                            </div>
                        </div>
                        <week-calendar></week-calendar>
                    </div>
                `}`;
                this._range = this.shadowRoot.querySelector('[data-range]');
                this._cal = this.shadowRoot.querySelector('week-calendar');
                this.shadowRoot.querySelectorAll('.nav button').forEach(btn => {
                    btn.addEventListener('click', () => this._onNav(btn.dataset.nav));
                });
            }
            this._week = this.getAttribute('week') || this._weekFromUrl() || isoWeekFromDate(new Date());
            this._applySettings();
            this._apply();
            this._onSpa = () => {
                const w = this._weekFromUrl() || isoWeekFromDate(new Date());
                if (w !== this._week) { this._week = w; this._apply(); }
            };
            document.addEventListener('spa:navigated', this._onSpa);
        }

        attributeChangedCallback(name, oldV, newV) {
            if (oldV === newV || !this.shadowRoot) return;
            if (name === 'settings') this._applySettings();
            else if (name === 'week') {
                this._week = newV || isoWeekFromDate(new Date());
                this._apply();
            }
        }

        get settings() { return this._settings || null; }
        set settings(v) {
            this._settings = v && typeof v === 'object' ? v : null;
            this._propagateSettings();
        }

        _applySettings() {
            const raw = this.getAttribute('settings');
            if (raw) {
                try { this._settings = JSON.parse(raw); }
                catch (_) { this._settings = null; }
            } else if (!this._settings) {
                this._settings = null;
            }
            if (this._settings) {
                this._propagateSettings();
            } else {
                this._loadSettingsFromContext();
            }
        }

        async _loadSettingsFromContext() {
            try {
                const r = await fetch('/api/contexts');
                if (!r.ok) return;
                const d = await r.json();
                const active = (d.contexts || []).find(c => c.id === d.active) || (d.contexts || [])[0];
                this._settings = (active && active.settings) || null;
                this._propagateSettings();
            } catch (_) {}
        }

        _propagateSettings() {
            if (!this._cal) return;
            const s = this._settings || {};
            if (Array.isArray(s.workHours)) this._cal.setAttribute('work-hours', JSON.stringify(s.workHours));
            else this._cal.removeAttribute('work-hours');
        }

        disconnectedCallback() {
            if (this._onSpa) document.removeEventListener('spa:navigated', this._onSpa);
        }

        _weekFromUrl() {
            if (typeof window === 'undefined' || !window.location) return '';
            const m = window.location.pathname.match(/^\/calendar\/(\d{4}-W\d{2})$/);
            return m ? m[1] : '';
        }

        _apply() {
            this._range.textContent = this._week + ' · ' + weekLabel(this._week);
            if (this._cal) {
                const monday = isoWeekMonday(this._week);
                if (monday) {
                    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
                    const fmt = d => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
                    this._cal.setAttribute('start-date', fmt(monday));
                    this._cal.setAttribute('end-date', fmt(sunday));
                }
            }
        }

        _onNav(nav) {
            let target = this._week;
            if (nav === 'prev') target = shiftWeek(this._week, -1);
            else if (nav === 'next') target = shiftWeek(this._week, +1);
            else if (nav === 'today') target = isoWeekFromDate(new Date());
            if (target === this._week) return;
            this._week = target;
            this._apply();
            this.dispatchEvent(new CustomEvent('calendar:week-changed', { bubbles: true, detail: { week: target } }));
        }
    }

    customElements.define('calendar-page', CalendarPage);
})();
