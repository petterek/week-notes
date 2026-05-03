/**
 * <date-time-picker mode="date|datetime" value="YYYY-MM-DD[ HH:MM]">
 *
 * Custom calendar popup styled to match week-notes. Shows a month grid
 * (Mon-first ISO weekdays, Norwegian short labels) with prev/next
 * navigation, "I dag" (today) and Avbryt/OK actions. In datetime mode
 * it also renders an hour/minute select row.
 *
 * Attributes (observed):
 *   mode    "date" (default) | "datetime"
 *   value   initial value. "YYYY-MM-DD" for date, "YYYY-MM-DD HH:MM" for
 *           datetime. Empty/unset → today / now.
 *
 * JS API:
 *   el.value   → current selected value (or "" if none)
 *   el.value = "2026-05-03"
 *
 * Events (bubbling, composed):
 *   datetime-selected  detail: { value }   — user clicked OK
 *   datetime-cancelled                       — user clicked Avbryt / Esc
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const DAY_LABELS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];
const MONTH_LABELS = [
    'januar', 'februar', 'mars', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

function pad(n) { return String(n).padStart(2, '0'); }

function parse(value, mode) {
    if (!value) return null;
    const re = mode === 'datetime'
        ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/
        : /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = String(value).match(re);
    if (!m) return null;
    return {
        y: +m[1], mo: +m[2], d: +m[3],
        h: mode === 'datetime' ? +m[4] : 0,
        mi: mode === 'datetime' ? +m[5] : 0,
    };
}

function format(parts, mode) {
    if (!parts) return '';
    const date = `${parts.y}-${pad(parts.mo)}-${pad(parts.d)}`;
    if (mode !== 'datetime') return date;
    return `${date} ${pad(parts.h)}:${pad(parts.mi)}`;
}

// First weekday of the month grid (Monday=0). For ISO weeks this is what we want.
function startOffsetMonFirst(y, m /* 1-12 */) {
    const d = new Date(Date.UTC(y, m - 1, 1));
    return (d.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0, …
}

function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

class DateTimePicker extends WNElement {
    static get observedAttributes() { return ['mode', 'value']; }

    constructor() {
        super();
        this._cursor = null;       // { y, mo } — month being shown
        this._selected = null;     // { y, mo, d, h, mi }
        this._initFromAttrs();
    }

    _initFromAttrs() {
        const mode = this.getAttribute('mode') === 'datetime' ? 'datetime' : 'date';
        const parsed = parse(this.getAttribute('value'), mode) || this._defaultNow(mode);
        this._selected = parsed;
        this._cursor = { y: parsed.y, mo: parsed.mo };
    }

    _defaultNow(mode) {
        const n = new Date();
        return {
            y: n.getFullYear(),
            mo: n.getMonth() + 1,
            d: n.getDate(),
            h: mode === 'datetime' ? n.getHours() : 0,
            mi: mode === 'datetime' ? Math.round(n.getMinutes() / 5) * 5 % 60 : 0,
        };
    }

    attributeChangedCallback(name, _o, _n) {
        if (this.isConnected) {
            this._initFromAttrs();
            super.attributeChangedCallback(name, _o, _n);
        }
    }

    connectedCallback() {
        // Re-read attributes here (in addition to the constructor) because the
        // host page may have called setAttribute() before insertion — at that
        // point attributeChangedCallback skips work since isConnected was false.
        this._initFromAttrs();
        super.connectedCallback();
    }

    disconnectedCallback() {
        this._releaseKeyboard();
    }

    /**
     * Public: take keyboard focus for the picker. Installs a document-level
     * keydown listener so arrow keys / Enter / Esc work no matter where the
     * platform focus actually lives. The listener is removed on commit,
     * cancel, or disconnection.
     */
    focus() {
        this._captureKeyboard();
        // Visually focus the selected day cell. Try in a microtask
        // (synchronous after mount) and again after the next animation frame
        // since the trigger may move the picker on-screen via rAF.
        const tryFocus = () => {
            const sel = this.shadowRoot && this.shadowRoot.querySelector('.day.is-selected');
            if (sel) sel.focus({ preventScroll: true });
        };
        queueMicrotask(tryFocus);
        requestAnimationFrame(tryFocus);
    }

    _captureKeyboard() {
        if (this._docKey) return;
        this._docKey = (e) => this._handleKey(e);
        // Use capture so we run before page-level shortcuts.
        document.addEventListener('keydown', this._docKey, true);
    }

    _releaseKeyboard() {
        if (!this._docKey) return;
        document.removeEventListener('keydown', this._docKey, true);
        this._docKey = null;
    }

    _handleKey(e) {
        // Ignore keys that originate inside a different (unrelated) editable
        // element on the page. Inputs/selects belonging to *this* picker live
        // inside our shadow root and reach the listener via composedPath.
        const path = e.composedPath ? e.composedPath() : [];
        const insidePicker = path.indexOf(this) !== -1;
        if (!insidePicker && document.activeElement && document.activeElement !== document.body
            && document.activeElement !== this
            && /^(INPUT|TEXTAREA|SELECT)$/i.test(document.activeElement.tagName)) {
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this._cancel();
            return;
        }
        // Alt+Enter commits from anywhere — handy when focus is on a select
        // where plain Enter has its own native behavior.
        if (e.key === 'Enter' && e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            this._commit();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const target = path[0];
            if (target && target.classList && target.classList.contains('day')
                && this._mode() === 'datetime') {
                const hour = this.shadowRoot && this.shadowRoot.querySelector('select.hour');
                if (hour) { hour.focus(); return; }
            }
            if (target instanceof HTMLSelectElement && target.classList.contains('hour')) {
                const min = this.shadowRoot && this.shadowRoot.querySelector('select.minute');
                if (min) { min.focus(); return; }
            }
            this._commit();
            return;
        }
        const arrow = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (arrow != null) {
            // Don't hijack arrows when a select is open / focused — selects use
            // arrows to change value.
            const ae = path[0];
            if (ae instanceof HTMLSelectElement) return;
            e.preventDefault();
            e.stopPropagation();
            this._shiftDay(arrow);
            this._focusSelectedDay();
        }
    }

    get value() { return format(this._selected, this._mode()); }
    set value(v) {
        const parts = parse(v, this._mode());
        if (parts) {
            this._selected = parts;
            this._cursor = { y: parts.y, mo: parts.mo };
            this.requestRender();
        }
    }

    _mode() { return this.getAttribute('mode') === 'datetime' ? 'datetime' : 'date'; }

    css() {
        return `
        :host {
            display: inline-block;
            background: var(--surface, #fff);
            color: var(--text-strong, #1a202c);
            border: 1px solid var(--border, #cbd5e0);
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            padding: 10px;
            font: inherit;
            font-size: 0.92em;
            min-width: 252px;
            user-select: none;
        }
        .head {
            display: flex; align-items: center; gap: 6px;
            margin-bottom: 8px;
        }
        .head .title {
            flex: 1; text-align: center;
            font-weight: 600; color: var(--text-strong, #1a202c);
            text-transform: capitalize;
            cursor: default;
        }
        .nav {
            background: transparent; border: 1px solid transparent;
            border-radius: 6px; cursor: pointer; padding: 4px 8px;
            font: inherit; color: var(--text-muted, #4a5568);
            line-height: 1;
        }
        .nav:hover { background: var(--surface-head, var(--surface-alt, #edf2f7)); border-color: var(--border-soft, var(--border)); }
        .grid {
            display: grid; grid-template-columns: repeat(7, 1fr);
            gap: 2px;
        }
        .dow {
            text-align: center; font-size: 0.75em;
            color: var(--text-subtle, #718096);
            text-transform: uppercase; letter-spacing: 0.04em;
            padding: 4px 0;
        }
        .day {
            text-align: center; padding: 6px 0;
            border-radius: 6px;
            background: transparent; border: 1px solid transparent;
            cursor: pointer; font: inherit; color: inherit;
        }
        .day:hover { background: var(--surface-head, var(--surface-alt, #edf2f7)); }
        .day.is-out { color: var(--text-subtle, #a0aec0); opacity: 0.55; }
        .day.is-today {
            border-color: var(--accent, #ed8936);
            color: var(--accent, #ed8936);
            font-weight: 600;
        }
        .day.is-selected {
            background: var(--accent, #ed8936);
            color: var(--surface, #fff);
            border-color: var(--accent, #ed8936);
        }
        .day:focus { outline: none; box-shadow: 0 0 0 2px var(--accent-soft, rgba(237, 137, 54, 0.35)); }
        .time {
            display: flex; align-items: center; gap: 6px;
            justify-content: center;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid var(--border-soft, var(--border));
        }
        .time-label { font-size: 0.78em; color: var(--text-muted, #4a5568); margin-right: 4px; }
        .time select {
            padding: 4px 6px; border: 1px solid var(--border, #cbd5e0);
            border-radius: 5px; background: var(--surface, #fff);
            color: var(--text-strong, inherit); font: inherit; font-size: 0.95em;
            cursor: pointer;
        }
        .time .sep { color: var(--text-muted, #4a5568); font-weight: 600; }
        .actions {
            display: flex; gap: 8px; align-items: center;
            margin-top: 10px;
        }
        .actions .today {
            margin-right: auto;
            padding: 5px 10px; font: inherit; font-size: 0.85em;
            border: 1px solid var(--border-soft, var(--border));
            background: transparent; color: var(--text-muted, #4a5568);
            border-radius: 6px; cursor: pointer;
        }
        .actions .today:hover { color: var(--accent, #ed8936); border-color: var(--accent, #ed8936); }
        .actions .cancel, .actions .ok {
            padding: 6px 12px; font: inherit; font-size: 0.9em;
            border-radius: 6px; cursor: pointer;
            border: 1px solid var(--border-soft, var(--border));
            background: var(--surface, #fff); color: var(--text-strong, inherit);
        }
        .actions .cancel:hover { background: var(--surface-head, var(--surface-alt, #edf2f7)); }
        .actions .ok {
            background: var(--accent, #ed8936); color: var(--surface, #fff);
            border-color: var(--accent, #ed8936); font-weight: 600;
        }
        .actions .ok:hover { filter: brightness(0.95); }
        `;
    }

    render() {
        const mode = this._mode();
        const cur = this._cursor;
        const today = new Date();
        const todayParts = { y: today.getFullYear(), mo: today.getMonth() + 1, d: today.getDate() };
        const sel = this._selected;
        const off = startOffsetMonFirst(cur.y, cur.mo);
        const inMonth = daysInMonth(cur.y, cur.mo);
        const prevMonth = cur.mo === 1 ? { y: cur.y - 1, mo: 12 } : { y: cur.y, mo: cur.mo - 1 };
        const nextMonth = cur.mo === 12 ? { y: cur.y + 1, mo: 1 } : { y: cur.y, mo: cur.mo + 1 };
        const inPrev = daysInMonth(prevMonth.y, prevMonth.mo);

        const cells = [];
        for (let i = 0; i < off; i++) {
            const d = inPrev - off + 1 + i;
            cells.push({ y: prevMonth.y, mo: prevMonth.mo, d, out: true });
        }
        for (let d = 1; d <= inMonth; d++) {
            cells.push({ y: cur.y, mo: cur.mo, d, out: false });
        }
        while (cells.length % 7 !== 0 || cells.length < 42) {
            const idx = cells.length - (off + inMonth) + 1;
            cells.push({ y: nextMonth.y, mo: nextMonth.mo, d: idx, out: true });
            if (cells.length >= 42) break;
        }

        const cellHtml = cells.map(c => {
            const isToday = c.y === todayParts.y && c.mo === todayParts.mo && c.d === todayParts.d;
            const isSelected = sel && c.y === sel.y && c.mo === sel.mo && c.d === sel.d;
            const cls = ['day'];
            if (c.out) cls.push('is-out');
            if (isToday) cls.push('is-today');
            if (isSelected) cls.push('is-selected');
            return `<button type="button" class="${cls.join(' ')}" data-y="${c.y}" data-m="${c.mo}" data-d="${c.d}" tabindex="${isSelected ? 0 : -1}">${c.d}</button>`;
        }).join('');

        const hourOpts = Array.from({ length: 24 }, (_, h) =>
            `<option value="${h}"${sel && sel.h === h ? ' selected' : ''}>${pad(h)}</option>`).join('');
        const minOpts = Array.from({ length: 12 }, (_, i) => i * 5).map(m =>
            `<option value="${m}"${sel && sel.mi === m ? ' selected' : ''}>${pad(m)}</option>`).join('');

        const timeRow = mode === 'datetime' ? `
            <div class="time">
                <span class="time-label">Tid:</span>
                <select class="hour" aria-label="time">${hourOpts}</select>
                <span class="sep">:</span>
                <select class="minute" aria-label="minutter">${minOpts}</select>
            </div>` : '';

        return `
            <div class="head">
                <button type="button" class="nav prev" aria-label="Forrige måned">‹</button>
                <div class="title">${escapeHtml(MONTH_LABELS[cur.mo - 1])} ${cur.y}</div>
                <button type="button" class="nav next" aria-label="Neste måned">›</button>
            </div>
            <div class="grid" role="grid">
                ${DAY_LABELS.map(l => `<div class="dow">${l}</div>`).join('')}
                ${cellHtml}
            </div>
            ${timeRow}
            <div class="actions">
                <button type="button" class="today">I dag</button>
                <button type="button" class="cancel">Avbryt</button>
                <button type="button" class="ok">OK</button>
            </div>
        `;
    }

    _focusSelectedDay() {
        const sel = this.shadowRoot && this.shadowRoot.querySelector('.day.is-selected');
        if (sel) sel.focus({ preventScroll: true });
    }

    _wireEvents() {
        const sr = this.shadowRoot;
        if (!sr || sr.__wired) return;
        sr.__wired = true;
        sr.addEventListener('click', (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (t.classList.contains('prev')) { this._shiftMonth(-1); this._focusSelectedDay(); return; }
            if (t.classList.contains('next')) { this._shiftMonth(1); this._focusSelectedDay(); return; }
            if (t.classList.contains('today')) { this._goToday(); this._focusSelectedDay(); return; }
            if (t.classList.contains('cancel')) { this._cancel(); return; }
            if (t.classList.contains('ok')) { this._commit(); return; }
            if (t.classList.contains('day')) {
                const y = +t.dataset.y, mo = +t.dataset.m, d = +t.dataset.d;
                this._selected = { ...this._selected, y, mo, d };
                this._cursor = { y, mo };
                this.requestRender();
                this._focusSelectedDay();
                return;
            }
        });
        sr.addEventListener('change', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLSelectElement)) return;
            if (t.classList.contains('hour')) this._selected = { ...this._selected, h: +t.value };
            else if (t.classList.contains('minute')) this._selected = { ...this._selected, mi: +t.value };
        });
        sr.addEventListener('dblclick', (e) => {
            const t = e.target;
            if (t instanceof Element && t.classList.contains('day')) this._commit();
        });
        sr.addEventListener('keydown', (e) => {
            const t = e.target;
            const isDay = t instanceof HTMLElement && t.classList.contains('day');
            const isTimeSelect = t instanceof HTMLSelectElement
                && (t.classList.contains('hour') || t.classList.contains('minute'));

            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                // In datetime mode, Enter on a day jumps to the hour select
                // so the user can refine the time before committing.
                if (isDay && this._mode() === 'datetime') {
                    const hour = this.shadowRoot && this.shadowRoot.querySelector('select.hour');
                    if (hour) { hour.focus(); return; }
                }
                // Enter on hour jumps to minute (small chained refinement).
                if (t instanceof HTMLSelectElement && t.classList.contains('hour')) {
                    const min = this.shadowRoot && this.shadowRoot.querySelector('select.minute');
                    if (min) { min.focus(); return; }
                }
                this._commit();
                return;
            }

            if (!isDay) return;
            const arrow = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
            if (arrow != null) {
                e.preventDefault();
                this._shiftDay(arrow);
                this._focusSelectedDay();
            } else if (e.key === ' ') {
                e.preventDefault();
                this._commit();
            }
        });
    }

    requestRender() {
        super.requestRender();
        this._wireEvents();
    }

    _shiftMonth(delta) {
        let y = this._cursor.y, mo = this._cursor.mo + delta;
        while (mo < 1) { mo += 12; y -= 1; }
        while (mo > 12) { mo -= 12; y += 1; }
        this._cursor = { y, mo };
        this.requestRender();
    }

    _shiftDay(delta) {
        const d = new Date(Date.UTC(this._selected.y, this._selected.mo - 1, this._selected.d));
        d.setUTCDate(d.getUTCDate() + delta);
        this._selected = {
            ...this._selected,
            y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
        };
        this._cursor = { y: this._selected.y, mo: this._selected.mo };
        this.requestRender();
    }

    _goToday() {
        const today = this._defaultNow(this._mode());
        this._selected = today;
        this._cursor = { y: today.y, mo: today.mo };
        this.requestRender();
    }

    _commit() {
        const value = format(this._selected, this._mode());
        this.dispatchEvent(new CustomEvent('datetime-selected', {
            detail: { value }, bubbles: true, composed: true,
        }));
    }

    _cancel() {
        this.dispatchEvent(new CustomEvent('datetime-cancelled', {
            bubbles: true, composed: true,
        }));
    }
}

if (!customElements.get('date-time-picker')) {
    customElements.define('date-time-picker', DateTimePicker);
}

export { DateTimePicker };
export default DateTimePicker;
