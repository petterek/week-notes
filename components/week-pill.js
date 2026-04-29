/**
 * <week-pill week="YYYY-WNN"> — small badge showing "U<NN>" with the
 * full ISO week as a tooltip. Clicking emits a cancelable bubbling
 * 'week-clicked' CustomEvent with detail { year, weekNumber } (numbers).
 */
import { WNElement, html } from './_shared.js';

const STYLES = `
    :host { display: inline-block; cursor: pointer; }
    .pill {
        display: inline-block;
        background: var(--surface-alt);
        color: var(--text-muted-warm);
        padding: 2px 8px;
        border-radius: 10px;
        font: inherit;
        font-size: 0.7em;
        font-weight: 600;
    }
`;

class WeekPill extends WNElement {
    static get observedAttributes() { return ['week']; }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.addEventListener('click', (ev) => {
            const week = this.getAttribute('week') || '';
            const m = week.match(/^(\d{4})-W(\d{1,2})$/i);
            if (!m) return;
            ev.preventDefault();
            this.dispatchEvent(new CustomEvent('week-clicked', {
                bubbles: true, cancelable: true,
                detail: { year: parseInt(m[1], 10), weekNumber: parseInt(m[2], 10) },
            }));
        });
    }

    css() { return STYLES; }

    render() {
        const week = this.getAttribute('week') || '';
        const num = (week.split('-')[1] || '').replace(/^W/i, '');
        if (!num) return null;
        return html`<span class="pill" title="Uke ${week}">U${num}</span>`;
    }
}

if (!customElements.get('week-pill')) customElements.define('week-pill', WeekPill);
