/**
 * <today-calendar> — sidebar widget showing today's meetings in a
 * single-day <week-calendar> column.
 *
 * Wraps a <week-calendar> with start-date == end-date == today.
 * Loads the active context's workHours / visibleStartHour /
 * visibleEndHour from /api/contexts. Loads meetings for the current
 * ISO week from the meetings service and feeds them into the inner
 * grid (the grid filters items by date itself, so passing the whole
 * week is fine).
 *
 * Auto-advances at midnight via nav-meta:newDay.
 *
 * Service contract:
 *   meetings_service.list({ week })   → Promise<Meeting[]>
 *   meetings_service.listTypes()      → Promise<MeetingType[]>
 *
 * Forwards/dispatches:
 *   week-calendar:item-selected, open-item-selected — bubbled from inner grid.
 */
import { WNElement, html, isoWeek, unsafeHTML } from './_shared.js';

function pad2(n) { return String(n).padStart(2, '0'); }

function addMinutes(hhmm, mins) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!m) return hhmm;
    let total = (+m[1]) * 60 + (+m[2]) + (+mins || 0);
    total = Math.max(0, Math.min(23 * 60 + 59, total));
    const h = Math.floor(total / 60), mi = total % 60;
    return pad2(h) + ':' + pad2(mi);
}

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

const NB_DAYS_LONG = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const NB_MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function todayLabel() {
    const d = new Date();
    return NB_DAYS_LONG[d.getDay()] + ' ' + d.getDate() + '. ' + NB_MONTHS[d.getMonth()];
}

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
    :host { display: block; color: var(--text-strong); font: inherit; }
    .side-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); border-bottom: 1px solid var(--border-soft);
        padding-bottom: 6px; margin: 18px 0 10px; font-size: 1.05em;
        display: flex; align-items: center; gap: 8px;
    }
    .side-h .label { flex: 1; }
    .new-btn {
        padding: 2px 10px; border: 1px solid var(--accent); background: var(--accent);
        color: var(--text-on-accent); border-radius: 5px; cursor: pointer;
        font: inherit; font-size: 0.85em;
    }
    .new-btn:hover { background: var(--accent-strong); }
    .today-cal-link {
        margin-top: 8px; text-align: right; font-size: 0.85em;
    }
    .today-cal-link a { color: var(--accent); text-decoration: none; }
    week-calendar { display: block; }
    .overlay {
        display: none; position: fixed; inset: 0; background: var(--overlay);
        z-index: 2000; align-items: center; justify-content: center;
        padding: 16px; box-sizing: border-box; overflow-y: auto;
    }
    .overlay.open { display: flex; }
    .overlay-card {
        background: var(--bg); color: var(--text-strong);
        border: 1px solid var(--border); border-radius: 10px;
        box-shadow: 0 20px 60px var(--shadow);
        padding: 18px 20px; width: min(520px, 92vw); box-sizing: border-box;
        font-family: var(--font-family);
    }
    .overlay-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .overlay-head h2 {
        margin: 0; font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); font-size: 1.1em; flex: 1;
    }
    .overlay-head button {
        background: none; border: none; color: var(--text-muted);
        font-size: 1.3em; cursor: pointer; padding: 0;
    }
    .overlay-head button:hover { color: var(--text-strong); }
