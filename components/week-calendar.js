/**
 * <week-calendar> — pure N-day × N-hour calendar grid.
 *
 * Renders the visual grid only: hour rail + day columns with hour
 * lines, work-hour bands and a now-line in today's column. No
 * toolbar, no navigation.
 *
 * Attributes:
 *   start-date — "YYYY-MM-DD" inclusive (default: Monday of current ISO week)
 *   end-date   — "YYYY-MM-DD" inclusive (default: start-date + 6 days)
 *   show-days  — which weekdays to render. 0=Mon..6=Sun.
 *                Accepts a range "a-b" or comma list "0,1,4".
 *                Default "0-6" (all days).
 *   hour-start — integer 0..23 (default 0)
 *   hour-end   — integer 1..24, exclusive (default 24)
 *   hour-px    — pixel height per hour (default 36)
 *   work-hours — JSON: Array(7) of {start,end} or null (Mon..Sun).
 *                If omitted, no work-hour bands are rendered.
 *   special-days — JSON: Array of { date: "YYYY-MM-DD", name, workday }.
 *                  date    — ISO day to mark.
 *                  name    — short label shown in the day header.
 *                  workday — boolean. When false the day is rendered
 *                            as "non-working": tinted column, no
 *                            work-hour band, no work-hour label.
 *                            Defaults to false (i.e. holiday).
 *
 * Public API:
 *   element.startDate / endDate / showDays (get/set)
 *   element.workHours (get/set; triggers re-render)
 *   element.items (read-only copy)
 *   element.setItems(items) — replace all items
 *   element.addItem(item) / addItems(items)
 *   element.removeItem(id) / clearItems()
 *
 *   Item shape: { startDate, endDate, heading, body, type, moveable, id }
 *     startDate/endDate accept "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM[:SS]".
 *     type: free-form. Built-in styling for: meeting, task, focus, note, block.
 *     moveable: when true, item gets a grab cursor and draggable=true.
 *
 *   Events:
 *     week-calendar:ready (on first render)
 *     week-calendar:item-selected — detail: { item, id } (single click on an item; null/no event when clicking empty space clears selection)
 *     open-item-selected — detail: { item, id } (click the open ↗ icon on the currently selected item)
 *     (single-click on empty cells does not emit any event)
 *     datePeriodSelected       — detail: { type, date, time, icon?, name? }
 *                                  emitted on empty-cell dblclick (type='none') or after picking
 *                                  from the right-click context menu (type=<typeId>)
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';

const DAY_NAMES_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

function pad2(n) { return String(n).padStart(2, '0'); }

function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fmtDate(d) {
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function mondayOfCurrentWeek() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (day - 1));
    return d;
}

// Convert JS getUTCDay (0=Sun..6=Sat) to our Mon-based index (0=Mon..6=Sun).
function dayIndex(d) {
    const j = d.getUTCDay();
    return (j + 6) % 7;
}

function parseShowDays(s) {
    const set = new Set();
    if (!s) { for (let i = 0; i < 7; i++) set.add(i); return set; }
    const txt = String(s).trim();
    const range = /^(\d)\s*-\s*(\d)$/.exec(txt);
    if (range) {
        const a = Math.max(0, Math.min(6, +range[1]));
        const b = Math.max(0, Math.min(6, +range[2]));
        const lo = Math.min(a, b), hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) set.add(i);
        return set;
    }
    txt.split(/[\s,]+/).forEach(tok => {
        if (!tok) return;
        const n = parseInt(tok, 10);
        if (n >= 0 && n <= 6) set.add(n);
    });
    if (!set.size) for (let i = 0; i < 7; i++) set.add(i);
    return set;
}

function timeToMinutes(t) {
    if (!t || typeof t !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
}

function parseDateTime(s) {
    if (!s) return null;
    // Accept YYYY-MM-DD or YYYY-MM-DD[T ]HH:MM[:SS]
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s).trim());
    if (!m) return null;
    const hh = m[4] != null ? +m[4] : 0;
    const mm = m[5] != null ? +m[5] : 0;
    const ss = m[6] != null ? +m[6] : 0;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mm, ss));
}

function buildCss(hourPx, hourSpan, dayCount) {
    return `
        :host { display: block; box-sizing: border-box; }
        .grid { display: grid; grid-template-columns: 56px repeat(${dayCount}, 1fr); gap: 1px; background: var(--border-soft); border: 1px solid var(--border-soft); border-radius: 8px; }
        .head { background: var(--surface); padding: 2px 6px; text-align: center; font-size: 0.75em; color: var(--text-muted); position: sticky; top: 0; z-index: 4; line-height: 1.15; }
        .head.today .day-num { color: var(--accent); font-weight: 700; }
        .head .day-num { font-size: 1em; font-weight: 600; color: var(--text-strong); }
        .head .day-label { text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; }
        .corner { background: var(--surface); position: sticky; top: 0; left: 0; z-index: 5; }
        .hours { background: var(--surface); }
        .hour { height: ${hourPx}px; border-bottom: 1px solid var(--border-soft); padding: 2px 6px; font-size: 0.75em; color: var(--text-muted); text-align: right; box-sizing: border-box; }
        .col { background: var(--surface); position: relative; min-height: ${hourPx * hourSpan}px; }
        .col.today { background: color-mix(in srgb, var(--accent) 5%, transparent); }
        .col .hour-line { position: absolute; left: 0; right: 0; height: ${hourPx}px; border-bottom: 1px solid var(--border-soft); pointer-events: none; }
        .work-band { position: absolute; left: 0; right: 0; background: var(--accent); opacity: 0.12; z-index: 0; pointer-events: none; border-radius: 2px; }
        .work-label { position: absolute; left: 4px; right: 4px; font-size: 0.7em; color: var(--accent); font-weight: 600; z-index: 1; pointer-events: none; text-align: center; letter-spacing: 0.02em; }
        .now-line { position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid var(--accent); z-index: 3; pointer-events: none; }
        .now-line::before { content: ''; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
        .item { position: absolute; left: 2px; right: 2px; box-sizing: border-box; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; line-height: 1.2; overflow: hidden; z-index: 2; cursor: default;
            background: var(--accent); color: var(--text-on-accent); border: 1px solid var(--border-soft); box-shadow: 0 1px 2px var(--shadow); }
        .item[data-moveable="true"] { cursor: grab; }
        .item .item-h { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item .item-b { opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item.selected { outline: 2px solid var(--text-strong, #000); outline-offset: 1px; z-index: 5; }
        .item .item-open, .allday-bar .item-open {
            position: absolute; right: 2px; top: 2px; width: 20px; height: 20px;
            display: inline-flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.85); color: #111; border: 1px solid var(--border-soft);
            border-radius: 50%; font-size: 0.85em; line-height: 1; cursor: pointer; padding: 0;
            box-shadow: 0 1px 2px var(--shadow);
        }
        .item .item-open:hover, .allday-bar .item-open:hover { background: rgba(255,255,255,1); }
        .allday-bar.selected { outline: 2px solid var(--text-strong, #000); outline-offset: 1px; padding-right: 22px; }
        .allday-bar.selected .item-open { top: -2px; right: -2px; width: 18px; height: 18px; }
        .item[data-type="meeting"] { background: var(--cal-meeting); }
        .item[data-type="task"]    { background: var(--success); }
        .item[data-type="focus"]   { background: var(--cal-focus); }
        .item[data-type="note"]    { background: var(--cal-note); }
        .item[data-type="block"]   { background: var(--cal-block); }
        .item.continues-down { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
        .item.continues-up   { border-top-left-radius: 0; border-top-right-radius: 0; }
        .col.special { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--danger) 5%, transparent) 0 8px, color-mix(in srgb, var(--danger) 10%, transparent) 8px 16px); }
        .col.special.workday { background: color-mix(in srgb, var(--accent) 6%, transparent); }
        .head .special-name { display: block; font-size: 0.7em; color: var(--danger); font-weight: 600; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .head.special.workday .special-name { color: var(--accent); }
        .head.special .day-num { color: var(--danger); }
        .head.special.workday .day-num { color: var(--accent); }
        .ctx-menu { position: fixed; z-index: 100; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 14px var(--shadow, rgba(0,0,0,0.15)); padding: 4px 0; min-width: 180px; font-size: 0.9em; }
        .ctx-menu .ctx-h { padding: 4px 12px; font-size: 0.78em; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .ctx-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 12px; background: transparent; border: 0; color: var(--text-strong); font: inherit; text-align: left; cursor: pointer; }
        .ctx-menu button:hover { background: var(--surface-alt); }
        .ctx-menu .ctx-icon { width: 1.2em; text-align: center; }
        .ctx-menu .ctx-swatch { width: 0.8em; height: 0.8em; border-radius: 2px; flex: 0 0 auto; border: 1px solid var(--border-soft); }
        .ctx-menu .ctx-empty { padding: 6px 12px; color: var(--text-subtle); font-style: italic; }
        .allday-corner { background: var(--surface); position: sticky; left: 0; z-index: 4; padding: 2px 6px; font-size: 0.65em; color: var(--text-subtle); text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: flex-end; }
        .allday-track { background: var(--surface); position: relative; padding: 3px 0; min-height: 16px; }
        .allday-bar { position: absolute; height: 14px; border-radius: 4px; background: var(--accent); box-shadow: 0 1px 1px var(--shadow); cursor: default; overflow: hidden; }
        .allday-bar[data-moveable="true"] { cursor: grab; }
        .allday-bar .ad-label { position: absolute; left: 6px; right: 6px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 0.75em; line-height: 1; color: var(--text-on-accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
        .allday-bar.continues-left  { border-top-left-radius: 0; border-bottom-left-radius: 0; }
        .allday-bar.continues-right { border-top-right-radius: 0; border-bottom-right-radius: 0; }
    `;
}

class WeekCalendar extends WNElement {
    static get observedAttributes() {
        return ['start-date', 'end-date', 'show-days', 'hour-start', 'hour-end', 'hour-px', 'work-hours', 'special-days'];
    }

    css() {
        const { px: HP, end: HE, start: HS } = this._hourBounds();
        const { start, end } = this._resolveRange();
        const showSet = parseShowDays(this.getAttribute('show-days'));
        let dayCount = 0;
        const cur = new Date(start);
        while (cur <= end) {
            if (showSet.has(dayIndex(cur))) dayCount++;
            cur.setUTCDate(cur.getUTCDate() + 1);
        }
        return buildCss(HP, HE - HS, dayCount || 1);
    }

    connectedCallback() {
        super.connectedCallback();
        if (!Array.isArray(this._items)) this._items = [];
        this._workHours = this._readWorkHoursAttr();
        this._specialDays = this._readSpecialDaysAttr();
        this._tickT = setInterval(() => this._updateNowLine(), 60000);
        this.dispatchEvent(new CustomEvent('week-calendar:ready', {
            bubbles: true,
            composed: true,
            detail: {
                startDate: this.startDate,
                endDate: this.endDate,
                showDays: this.showDays,
            },
        }));
    }

    disconnectedCallback() {
        if (this._tickT) clearInterval(this._tickT);
    }

    attributeChangedCallback(name, oldV, newV) {
        super.attributeChangedCallback(name, oldV, newV);
        if (oldV === newV) return;
        if (name === 'work-hours') this._workHours = this._readWorkHoursAttr();
        if (name === 'special-days') this._specialDays = this._readSpecialDaysAttr();
    }

    get startDate() { return this.getAttribute('start-date') || ''; }
    set startDate(v) { if (v) this.setAttribute('start-date', v); else this.removeAttribute('start-date'); }
    get endDate() { return this.getAttribute('end-date') || ''; }
    set endDate(v) { if (v) this.setAttribute('end-date', v); else this.removeAttribute('end-date'); }
    get showDays() { return this.getAttribute('show-days') || '0-6'; }
    set showDays(v) { if (v) this.setAttribute('show-days', v); else this.removeAttribute('show-days'); }
    get workHours() { return this._workHours; }
    set workHours(v) { this._workHours = v; this.requestRender(); }
    get specialDays() { return Array.isArray(this._specialDays) ? this._specialDays.slice() : []; }
    set specialDays(v) {
        this._specialDays = Array.isArray(v) ? v.slice() : [];
        this.requestRender();
    }

    // ---- Items API ----
    get items() { return (this._items || []).slice(); }
    setItems(items) {
        this._items = Array.isArray(items) ? items.slice() : [];
        this.requestRender();
    }
    addItems(items) {
        if (!Array.isArray(this._items)) this._items = [];
        (Array.isArray(items) ? items : [items]).forEach(it => { if (it) this._items.push(it); });
        this.requestRender();
    }
    addItem(item) { this.addItems([item]); }
    clearItems() { this._items = []; this.requestRender(); }
    removeItem(id) {
        if (!Array.isArray(this._items)) return;
        this._items = this._items.filter(it => it && it.id !== id);
        this.requestRender();
    }

    // ---- Event types API (used by the right-click context menu) ----
    get eventTypes() { return Array.isArray(this._eventTypes) ? this._eventTypes.slice() : []; }
    set eventTypes(v) {
        this._eventTypes = Array.isArray(v)
            ? v.filter(t => t && t.typeId).map(t => ({
                typeId: String(t.typeId),
                icon: t.icon || '',
                name: t.name || t.typeId,
                color: t.color || '',
                allDay: !!(t.allDay || t.fullDay),
            }))
            : [];
        this._typeColorMap = Object.fromEntries(this._eventTypes.map(t => [t.typeId, t.color]));
        this._typeAllDayMap = Object.fromEntries(this._eventTypes.map(t => [t.typeId, t.allDay]));
        if (this._rootWired) this.requestRender();
    }

    _typeColor(typeId) {
        return (this._typeColorMap && this._typeColorMap[typeId]) || '';
    }

    _isAllDayType(typeId) {
        return !!(this._typeAllDayMap && this._typeAllDayMap[typeId]);
    }

    _select(item) {
        const id = item ? item.id : null;
        if (this._selectedId === id) return;
        this._selectedId = id;
        this.requestRender();
        if (item) {
            this.dispatchEvent(new CustomEvent('week-calendar:item-selected', {
                bubbles: true, composed: true, detail: { item, id: item.id },
            }));
        }
    }

    get selectedId() { return this._selectedId == null ? null : this._selectedId; }
    clearSelection() { this._select(null); }

    _readWorkHoursAttr() {
        const a = this.getAttribute('work-hours');
        if (!a) return undefined;
        try { const j = JSON.parse(a); return Array.isArray(j) ? j : null; }
        catch (_) { return null; }
    }

    _readSpecialDaysAttr() {
        const a = this.getAttribute('special-days');
        if (!a) return [];
        try { const j = JSON.parse(a); return Array.isArray(j) ? j : []; }
        catch (_) { return []; }
    }

    _specialDayMap() {
        const map = {};
        (this._specialDays || []).forEach(s => {
            if (s && s.date) map[s.date] = s;
        });
        return map;
    }

    _hourBounds() {
        const start = Math.max(0, Math.min(23, parseInt(this.getAttribute('hour-start'), 10) || 0));
        let end = parseInt(this.getAttribute('hour-end'), 10);
        if (!end) end = 24;
        end = Math.max(start + 1, Math.min(24, end));
        const px = parseInt(this.getAttribute('hour-px'), 10) || 36;
        return { start, end, px };
    }

    _resolveRange() {
        let start = parseDate(this.getAttribute('start-date'));
        if (!start) start = mondayOfCurrentWeek();
        let end = parseDate(this.getAttribute('end-date'));
        if (!end) { end = new Date(start); end.setUTCDate(start.getUTCDate() + 6); }
        if (end < start) end = new Date(start);
        // Cap range to a reasonable maximum (e.g. 31 days).
        const maxEnd = new Date(start); maxEnd.setUTCDate(start.getUTCDate() + 30);
        if (end > maxEnd) end = maxEnd;
        return { start, end };
    }

    render() {
        const { start: HS, end: HE, px: HP } = this._hourBounds();
        const { start, end } = this._resolveRange();
        const showSet = parseShowDays(this.getAttribute('show-days'));
        const todayStr = fmtDate(new Date(Date.UTC(
            new Date().getFullYear(), new Date().getMonth(), new Date().getDate()
        )));
        const specialMap = this._specialDayMap();
        const days = [];
        const cur = new Date(start);
        while (cur <= end) {
            const idx = dayIndex(cur);
            if (showSet.has(idx)) {
                const iso = fmtDate(cur);
                const sp = specialMap[iso] || null;
                days.push({
                    iso,
                    dayNum: pad2(cur.getUTCDate()),
                    monthNum: pad2(cur.getUTCMonth() + 1),
                    label: DAY_NAMES_SHORT[idx],
                    longLabel: DAY_NAMES[idx],
                    isToday: iso === todayStr,
                    workIdx: idx,
                    special: sp,
                });
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
        }
        if (!days.length) return html`<div style="padding:12px;color: var(--text-subtle)">Ingen dager å vise</div>`;

        const hourCells = [];
        for (let h = HS; h < HE; h++) hourCells.push(`<div class="hour">${pad2(h)}:00</div>`);
        const dayHeads = days.map(d => {
            const cls = ['head'];
            if (d.isToday) cls.push('today');
            if (d.special) {
                cls.push('special');
                if (d.special.workday) cls.push('workday');
            }
            const title = d.special ? (d.longLabel + ' · ' + d.special.name) : d.longLabel;
            const spName = d.special ? `<span class="special-name" title="${escapeHtml(d.special.name)}">${escapeHtml(d.special.name)}</span>` : '';
            return `<div class="${cls.join(' ')}" title="${escapeHtml(title)}">
                <span class="day-label">${d.label}</span> <span class="day-num">${d.dayNum}.${d.monthNum}</span>${spName}
            </div>`;
        }).join('');
        const wh = this._workHours;
        const itemsByDay = this._layoutItems(days, HS, HE, HP);
        const { html: alldayHtml, lanes: alldayLanes } = this._layoutAllDayItems(days);
        const trackHeight = Math.max(16, alldayLanes * 16 + 6);
        const dayCols = days.map(d => {
            const lines = [];
            for (let h = HS; h < HE - 1; h++) lines.push(`<div class="hour-line" style="top:${(h - HS) * HP}px"></div>`);
            let band = '';
            const isWorkday = !d.special || d.special.workday === true;
            if (isWorkday && Array.isArray(wh) && wh[d.workIdx]) {
                const w = wh[d.workIdx];
                const sm = timeToMinutes(w.start);
                const em = timeToMinutes(w.end);
                if (sm != null && em != null && em > sm) {
                    const top = (sm / 60 - HS) * HP;
                    const height = ((em - sm) / 60) * HP;
                    const labelTop = Math.max(top + 2, top);
                    band = `<div class="work-band" style="top:${top}px;height:${height}px" title="${w.start}–${w.end}"></div>`
                        + `<div class="work-label" style="top:${labelTop}px">${w.start}–${w.end}</div>`;
                }
            }
            let now = '';
            if (d.isToday) {
                const n = new Date();
                const mins = n.getHours() * 60 + n.getMinutes();
                const top = (mins / 60 - HS) * HP;
                if (top >= 0 && top <= (HE - HS) * HP) {
                    now = `<div class="now-line" data-now style="top:${top}px"></div>`;
                }
            }
            const colCls = ['col'];
            if (d.isToday) colCls.push('today');
            if (d.special) {
                colCls.push('special');
                if (d.special.workday) colCls.push('workday');
            }
            return `<div class="${colCls.join(' ')}" data-date="${d.iso}">${band}${lines.join('')}${(itemsByDay[d.iso] || '')}${now}</div>`;
        }).join('');

        const alldayRow = `<div class="allday-corner" title="Heldagshendelser">heldag</div>`
            + `<div class="allday-track" data-allday-track style="grid-column: 2 / span ${days.length}; height:${trackHeight}px">${alldayHtml}</div>`;
        const markup = `<div class="grid"><div class="corner"></div>${dayHeads}${alldayRow}<div class="hours">${hourCells.join('')}</div>${dayCols}</div>`;

        // Wire events after render
        setTimeout(() => this._wireItemEvents(), 0);

        return html`${unsafeHTML(markup)}`;
    }

    _layoutItems(days, HS, HE, HP) {
        const out = {};
        const dayMap = {};
        days.forEach((d, idx) => { dayMap[d.iso] = idx; out[d.iso] = ''; });
        const items = Array.isArray(this._items) ? this._items : [];
        const totalPx = (HE - HS) * HP;
        items.forEach((it, i) => {
            if (this._isAllDayType(it.type)) return; // rendered in the all-day band, not in the grid
            const start = parseDateTime(it.startDate);
            let end = parseDateTime(it.endDate);
            if (!start) return;
            if (!end) end = new Date(start.getTime() + 60 * 60 * 1000);
            if (end <= start) end = new Date(start.getTime() + 30 * 60 * 1000);
            // Iterate per day the item touches
            const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
            const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
            while (cur <= last) {
                const iso = cur.getUTCFullYear() + '-' + pad2(cur.getUTCMonth() + 1) + '-' + pad2(cur.getUTCDate());
                if (dayMap[iso] != null) {
                    const dayStart = new Date(cur);
                    const dayEnd = new Date(cur); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
                    const segStart = start > dayStart ? start : dayStart;
                    const segEnd = end < dayEnd ? end : dayEnd;
                    const startMin = (segStart - dayStart) / 60000;
                    const endMin = (segEnd - dayStart) / 60000;
                    let top = (startMin / 60 - HS) * HP;
                    let bottom = (endMin / 60 - HS) * HP;
                    if (bottom <= 0 || top >= totalPx) {
                        cur.setUTCDate(cur.getUTCDate() + 1);
                        continue;
                    }
                    top = Math.max(0, top);
                    bottom = Math.min(totalPx, bottom);
                    const height = Math.max(14, bottom - top);
                    const continuesUp = startMin > 0 && segStart > start ? false : (start < dayStart);
                    const continuesDown = end > dayEnd;
                    const cls = ['item'];
                    if (continuesUp) cls.push('continues-up');
                    if (continuesDown) cls.push('continues-down');
                    const isSelected = (it.id != null && this._selectedId === it.id);
                    if (isSelected) cls.push('selected');
                    const color = it.type ? this._typeColor(it.type) : '';
                    const styleParts = [`top:${top}px`, `height:${height}px`];
                    if (color) styleParts.push(`background:${color}`);
                    const attrs = [
                        `class="${cls.join(' ')}"`,
                        `style="${styleParts.join(';')}"`,
                        `data-item-idx="${i}"`,
                    ];
                    if (it.id != null) attrs.push(`data-item-id="${escapeHtml(it.id)}"`);
                    if (it.type) attrs.push(`data-type="${escapeHtml(it.type)}"`);
                    if (it.moveable) attrs.push(`data-moveable="true" draggable="true"`);
                    const heading = it.heading ? `<div class="item-h">${escapeHtml(it.heading)}</div>` : '';
                    const body = it.body ? `<div class="item-b">${escapeHtml(it.body)}</div>` : '';
                    const openIcon = isSelected ? `<button type="button" class="item-open" title="Åpne">↗</button>` : '';
                    out[iso] += `<div ${attrs.join(' ')} title="${escapeHtml((it.heading || '') + (it.body ? ' — ' + it.body : ''))}">${heading}${body}${openIcon}</div>`;
                }
                cur.setUTCDate(cur.getUTCDate() + 1);
            }
        });
        return out;
    }

    _layoutAllDayItems(days) {
        const items = Array.isArray(this._items) ? this._items : [];
        if (!days.length) return { html: '', lanes: 0 };
        const dayCount = days.length;
        const dayIdx = {};
        days.forEach((d, i) => { dayIdx[d.iso] = i; });
        const firstIso = days[0].iso;
        const lastIso = days[dayCount - 1].iso;
        const firstDate = parseDate(firstIso);
        const lastDate = parseDate(lastIso);

        // Build segments: { idx, item, startCol, endCol, continuesLeft, continuesRight }
        const segs = [];
        items.forEach((it, i) => {
            if (!this._isAllDayType(it.type)) return;
            const sRaw = String(it.startDate || '').slice(0, 10);
            const eRaw = String(it.endDate || it.startDate || '').slice(0, 10);
            const s = parseDate(sRaw);
            const e = parseDate(eRaw) || s;
            if (!s) return;
            // Inclusive day range; clip to visible range.
            const segStart = s < firstDate ? firstDate : s;
            const segEnd = e > lastDate ? lastDate : e;
            if (segEnd < firstDate || segStart > lastDate) return;
            const startCol = dayIdx[fmtDate(segStart)];
            const endCol = dayIdx[fmtDate(segEnd)];
            if (startCol == null || endCol == null) return;
            segs.push({
                i, it,
                startCol, endCol,
                continuesLeft: s < firstDate,
                continuesRight: e > lastDate,
            });
        });
        if (!segs.length) return { html: '', lanes: 0 };

        // Lane assignment (greedy): sort by startCol then length.
        segs.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
        const lanes = []; // each lane: highest endCol used
        segs.forEach(seg => {
            for (let l = 0; l < lanes.length; l++) {
                if (lanes[l] < seg.startCol) { seg.lane = l; lanes[l] = seg.endCol; return; }
            }
            seg.lane = lanes.length;
            lanes.push(seg.endCol);
        });

        const laneH = 16; // px per lane (bar 14px + 2px gap)
        const parts = segs.map(seg => {
            const leftPct = (seg.startCol / dayCount) * 100;
            const widthPct = ((seg.endCol - seg.startCol + 1) / dayCount) * 100;
            const top = 3 + seg.lane * laneH;
            const cls = ['allday-bar'];
            if (seg.continuesLeft) cls.push('continues-left');
            if (seg.continuesRight) cls.push('continues-right');
            const isSelected = (seg.it.id != null && this._selectedId === seg.it.id);
            if (isSelected) cls.push('selected');
            const color = seg.it.type ? this._typeColor(seg.it.type) : '';
            const style = [
                `left:calc(${leftPct}% + 2px)`,
                `width:calc(${widthPct}% - 4px)`,
                `top:${top}px`,
            ];
            if (color) style.push(`background:${color}`);
            const attrs = [
                `class="${cls.join(' ')}"`,
                `style="${style.join(';')}"`,
                `data-item-idx="${seg.i}"`,
                `data-allday-idx="${seg.i}"`,
            ];
            if (seg.it.id != null) attrs.push(`data-item-id="${escapeHtml(seg.it.id)}"`);
            if (seg.it.type) attrs.push(`data-type="${escapeHtml(seg.it.type)}"`);
            if (seg.it.moveable) attrs.push(`data-moveable="true" draggable="true"`);
            const title = (seg.it.heading || '') + (seg.it.body ? ' — ' + seg.it.body : '');
            const label = seg.it.heading ? `<span class="ad-label">${escapeHtml(seg.it.heading)}</span>` : '';
            const openIcon = isSelected ? `<button type="button" class="item-open" title="Åpne">↗</button>` : '';
            return `<div ${attrs.join(' ')} title="${escapeHtml(title)}">${label}${openIcon}</div>`;
        }).join('');
        return { html: parts, lanes: lanes.length };
    }

    _wireItemEvents() {
        if (!this.shadowRoot || this._rootWired) return;
        this._rootWired = true;
        const root = this.shadowRoot;

        root.addEventListener('click', (ev) => {
            const openEl = ev.target.closest && ev.target.closest('.item-open');
            if (openEl) {
                ev.stopPropagation();
                const host = openEl.closest('.item, .allday-bar');
                if (!host) return;
                const idx = parseInt(host.dataset.itemIdx != null ? host.dataset.itemIdx : host.dataset.alldayIdx, 10);
                const item = this._items && this._items[idx];
                if (!item) return;
                this.dispatchEvent(new CustomEvent('open-item-selected', {
                    bubbles: true, composed: true, detail: { item, id: item.id },
                }));
                return;
            }
            const adEl = ev.target.closest && ev.target.closest('.allday-bar');
            if (adEl) {
                ev.stopPropagation();
                const idx = parseInt(adEl.dataset.alldayIdx, 10);
                const item = this._items && this._items[idx];
                if (!item) return;
                this._select(item);
                return;
            }
            const itemEl = ev.target.closest && ev.target.closest('.item');
            if (itemEl) {
                ev.stopPropagation();
                const idx = parseInt(itemEl.dataset.itemIdx, 10);
                const item = this._items && this._items[idx];
                if (!item) return;
                this._select(item);
                return;
            }
            // Click outside any item → clear selection
            if (this._selectedId != null) this._select(null);
        });

        root.addEventListener('dblclick', (ev) => {
            const col = ev.target.closest && ev.target.closest('.col[data-date]');
            if (!col || (ev.target.closest && ev.target.closest('.item'))) return;
            const { date, time } = this._cellAt(col, ev);
            this.dispatchEvent(new CustomEvent('datePeriodSelected', {
                bubbles: true, composed: true, detail: { type: 'none', date, time },
            }));
        });

        root.addEventListener('contextmenu', (ev) => {
            const col = ev.target.closest && ev.target.closest('.col[data-date]');
            if (!col || (ev.target.closest && ev.target.closest('.item'))) return;
            ev.preventDefault();
            const { date, time } = this._cellAt(col, ev);
            this._openTypeMenu(ev.clientX, ev.clientY, date, time);
        });
    }

    _cellAt(col, ev) {
        const { start: HS, px: HP } = this._hourBounds();
        const rect = col.getBoundingClientRect();
        const y = ev.clientY - rect.top;
        const totalMin = Math.max(0, Math.round((y / HP) * 60 / 15) * 15);
        const hour = HS + Math.floor(totalMin / 60);
        const min = totalMin % 60;
        const pad = n => String(n).padStart(2, '0');
        return { date: col.dataset.date, time: pad(Math.min(23, hour)) + ':' + pad(min) };
    }

    _openTypeMenu(x, y, date, time) {
        this._closeTypeMenu();
        const menu = document.createElement('div');
        menu.className = 'ctx-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        const types = this._eventTypes || [];
        if (!types.length) {
            menu.innerHTML = '<div class="ctx-empty">Ingen typer definert</div>';
        } else {
            const header = '<div class="ctx-h">Nytt møte</div>';
            const items = types.map(t => {
                const swatch = t.color
                    ? `<span class="ctx-swatch" style="background:${escapeHtml(t.color)}"></span>`
                    : '';
                const icon = `<span class="ctx-icon">${escapeHtml(t.icon || '')}</span>`;
                return `<button type="button" data-type="${escapeHtml(t.typeId)}">${swatch}${icon}<span>${escapeHtml(t.name)}</span></button>`;
            }).join('');
            menu.innerHTML = header + items;
        }
        this.shadowRoot.appendChild(menu);
        this._ctxMenu = menu;

        // Adjust if off-screen on the right/bottom.
        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth) menu.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
        if (r.bottom > window.innerHeight) menu.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';

        menu.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-type]');
            if (!btn) return;
            const typeId = btn.dataset.type;
            const t = types.find(x => x.typeId === typeId) || { typeId, icon: '', name: typeId };
            this._closeTypeMenu();
            this.dispatchEvent(new CustomEvent('datePeriodSelected', {
                bubbles: true, composed: true,
                detail: { type: t.typeId, icon: t.icon, name: t.name, date, time },
            }));
        });

        const onAway = (ev) => {
            if (ev.composedPath && ev.composedPath().includes(menu)) return;
            this._closeTypeMenu();
        };
        const onEsc = (ev) => { if (ev.key === 'Escape') this._closeTypeMenu(); };
        // Defer attaching so the originating right-click doesn't immediately close.
        setTimeout(() => {
            document.addEventListener('mousedown', onAway, true);
            document.addEventListener('contextmenu', onAway, true);
            document.addEventListener('keydown', onEsc);
        }, 0);
        this._ctxCleanup = () => {
            document.removeEventListener('mousedown', onAway, true);
            document.removeEventListener('contextmenu', onAway, true);
            document.removeEventListener('keydown', onEsc);
        };
    }

    _closeTypeMenu() {
        if (this._ctxCleanup) { try { this._ctxCleanup(); } catch {} this._ctxCleanup = null; }
        if (this._ctxMenu && this._ctxMenu.parentNode) this._ctxMenu.parentNode.removeChild(this._ctxMenu);
        this._ctxMenu = null;
    }

    _updateNowLine() {
        const el = this.shadowRoot && this.shadowRoot.querySelector('.now-line[data-now]');
        if (!el) return;
        const { start: HS, px: HP } = this._hourBounds();
        const n = new Date();
        const mins = n.getHours() * 60 + n.getMinutes();
        el.style.top = ((mins / 60 - HS) * HP) + 'px';
    }
}

if (!customElements.get('week-calendar')) customElements.define('week-calendar', WeekCalendar);
