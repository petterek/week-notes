/**
 * <time-picker
 *     value="HH:MM"
 *     name="start"
 *     step="5"
 *     min="00:00"
 *     max="23:55"
 *     disabled>
 *
 * A custom time picker that renders an hour <select> (00-23) plus a minute
 * <select> (00, step, 2*step, ... up to 60). Designed as a drop-in replacement
 * for <input type="time"> in places where Chrome's spinner UI is undesirable
 * (the calendar/meeting create overlays).
 *
 * Form-associated: when used inside a <form>, the current value is reported as
 * the form value under the configured `name` attribute, so FormData picks it up.
 *
 * Attributes:
 *   value     — current value as "HH:MM". Empty / missing means unset.
 *   name      — form-control name (used by form-association). Optional.
 *   step      — minute granularity, default 5. Allowed: 1, 5, 10, 15, 30.
 *   min, max  — optional clamps in "HH:MM" form.
 *   disabled  — disables both selects.
 *   required  — when set, an empty value reports a validity error.
 *
 * JS API:
 *   el.value          → "HH:MM" or "" if unset
 *   el.value = "08:30"
 *   el.checkValidity() / .reportValidity() — standard form-validation API
 *
 * Events:
 *   change — bubbling/composed; detail: { value }
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';

const STYLES = `
    :host { display: inline-flex; align-items: center; gap: 4px; font: inherit; color: var(--text-strong); }
    :host([disabled]) { opacity: 0.55; pointer-events: none; }
    select {
        padding: 6px 6px; border: 1px solid var(--border); border-radius: 5px;
        background: var(--bg); color: var(--text-strong); font: inherit; font-size: 0.95em;
        cursor: pointer; appearance: none; -webkit-appearance: none; -moz-appearance: none;
        background-image: linear-gradient(45deg, transparent 50%, var(--text-muted-warm) 50%),
                          linear-gradient(-45deg, transparent 50%, var(--text-muted-warm) 50%);
        background-position: calc(100% - 12px) center, calc(100% - 7px) center;
        background-size: 5px 5px, 5px 5px;
        background-repeat: no-repeat;
        padding-right: 22px;
        min-width: 3.4em;
    }
    select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); background-color: var(--surface); }
    .sep { color: var(--text-muted-warm); font-weight: 600; }
`;

function pad2(n) { return String(n).padStart(2, '0'); }

function parseTime(s) {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]); const mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return { h, m: mi };
}

function formatTime(h, m) {
    return pad2(h) + ':' + pad2(m);
}

function clampStep(step) {
    const allowed = [1, 5, 10, 15, 20, 30, 60];
    const n = Number(step);
    if (!Number.isFinite(n)) return 5;
    return allowed.includes(n) ? n : 5;
}

function roundToStep(min, step) {
    const r = Math.round(min / step) * step;
    return r >= 60 ? 0 : r;
}

class TimePicker extends WNElement {
    static get formAssociated() { return true; }
    static get observedAttributes() {
        return ['value', 'name', 'step', 'min', 'max', 'disabled', 'required'];
    }

    constructor() {
        super();
        try { this._internals = this.attachInternals(); } catch (_) { this._internals = null; }
        this._value = '';
    }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        this._syncValueFromAttr();
        this._reportFormValue();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'value' && newVal !== this._value) {
            this._syncValueFromAttr();
        }
        super.attributeChangedCallback(name, oldVal, newVal);
        if (name === 'value') this._reportFormValue();
    }

    _syncValueFromAttr() {
        const raw = this.getAttribute('value') || '';
        const t = parseTime(raw);
        if (!t) { this._value = ''; return; }
        const step = clampStep(this.getAttribute('step') || 5);
        const m = roundToStep(t.m, step);
        this._value = formatTime(t.h, m);
    }

    get value() { return this._value || ''; }
    set value(v) {
        const t = parseTime(v);
        const step = clampStep(this.getAttribute('step') || 5);
        const next = t ? formatTime(t.h, roundToStep(t.m, step)) : '';
        if (next === this._value) return;
        this._value = next;
        if (next) this.setAttribute('value', next);
        else this.removeAttribute('value');
        // setAttribute triggers attributeChangedCallback → _reportFormValue + render.
        // For the empty-value case (where removeAttribute on already-absent attr
        // doesn't fire), force a refresh:
        if (!next) { this._reportFormValue(); this.requestRender(); }
    }

    _reportFormValue() {
        if (!this._internals) return;
        try { this._internals.setFormValue(this._value || ''); } catch (_) {}
        this._updateValidity();
    }

    _updateValidity() {
        if (!this._internals) return;
        try {
            const required = this.hasAttribute('required');
            if (required && !this._value) {
                this._internals.setValidity({ valueMissing: true }, 'Velg et tidspunkt', this.shadowRoot.querySelector('select'));
            } else {
                this._internals.setValidity({});
            }
        } catch (_) {}
    }

    checkValidity() { return this._internals ? this._internals.checkValidity() : true; }
    reportValidity() { return this._internals ? this._internals.reportValidity() : true; }

    formDisabledCallback(disabled) { this._formDisabled = !!disabled; this.requestRender(); }
    formResetCallback() {
        const def = this.getAttribute('value') || '';
        this.value = def;
    }

    render() {
        const step = clampStep(this.getAttribute('step') || 5);
        const cur = parseTime(this._value);
        const curH = cur ? cur.h : null;
        const curM = cur ? cur.m : null;
        const min = parseTime(this.getAttribute('min') || '') || { h: 0, m: 0 };
        const max = parseTime(this.getAttribute('max') || '') || { h: 23, m: 59 };
        const disabled = this.hasAttribute('disabled') || this._formDisabled;

        const hours = [];
        for (let h = 0; h < 24; h++) {
            if (h < min.h || h > max.h) continue;
            hours.push(h);
        }
        const minutes = [];
        for (let m = 0; m < 60; m += step) minutes.push(m);
        // If current minute isn't on the step grid (e.g., legacy value), include it so it stays visible.
        if (curM != null && !minutes.includes(curM)) minutes.push(curM);
        minutes.sort((a, b) => a - b);

        const hourOpts = hours.map(h => `<option value="${pad2(h)}"${curH === h ? ' selected' : ''}>${pad2(h)}</option>`).join('');
        const minOpts  = minutes.map(m => `<option value="${pad2(m)}"${curM === m ? ' selected' : ''}>${pad2(m)}</option>`).join('');

        const ariaLabel = escapeHtml(this.getAttribute('aria-label') || this.getAttribute('name') || 'tid');
        const blank = curH == null
            ? `<option value="" selected disabled hidden>--</option>`
            : '';

        const internalName = (this.getAttribute('name') || 'tid');
        const hId = `tp-${this._uid || (this._uid = Math.random().toString(36).slice(2, 8))}-h`;
        const mId = hId.replace(/-h$/, '-m');

        return html`
            <select id="${hId}" name="${internalName}-h" data-h aria-label="${ariaLabel} hour" ${disabled ? 'disabled' : ''}>${unsafeHTML(blank + hourOpts)}</select>
            <span class="sep">:</span>
            <select id="${mId}" name="${internalName}-m" data-m aria-label="${ariaLabel} minute" ${disabled ? 'disabled' : ''}>${unsafeHTML(blank + minOpts)}</select>
        `;
    }

    requestRender() {
        super.requestRender();
        if (!this.shadowRoot) return;
        const hSel = this.shadowRoot.querySelector('[data-h]');
        const mSel = this.shadowRoot.querySelector('[data-m]');
        if (!hSel || !mSel) return;
        const onChange = () => {
            const h = hSel.value, m = mSel.value;
            if (!h || !m) { this._value = ''; this.removeAttribute('value'); }
            else {
                const next = `${h}:${m}`;
                this._value = next;
                this.setAttribute('value', next);
            }
            this._reportFormValue();
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true, composed: true, detail: { value: this._value },
            }));
        };
        hSel.addEventListener('change', onChange);
        mSel.addEventListener('change', onChange);
    }
}

if (!customElements.get('time-picker')) customElements.define('time-picker', TimePicker);