`;

class TodayCalendar extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() { return ['meetings_service', 'settings_service', 'context']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._date = todayStr();
        this._onNewDay = () => {
            const d = todayStr();
            if (d !== this._date) { this._date = d; this._apply(); }
        };
        document.addEventListener('nav-meta:newDay', this._onNewDay);
        this._onCtx = () => { this._loadSettings().then(() => this._apply()); };
        document.addEventListener('context-selected', this._onCtx);
        this._onEsc = (ev) => {
            if (ev.key !== 'Escape') return;
            const overlay = this.shadowRoot && this.shadowRoot.querySelector('[data-create-panel]');
            if (overlay && overlay.classList.contains('open')) this._closeCreate();
        };
        document.addEventListener('keydown', this._onEsc);
        this._loadSettings().then(() => this._apply());
    }

    disconnectedCallback() {
        if (this._onNewDay) document.removeEventListener('nav-meta:newDay', this._onNewDay);
        if (this._onCtx)    document.removeEventListener('context-selected', this._onCtx);
        if (this._onEsc)    document.removeEventListener('keydown', this._onEsc);
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && oldVal !== newVal) this._apply();
    }

    render() {
        const svcAttr = this.getAttribute('meetings_service') || '';
        const setAttr = this.getAttribute('settings_service') || '';
        const ctxAttr = this.getAttribute('context') || '';
        return html`
            <h3 class="side-h">
                <span class="label">📅 I dag · ${todayLabel()}</span>
                <button type="button" class="new-btn" data-new title="Nytt møte">+</button>
            </h3>
            ${html`<week-calendar></week-calendar>`}
            <div class="today-cal-link">${unsafeHTML('<a href="/calendar">Åpne kalender →</a>')}</div>
            <div class="overlay" data-create-panel>
                <div class="overlay-card" data-overlay-card>
                    <div class="overlay-head">
                        <h2>Nytt møte</h2>
                        <button type="button" data-overlay-close title="Lukk">✕</button>
                    </div>
                    ${html`<meeting-create meetings_service="${svcAttr}" settings_service="${setAttr}" context="${ctxAttr}"></meeting-create>`}
                </div>
            </div>
        `;
    }

    _wireOverlay() {
        if (this._wired) return;
        this._wired = true;
        const sr = this.shadowRoot;
        sr.addEventListener('click', (ev) => {
            const newBtn = ev.target.closest('[data-new]');
            if (newBtn) { this._openCreate({}); return; }
            const closeBtn = ev.target.closest('[data-overlay-close]');
            if (closeBtn) { this._closeCreate(); return; }
            const overlay = ev.target.closest('[data-create-panel]');
            const card = ev.target.closest('[data-overlay-card]');
            if (overlay && !card) { this._closeCreate(); return; }
        });
        sr.addEventListener('datePeriodSelected', (ev) => {
            const d = ev.detail || {};
            const type = (d.type && d.type !== 'none') ? d.type : '';
            this._openCreate({ date: d.date, time: d.time, type });
        });
        sr.addEventListener('meeting-create:created', () => {
            this._closeCreate();
            this._apply();
        });
        sr.addEventListener('meeting-create:cancel', () => this._closeCreate());
    }

    _openCreate({ date, time, type } = {}) {
        const sr = this.shadowRoot;
        const overlay = sr.querySelector('[data-create-panel]');
        const form = sr.querySelector('meeting-create');
        if (!overlay || !form) return;
        const useDate = date || this._date;
        if (useDate) form.setAttribute('date', useDate); else form.removeAttribute('date');
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
        setTimeout(() => {
            const root = form.shadowRoot;
            const t = root && root.querySelector('input[name=title]');
            if (t) t.focus();
        }, 30);
    }

    _closeCreate() {
        const overlay = this.shadowRoot && this.shadowRoot.querySelector('[data-create-panel]');
        if (overlay) overlay.classList.remove('open');
    }

    async _loadSettings() {
        try {
            const ctxSvc = this.serviceFor('context');
            if (!ctxSvc) return;
            const d = await ctxSvc.list();
            const active = (d.contexts || []).find(c => c.id === d.active) || (d.contexts || [])[0];
            this._settings = (active && active.settings) || null;
        } catch (_) { this._settings = null; }
    }

    _propagateSettings(cal) {
        if (!cal) return;
        const s = this._settings || {};
        if (Array.isArray(s.workHours)) cal.setAttribute('work-hours', JSON.stringify(s.workHours));
        else cal.removeAttribute('work-hours');
        if (s.visibleStartHour != null) cal.setAttribute('hour-start', String(s.visibleStartHour));
        else cal.removeAttribute('hour-start');
        if (s.visibleEndHour != null) cal.setAttribute('hour-end', String(s.visibleEndHour));
        else cal.removeAttribute('hour-end');
    }

    async _loadMeetings() {
        if (!this.service || typeof this.service.list !== 'function') return [];
        try {
            const week = isoWeek(new Date(this._date + 'T00:00:00Z'));
            const [list, types] = await Promise.all([
                this.service.list({ week }),
                typeof this.service.listTypes === 'function' ? this.service.listTypes() : Promise.resolve([]),
            ]);
            const typeMap = {};
            (types || []).forEach(t => { typeMap[t.key] = t; });
            this._typeMap = typeMap;
            // Feed event types so colors/icons match the main calendar
            const cal = this.shadowRoot.querySelector('week-calendar');
            if (cal) {
                const eventTypes = (types || []).map(t => ({
                    typeId: t.key, icon: t.icon || '', name: t.label || t.key,
                    color: t.color || '', allDay: !!(t.allDay || t.fullDay),
                }));
                cal.eventTypes = eventTypes;
                // Share the same type list with <meeting-create> so its dropdown
                // matches the right-click menu (avoids relying on settings_service
                // being able to resolve the active context).
                const mc = this.shadowRoot.querySelector('meeting-create');
                if (mc) mc.types = eventTypes;
            }
            // Only today's meetings
            return (list || []).filter(m => m.date === this._date).map(m => meetingToItem(m, typeMap));
        } catch (_) {
            return [];
        }
    }

    async _apply() {
        // Re-render heading (date may have changed)
        this.requestRender();
        // Wait for next microtask so the fresh shadow DOM is ready
        await Promise.resolve();
        this._wireOverlay();
        const cal = this.shadowRoot.querySelector('week-calendar');
        if (!cal) return;
        cal.setAttribute('start-date', this._date);
        cal.setAttribute('end-date',   this._date);
        this._propagateSettings(cal);
        const items = await this._loadMeetings();
        if (typeof cal.setItems === 'function') cal.setItems(items);
    }
}

if (!customElements.get('today-calendar')) customElements.define('today-calendar', TodayCalendar);
