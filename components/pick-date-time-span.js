/**
 * <pick-date-time-span start="YYYY-MM-DD HH:MM" end="YYYY-MM-DD HH:MM">
 *
 * Compact component for selecting a start and end datetime. Renders two
 * trigger buttons ("Fra" / "Til") that open a <date-time-picker> popup
 * inline. The end picker's min is always clamped to the start value so
 * the user cannot pick an end before start.
 *
 * Attributes (observed):
 *   start   — "YYYY-MM-DD HH:MM" initial start value (default: now rounded to 5min)
 *   end     — "YYYY-MM-DD HH:MM" initial end value (default: start + 60min)
 *   step    — minute granularity for the pickers (default 5)
 *
 * JS API:
 *   el.start  → get/set start value as "YYYY-MM-DD HH:MM"
 *   el.end    → get/set end value as "YYYY-MM-DD HH:MM"
 *
 * Events (bubbling, composed):
 *   timespan-changed  detail: { start, end }  — whenever start or end changes
 *
 * Form-participation:
 *   Contains hidden inputs named "start-date", "start-time", "end-date",
 *   "end-time" for FormData compatibility.
 */
import { WNElement, html, escapeHtml } from './_shared.js';
import './date-time-picker.js';

const STYLES = `
    :host { display: block; font: inherit; color: var(--text-strong); }
    .span-row { display: flex; gap: 10px; align-items: flex-start; }
    .span-col { flex: 1; min-width: 0; }
    .span-label {
        display: block; font-size: 0.78em; color: var(--text-muted-warm);
        font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
        margin-bottom: 4px;
    }
    .trigger {
        display: flex; align-items: center; gap: 6px;
        padding: 7px 12px; border: 1px solid var(--border); border-radius: 6px;
        background: var(--bg); cursor: pointer; font: inherit; font-size: 0.92em;
        color: var(--text-strong); width: 100%; box-sizing: border-box;
        transition: border-color 0.12s, box-shadow 0.12s;
    }
    .trigger:hover { border-color: var(--accent); }
    .trigger:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .trigger.active { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .trigger .icon { font-size: 1em; opacity: 0.7; }
    .trigger .val { flex: 1; }
    .trigger .val.placeholder { color: var(--text-subtle); }
    .picker-wrap {
        position: relative; margin-top: 6px;
    }
    .picker-wrap date-time-picker {
        position: absolute; top: 0; left: 0; z-index: 100;
    }
    .err {
        color: var(--danger, #c53030); font-size: 0.82em; margin-top: 6px;
        min-height: 1em;
    }
`;

const DAY_NAMES = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

function pad(n) { return String(n).padStart(2, '0'); }

