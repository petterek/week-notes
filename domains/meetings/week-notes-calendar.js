/**
 * <week-notes-calendar> — page wrapper for the calendar feature.
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
import { WNElement, html } from './_shared.js';
import './meeting-edit.js';

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

function addMinutes(hhmm, mins) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!m) return hhmm;
    let total = (+m[1]) * 60 + (+m[2]) + (+mins || 0);
    total = Math.max(0, Math.min(23 * 60 + 59, total));
    const h = Math.floor(total / 60), mi = total % 60;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
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

// Map a meeting record from the service into a <week-calendar> item.
// Service shape:  { id, title, type, date, start, end, attendees, location, week }
// Item shape:     { id, startDate, endDate, heading, body, type, moveable }
function meetingToItem(m, typeMap) {
    const t = (typeMap && typeMap[m.type]) || null;
    const icon = (t && t.icon) ? t.icon + ' ' : '';
    const start = m.start ? `${m.date}T${m.start}` : m.date;
    const end   = m.end   ? `${m.date}T${m.end}`   : start;
    const bodyParts = [];
    if (m.attendees && m.attendees.length) bodyParts.push(m.attendees.map(a => '@' + a).join(' '));
    if (m.location) bodyParts.push('📍 ' + m.location);
    return {
        id: m.id,
        startDate: start,
        endDate: end,
        heading: icon + (m.title || ''),
        body: bodyParts.join(' · '),
        type: m.type || 'meeting',
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
    .nav button { padding: 3px 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.9em; }
    .nav button:hover { background: var(--surface-alt); }
    .new-btn { padding: 3px 12px; border: 1px solid var(--accent); background: var(--accent); color: var(--text-on-accent); border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.9em; }
    .new-btn:hover { background: var(--accent-strong); }
    .overlay { display: none; position: fixed; inset: 0; background: var(--overlay); z-index: 2000; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; overflow-y: auto; }
    .overlay.open { display: flex; }
    .overlay-card { background: var(--bg); color: var(--text-strong); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 20px 60px var(--shadow); padding: 18px 20px; width: min(520px, 92vw); box-sizing: border-box; font-family: var(--font-family); }
    .overlay-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .overlay-head h2 { margin: 0; font-family: var(--font-heading); font-weight: 400; color: var(--accent); font-size: 1.1em; flex: 1; }
    .overlay-head button { background: none; border: none; font-size: 1.3em; cursor: pointer; color: var(--text-muted); padding: 0; }
    .overlay-head button:hover { color: var(--text-strong); }
`;

class WeekNotesCalendar extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() { return ['settings', 'week']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._week = this.getAttribute('week') || this._weekFromUrl() || isoWeekFromDate(new Date());
        this._onSpa = () => {
            const w = this._weekFromUrl() || isoWeekFromDate(new Date());
            if (w !== this._week) { this._week = w; this._refresh(); }
        };
        document.addEventListener('spa:navigated', this._onSpa);
    }

    disconnectedCallback() {
        if (this._onSpa) document.removeEventListener('spa:navigated', this._onSpa);
    }

    attributeChangedCallback(name, oldV, newV) {
        if (oldV === newV) return;
        if (name === 'week') {
            this._week = newV || isoWeekFromDate(new Date());
        }
        if (name !== 'settings') this.invalidateAwait();
        super.attributeChangedCallback(name, oldV, newV);
        if (name === 'settings') this._applySettings();
    }

    get settings() { return this._settings || null; }
    set settings(v) {
        this._settings = v && typeof v === 'object' ? v : null;
        this._propagateSettings();
    }

    _refresh() { this.invalidateAwait(); this.requestRender(); }

    loadData() {
        return {
            settings: async () => {
                if (this._settings) return this._settings;
                try {
                    this._applySettings();
                    if (this._settings) return this._settings;
                    const ctxSvc = this.serviceFor('context');
                    if (!ctxSvc) return null;
                    const d = await ctxSvc.list();
                    const active = (d.contexts || []).find(c => c.id === d.active) || (d.contexts || [])[0];
                    if (active && active.id) this._setActiveContext(active.id);
                    this._settings = (active && active.settings) || null;
                    return this._settings;
                } catch (_) { return null; }
            },
            meetings: async () => {
                if (!this.service || typeof this.service.list !== 'function') return { list: [], types: [] };
                try {
                    const typesSvc = this.serviceFor('meeting_types') || this.service;
                    const list = await this.service.list({ week: this._week });
                    const types = (typesSvc && typeof typesSvc.listTypes === 'function') ? await typesSvc.listTypes() : [];
                    return { list: list || [], types: types || [] };
                } catch (_) { return { list: [], types: [] }; }
            },
        };
    }

    render(data = {}) {
        const svcAttr = this.getAttribute('meetings_service') || '';
        const setAttr = this.getAttribute('settings_service') || '';
        const ctxAttr = this.getAttribute('context') || this._activeCtx || '';
        const tmpl = html`
            <div class="page">
                <div class="toolbar">
                    <h1>📅 Kalender</h1>
                    <span class="range" data-range></span>
                    <button type="button" class="new-btn" data-new>+ Nytt møte</button>
                    <div class="nav">
                        <button type="button" data-nav="prev" title="Forrige uke">‹</button>
                        <button type="button" data-nav="today">I dag</button>
                        <button type="button" data-nav="next" title="Neste uke">›</button>
                    </div>
                </div>
                <div class="overlay" data-create-panel>
                    <div class="overlay-card" data-overlay-card>
                        <div class="overlay-head">
                            <h2>Nytt møte</h2>
                            <button type="button" data-overlay-close title="Lukk">✕</button>
                        </div>
                        ${html`<meeting-create meetings_service="${svcAttr}" settings_service="${setAttr}" context="${ctxAttr}"></meeting-create>`}
                    </div>
                </div>
                <div class="overlay" data-edit-panel>
                    <div class="overlay-card" data-edit-card>
                        <div class="overlay-head">
                            <h2>Rediger møte</h2>
                            <button type="button" data-edit-close title="Lukk">✕</button>
                        </div>
                        ${html`<meeting-edit meetings_service="${svcAttr}" settings_service="${setAttr}" context="${ctxAttr}"></meeting-edit>`}
                    </div>
                </div>
                ${html`<week-calendar></week-calendar>`}
            </div>
        `;
        if (!data._loading) {
            const meet = data.meetings || { list: [], types: [] };
            const typeMap = {};
            (meet.types || []).forEach(t => { typeMap[t.key] = t; });
            this._typeMap = typeMap;
            this._items = (meet.list || []).map(m => meetingToItem(m, typeMap));
            this._meetingsById = {};
            (meet.list || []).forEach(m => { if (m && m.id) this._meetingsById[m.id] = m; });
            this._lastTypes = meet.types || [];
        }
        return tmpl;
    }

    afterRender(data) {
        if (!data || data._loading) return;
        this._applyData(this._lastTypes || []);
    }

    _applyData(types) {
        if (!this._wired) { this._wired = true; this._wireNav(); }
        const range = this.shadowRoot.querySelector('[data-range]');
        if (range) range.textContent = this._week + ' · ' + weekLabel(this._week);
        const cal = this.shadowRoot.querySelector('week-calendar');
        if (!cal) return;
        const monday = isoWeekMonday(this._week);
        if (monday) {
            const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
            const fmt = d => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
            cal.setAttribute('start-date', fmt(monday));
            cal.setAttribute('end-date', fmt(sunday));
        }
        this._propagateSettings();
        const eventTypes = (types || []).map(t => ({
            typeId: t.key, icon: t.icon || '', name: t.label || t.key, color: t.color || '', allDay: !!(t.allDay || t.fullDay),
        }));
        cal.eventTypes = eventTypes;
        if (typeof cal.setItems === 'function') cal.setItems(this._items || []);
    }

    _wireNav() {
        const root = this.shadowRoot;

        // Delegated click on shadowRoot — survives innerHTML replacement
        root.addEventListener('click', (ev) => {
            const navBtn = ev.target.closest('[data-nav]');
            if (navBtn) { this._onNav(navBtn.dataset.nav); return; }

            if (ev.target.closest('[data-new]')) { this._openCreate({}); return; }

            if (ev.target.closest('[data-overlay-close]')) {
                const overlay = root.querySelector('[data-create-panel]');
                if (overlay) overlay.classList.remove('open');
                return;
            }
            if (ev.target.closest('[data-edit-close]')) {
                const overlay = root.querySelector('[data-edit-panel]');
                if (overlay) overlay.classList.remove('open');
                return;
            }

            // Click on create-overlay backdrop (outside card)
            const createPanel = root.querySelector('[data-create-panel]');
            if (createPanel && createPanel.contains(ev.target) && !ev.target.closest('[data-overlay-card]')) {
                createPanel.classList.remove('open');
                return;
            }
            // Click on edit-overlay backdrop (outside card)
            const editPanel = root.querySelector('[data-edit-panel]');
            if (editPanel && editPanel.contains(ev.target) && !ev.target.closest('[data-edit-card]')) {
                editPanel.classList.remove('open');
                return;
            }
        });

        // Escape key for overlays (document-level, wired once)
        document.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Escape') return;
            const createPanel = root.querySelector('[data-create-panel]');
            if (createPanel && createPanel.classList.contains('open')) { createPanel.classList.remove('open'); return; }
            const editPanel = root.querySelector('[data-edit-panel]');
            if (editPanel && editPanel.classList.contains('open')) { editPanel.classList.remove('open'); return; }
        });

        // Custom events bubble from child components — shadowRoot catches them
        root.addEventListener('datePeriodSelected', (ev) => {
            const d = ev.detail || {};
            const type = (d.type && d.type !== 'none') ? d.type : '';
            this._openCreate({ date: d.date, time: d.time, type });
        });
        root.addEventListener('meeting-create:created', () => {
            const overlay = root.querySelector('[data-create-panel]');
            if (overlay) overlay.classList.remove('open');
            this._refresh();
        });
        root.addEventListener('meeting-create:cancel', () => {
            const overlay = root.querySelector('[data-create-panel]');
            if (overlay) overlay.classList.remove('open');
        });
        root.addEventListener('open-item-selected', (ev) => {
            const id = ev.detail && ev.detail.id;
            if (id) this._openEdit(id);
        });
        root.addEventListener('meeting-edit:saved', () => {
            const overlay = root.querySelector('[data-edit-panel]');
            if (overlay) overlay.classList.remove('open');
            this._refresh();
        });
        root.addEventListener('meeting-edit:deleted', () => {
            const overlay = root.querySelector('[data-edit-panel]');
            if (overlay) overlay.classList.remove('open');
            this._refresh();
        });
        root.addEventListener('meeting-edit:cancel', () => {
            const overlay = root.querySelector('[data-edit-panel]');
            if (overlay) overlay.classList.remove('open');
        });
    }

    _openEdit(id) {
        const meeting = (this._meetingsById && this._meetingsById[id]) || null;
        if (!meeting) return;
        const overlay = this.shadowRoot.querySelector('[data-edit-panel]');
        const form = this.shadowRoot.querySelector('meeting-edit');
        if (!overlay || !form) return;
        if (typeof form.setMeeting === 'function') form.setMeeting(meeting);
        overlay.classList.add('open');
        setTimeout(() => {
            const root = form.shadowRoot;
            const t = root && root.querySelector('input[name=title]');
            if (t) t.focus();
        }, 30);
    }

    _openCreate({ date, time, type } = {}) {
        const overlay = this.shadowRoot.querySelector('[data-create-panel]');
        const form = this.shadowRoot.querySelector('meeting-create');
        if (!overlay || !form) return;
        if (date) form.setAttribute('date', date); else form.removeAttribute('date');
        if (time) {
            form.setAttribute('start', time);
            const t = (this._typeMap && type) ? this._typeMap[type] : null;
            const dur = (t && +t.defaultMinutes)
                || (this._settings && +this._settings.defaultMeetingMinutes)
                || 60;
            form.setAttribute('end', addMinutes(time, dur));
        } else {
            form.removeAttribute('start');
            form.removeAttribute('end');
        }
        if (type) form.setAttribute('type', type); else form.removeAttribute('type');
        overlay.classList.add('open');
        // Focus the title input for quick entry
        setTimeout(() => {
            const root = form.shadowRoot;
            const t = root && root.querySelector('input[name=title]');
            if (t) t.focus();
        }, 30);
    }

    _applySettings() {
        const raw = this.getAttribute('settings');
        if (raw) {
            try { this._settings = JSON.parse(raw); }
            catch (_) { this._settings = null; }
        } else if (!this._settings) {
            this._settings = null;
        }
        if (this._settings) this._propagateSettings();
    }

    _setActiveContext(id) {
        if (!id || this._activeCtx === id) return;
        this._activeCtx = id;
        const forms = this.shadowRoot.querySelectorAll('meeting-create, meeting-edit');
        forms.forEach(f => f.setAttribute('context', id));
    }

    _propagateSettings() {
        const cal = this.shadowRoot.querySelector('week-calendar');
        if (!cal) return;
        const s = this._settings || {};
        if (Array.isArray(s.workHours)) cal.setAttribute('work-hours', JSON.stringify(s.workHours));
        else cal.removeAttribute('work-hours');
        if (s.visibleStartHour != null) cal.setAttribute('hour-start', String(s.visibleStartHour));
        else cal.removeAttribute('hour-start');
        if (s.visibleEndHour != null) cal.setAttribute('hour-end', String(s.visibleEndHour));
        else cal.removeAttribute('hour-end');
    }

    _weekFromUrl() {
        if (typeof window === 'undefined' || !window.location) return '';
        const m = window.location.pathname.match(/^\/calendar\/(\d{4}-W\d{2})$/);
        return m ? m[1] : '';
    }

    _onNav(nav) {
        let target = this._week;
        if (nav === 'prev') target = shiftWeek(this._week, -1);
        else if (nav === 'next') target = shiftWeek(this._week, +1);
        else if (nav === 'today') target = isoWeekFromDate(new Date());
        if (target === this._week) return;
        this._week = target;
        this._refresh();
        this.dispatchEvent(new CustomEvent('calendar:week-changed', { bubbles: true, detail: { week: target } }));
    }
}

if (!customElements.get('week-notes-calendar')) customElements.define('week-notes-calendar', WeekNotesCalendar);
