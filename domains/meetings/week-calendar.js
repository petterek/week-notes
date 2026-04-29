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
 *     week-calendar:item-click — detail: { item, id }
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

        const markup = `<div class="grid"><div class="corner"></div>${dayHeads}<div class="hours">${hourCells.join('')}</div>${dayCols}</div>`;

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
                    const attrs = [
                        `class="${cls.join(' ')}"`,
                        `style="top:${top}px;height:${height}px"`,
                        `data-item-idx="${i}"`,
                    ];
                    if (it.id != null) attrs.push(`data-item-id="${escapeHtml(it.id)}"`);
                    if (it.type) attrs.push(`data-type="${escapeHtml(it.type)}"`);
                    if (it.moveable) attrs.push(`data-moveable="true" draggable="true"`);
                    const heading = it.heading ? `<div class="item-h">${escapeHtml(it.heading)}</div>` : '';
                    const body = it.body ? `<div class="item-b">${escapeHtml(it.body)}</div>` : '';
                    out[iso] += `<div ${attrs.join(' ')} title="${escapeHtml((it.heading || '') + (it.body ? ' — ' + it.body : ''))}">${heading}${body}</div>`;
                }
                cur.setUTCDate(cur.getUTCDate() + 1);
            }
        });
        return out;
    }

    _wireItemEvents() {
        if (!this.shadowRoot) return;
        this.shadowRoot.querySelectorAll('.item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.itemIdx, 10);
                const item = this._items && this._items[idx];
                if (!item) return;
                this.dispatchEvent(new CustomEvent('week-calendar:item-click', {
                    bubbles: true, composed: true, detail: { item, id: item.id },
                }));
            });
        });
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
