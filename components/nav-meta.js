/**
 * <nav-meta> — small navbar widget showing weekday/date, ISO week badge and a live clock.
 * Updates once per second. Norwegian locale (nb-NO).
 */
import { WNElement, html, isoWeek } from './_shared.js';

const STYLES = `
    :host { display: inline-block; align-items: center; font-family: var(--font-mono); font-size: 0.85em; color: var(--text-muted-warm); opacity: 0.65; letter-spacing: 0.02em; }
    .nm-date, .nm-week, .nm-clock { display: inline-block; vertical-align: middle; }
    .nm-date, .nm-clock { margin-right: 10px; }
    .nm-week { padding: 1px 6px; border: 1px solid var(--border); border-radius: 3px; font-size: 0.78em; opacity: 0.9; margin-right: 10px; }
`;

class NavMeta extends WNElement {
    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        const tick = () => {
            if (!this.isConnected) return;
            const now = new Date();
            const d = this.shadowRoot.querySelector('.nm-date');
            const w = this.shadowRoot.querySelector('.nm-week');
            const c = this.shadowRoot.querySelector('.nm-clock');
            if (d) d.textContent = now.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' });
            if (w) w.textContent = `Uke ${isoWeek(now)}`;
            if (c) c.textContent = now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this._timer = setTimeout(tick, 1000);
        };
        tick();
    }

    disconnectedCallback() {
        if (this._timer) clearTimeout(this._timer);
    }

    css() { return STYLES; }

    render() {
        return html`
            <span class="nm-date"></span>
            <span class="nm-week"></span>
            <span class="nm-clock"></span>
        `;
    }
}

if (!customElements.get('nav-meta')) customElements.define('nav-meta', NavMeta);
