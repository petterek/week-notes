/**
 * <nav-meta> — small navbar widget showing weekday/date, ISO week badge and a live clock.
 * Updates once per second. Norwegian locale (nb-NO).
 *
 * Emits boundary events (composed/bubbles) when the wall clock crosses
 * a new day/week/month/year. Useful for pages that want to refresh
 * "today / this week" derived UI without polling.
 *
 *   nav-meta:newMinute → { minute: 'YYYY-MM-DDTHH:MM', now: Date }
 *   nav-meta:newHour   → { hour:   'YYYY-MM-DDTHH',    now: Date }
 *   nav-meta:newDay    → { date: 'YYYY-MM-DD', now: Date }
 *   nav-meta:newWeek   → { week: 'YYYY-WNN',   now: Date }
 *   nav-meta:newMonth  → { month: 'YYYY-MM',   now: Date }
 *   nav-meta:newYear   → { year: NNNN,         now: Date }
 *
 * No event is fired on the initial mount — only on actual transitions.
 */
import { WNElement, html, isoWeek } from './_shared.js';

const STYLES = `
    :host { display: inline-flex; align-items: center; font-family: var(--font-mono); font-size: 0.85em; color: var(--text-muted-warm); opacity: 0.65; letter-spacing: 0.02em; white-space: nowrap; min-width: clamp(0px, 28vw, 320px); justify-content: flex-end; }
    .nm-date, .nm-week, .nm-clock { display: inline-block; vertical-align: middle; white-space: nowrap; }
    .nm-date, .nm-clock { margin-right: 10px; }
    .nm-week { padding: 1px 6px; border: 1px solid var(--border); border-radius: 3px; font-size: 0.78em; opacity: 0.9; margin-right: 10px; }
    @media (max-width: 900px) { .nm-date { display: none; } }
    @media (max-width: 700px) { .nm-week { display: none; } }
    @media (max-width: 500px) { .nm-clock { display: none; } }
`;

function pad2(n) { return String(n).padStart(2, '0'); }
function dayKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function hourKey(d)  { return `${dayKey(d)}T${pad2(d.getHours())}`; }
function minuteKey(d){ return `${hourKey(d)}:${pad2(d.getMinutes())}`; }

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
            this._emitBoundaries(now);
            this._timer = setTimeout(tick, 1000);
        };
        tick();
    }

    disconnectedCallback() {
        if (this._timer) clearTimeout(this._timer);
    }

    _emitBoundaries(now) {
        const minute = minuteKey(now);
        const hour = hourKey(now);
        const day = dayKey(now);
        const week = isoWeek(now);
        const month = monthKey(now);
        const year = now.getFullYear();
        // First tick after mount: just record the baseline, don't fire.
        if (!this._last) {
            this._last = { minute, hour, day, week, month, year };
            return;
        }
        const prev = this._last;
        if (prev.minute !== minute) {
            this.dispatchEvent(new CustomEvent('nav-meta:newMinute', {
                bubbles: true, composed: true, detail: { minute, now },
            }));
        }
        if (prev.hour !== hour) {
            this.dispatchEvent(new CustomEvent('nav-meta:newHour', {
                bubbles: true, composed: true, detail: { hour, now },
            }));
        }
        if (prev.day !== day) {
            this.dispatchEvent(new CustomEvent('nav-meta:newDay', {
                bubbles: true, composed: true, detail: { date: day, now },
            }));
        }
        if (prev.week !== week) {
            this.dispatchEvent(new CustomEvent('nav-meta:newWeek', {
                bubbles: true, composed: true, detail: { week, now },
            }));
        }
        if (prev.month !== month) {
            this.dispatchEvent(new CustomEvent('nav-meta:newMonth', {
                bubbles: true, composed: true, detail: { month, now },
            }));
        }
        if (prev.year !== year) {
            this.dispatchEvent(new CustomEvent('nav-meta:newYear', {
                bubbles: true, composed: true, detail: { year, now },
            }));
        }
        this._last = { minute, hour, day, week, month, year };
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

