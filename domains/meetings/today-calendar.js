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
    }
    .today-cal-link {
        margin-top: 8px; text-align: right; font-size: 0.85em;
    }
    .today-cal-link a { color: var(--accent); text-decoration: none; }
    week-calendar { display: block; }
`;

class TodayCalendar extends WNElement {
    static get domain() { return 'meetings'; }
    static get observedAttributes() { return ['meetings_service']; }

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
        this._loadSettings().then(() => this._apply());
    }

    disconnectedCallback() {
        if (this._onNewDay) document.removeEventListener('nav-meta:newDay', this._onNewDay);
        if (this._onCtx)    document.removeEventListener('context-selected', this._onCtx);
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && oldVal !== newVal) this._apply();
    }

    render() {
        return html`
            <h3 class="side-h">📅 I dag · ${todayLabel()}</h3>
            ${html`<week-calendar></week-calendar>`}
            <div class="today-cal-link">${unsafeHTML('<a href="/calendar">Åpne kalender →</a>')}</div>
        `;
    }

    async _loadSettings() {
        try {
            const r = await fetch('/api/contexts');
            if (!r.ok) return;
            const d = await r.json();
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
            // Feed event types so colors/icons match the main calendar
            const cal = this.shadowRoot.querySelector('week-calendar');
            if (cal) {
                const eventTypes = (types || []).map(t => ({
                    typeId: t.key, icon: t.icon || '', name: t.label || t.key,
                    color: t.color || '', allDay: !!(t.allDay || t.fullDay),
                }));
                cal.eventTypes = eventTypes;
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