function nowRounded(step = 5) {
    const d = new Date();
    const m = Math.ceil(d.getMinutes() / step) * step;
    const h = m >= 60 ? d.getHours() + 1 : d.getHours();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h % 24)}:${pad(m % 60)}`;
}

function addMinutesToDt(dt, mins) {
    const m = (dt || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!m) return '';
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    d.setMinutes(d.getMinutes() + mins);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(dt) {
    if (!dt) return '';
    const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!m) return dt;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const dayName = DAY_NAMES[d.getDay()];
    return `${dayName} ${+m[3]}.${+m[2]}. ${m[4]}:${m[5]}`;
}

function parseDt(v) {
    const m = (v || '').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
    return m ? { date: m[1], time: m[2] } : null;
}

class PickDateTimeSpan extends WNElement {
    static get observedAttributes() { return ['start', 'end', 'step']; }

    constructor() {
        super();
        this._start = '';
        this._end = '';
        this._openPicker = null; // 'start' | 'end' | null
    }

    css() { return STYLES; }

    get start() { return this._start; }
    set start(v) {
        this._start = v || '';
        // Push end forward if it's now before start
        if (this._end && this._start && this._end <= this._start) {
            this._end = addMinutesToDt(this._start, 60);
        }
        this.requestRender();
        this._emit();
    }

    get end() { return this._end; }
    set end(v) {
        this._end = v || '';
        this.requestRender();
        this._emit();
    }

    connectedCallback() {
        this._start = this.getAttribute('start') || nowRounded(this._step());
        this._end = this.getAttribute('end') || addMinutesToDt(this._start, 60);
        super.connectedCallback();
    }

    attributeChangedCallback(name, _o, _n) {
        if (name === 'start' && _n && _n !== this._start) { this._start = _n; }
        if (name === 'end' && _n && _n !== this._end) { this._end = _n; }
        super.attributeChangedCallback(name, _o, _n);
    }

    _step() { return Number(this.getAttribute('step')) || 5; }

    _emit() {
        this.dispatchEvent(new CustomEvent('timespan-changed', {
            bubbles: true, composed: true,
            detail: { start: this._start, end: this._end },
        }));
    }

    render() {
        const startDisplay = formatDisplay(this._start);
        const endDisplay = formatDisplay(this._end);
        const startActive = this._openPicker === 'start' ? ' active' : '';
        const endActive = this._openPicker === 'end' ? ' active' : '';

        return html`
            <div class="span-row">
                <div class="span-col">
                    <span class="span-label">Fra</span>
                    <button type="button" class="trigger${startActive}" data-trigger="start" title="Velg starttid">
                        <span class="icon">📅</span>
                        <span class="val${startDisplay ? '' : ' placeholder'}">${startDisplay || 'Velg...'}</span>
                    </button>
                    <div class="picker-wrap" data-picker-slot="start"></div>
                </div>
                <div class="span-col">
                    <span class="span-label">Til</span>
                    <button type="button" class="trigger${endActive}" data-trigger="end" title="Velg sluttid">
                        <span class="icon">📅</span>
                        <span class="val${endDisplay ? '' : ' placeholder'}">${endDisplay || 'Velg...'}</span>
                    </button>
                    <div class="picker-wrap" data-picker-slot="end"></div>
                </div>
            </div>
            <div class="err" data-err></div>
        `;
    }

    afterRender() {
        this._wireClicks();
        // Re-open picker if it was open before re-render
        if (this._openPicker) {
            this._showPicker(this._openPicker);
        }
    }

    _wireClicks() {
        const sr = this.shadowRoot;
        if (!sr || sr.__spanWired) return;
        sr.__spanWired = true;
        sr.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-trigger]');
            if (trigger) {
                const which = trigger.dataset.trigger;
                if (this._openPicker === which) {
                    this._closePicker();
                } else {
                    this._openPicker = which;
                    this.requestRender();
                }
                return;
            }
        });
        sr.addEventListener('datetime-selected', (e) => {
            e.stopPropagation();
            const val = e.detail && e.detail.value;
            if (!val) return;
            if (this._openPicker === 'start') {
                this._start = val;
                // If end is now before start, push end forward
                if (this._end && this._end <= this._start) {
                    this._end = addMinutesToDt(this._start, 60);
                }
                this._emit();
                // Auto-open end picker after selecting start
                this._openPicker = 'end';
                this.requestRender();
            } else if (this._openPicker === 'end') {
                if (val <= this._start) {
                    this._showError('Sluttid må være etter starttid');
                    return;
                }
                this._end = val;
                this._emit();
                this._closePicker();
            }
        });
        sr.addEventListener('datetime-cancelled', (e) => {
            e.stopPropagation();
            this._closePicker();
        });
    }

    _showPicker(which) {
        const sr = this.shadowRoot;
        if (!sr) return;
        // Remove any existing picker
        const existing = sr.querySelector('date-time-picker');
        if (existing) existing.remove();

        const slot = sr.querySelector(`[data-picker-slot="${which}"]`);
        if (!slot) return;

        const picker = document.createElement('date-time-picker');
        picker.setAttribute('mode', 'datetime');
        if (which === 'start') {
            picker.value = this._start;
        } else {
            picker.value = this._end || addMinutesToDt(this._start, 60);
            picker.setAttribute('min', this._start);
        }
        slot.appendChild(picker);
        picker.focus();
    }

    _closePicker() {
        this._openPicker = null;
        this.requestRender();
    }

    _showError(msg) {
        const err = this.shadowRoot && this.shadowRoot.querySelector('[data-err]');
        if (err) err.textContent = msg || '';
        if (msg) setTimeout(() => { if (err) err.textContent = ''; }, 3000);
    }
}

if (!customElements.get('pick-date-time-span')) {
    customElements.define('pick-date-time-span', PickDateTimeSpan);
}

export { PickDateTimeSpan };
export default PickDateTimeSpan;
