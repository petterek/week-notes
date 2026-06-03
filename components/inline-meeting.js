/**
 * <inline-meeting meeting-id="<id>" state="open|done">
 *
 * Renders a styled chip for a meeting referenced inline in a note.
 * Produced by linkMentions() on the server for the reference forms:
 *
 *   {{m:?<id>}} → <inline-meeting meeting-id="<id>" state="open">
 *   {{m:!<id>}} → <inline-meeting meeting-id="<id>" state="done">
 *
 * Displays meeting title and date. Click → /calendar/<week>#m-<id>.
 * Meeting data is fetched lazily from /api/meetings (one fetch shared
 * across all instances on the page).
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const STYLES = `
    :host {
        display: inline;
        font: inherit;
    }
    .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 7px;
        border-radius: 4px;
        font-size: 0.92em;
        line-height: 1.35;
        vertical-align: baseline;
        background: var(--surface-alt);
        border: 1px solid var(--border);
        color: var(--text-strong);
        cursor: pointer;
        white-space: nowrap;
        max-width: 24em;
        overflow: hidden;
        text-overflow: ellipsis;
        text-decoration: none;
    }
    .chip:hover { background: var(--surface-head); }
    .chip.done { opacity: 0.75; }
    .chip.missing {
        background: var(--danger-soft, #fde8e8);
        color: var(--danger, #c0392b);
        border-color: var(--danger, #c0392b);
        cursor: default;
    }
    .chip.busy { opacity: 0.6; }
    .label { overflow: hidden; text-overflow: ellipsis; }
    .meta { opacity: 0.55; font-size: 0.85em; }
`;

let _meetingCache = null;
let _meetingPromise = null;

function loadMeetingMap() {
    if (_meetingCache) return Promise.resolve(_meetingCache);
    if (_meetingPromise) return _meetingPromise;
    _meetingPromise = fetch('/api/meetings').then(r => r.json()).then(arr => {
        const map = {};
        if (Array.isArray(arr)) arr.forEach(m => { if (m && m.id) map[m.id] = m; });
        _meetingCache = map;
        _meetingPromise = null;
        return map;
    }).catch(() => {
        _meetingPromise = null;
        return {};
    });
    return _meetingPromise;
}

function meetingWeek(date) {
    if (!date) return '';
    try {
        const d = new Date(date + 'T00:00:00Z');
        const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
        const dayOfWeek = (jan4.getUTCDay() + 6) % 7;
        const weekStart = new Date(jan4.getTime() - dayOfWeek * 86400000);
        const diff = d.getTime() - weekStart.getTime();
        const week = Math.floor(diff / (7 * 86400000)) + 1;
        return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
    } catch { return ''; }
}

class InlineMeeting extends WNElement {
    static get observedAttributes() { return ['meeting-id', 'state']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'meeting-id' && oldVal !== newVal) this.invalidateAwait('meeting');
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        const id = this.getAttribute('meeting-id') || '';
        return {
            meeting: () => id ? loadMeetingMap().then(map => map[id] || null) : Promise.resolve(null),
        };
    }

    _onClick(e) {
        const id = this.getAttribute('meeting-id') || '';
        const m = (_meetingCache && id) ? _meetingCache[id] : null;
        if (!m) return;
        e.preventDefault();
        const week = meetingWeek(m.date);
        const href = week ? `/calendar/${week}#m-${encodeURIComponent(id)}` : `/calendar#m-${encodeURIComponent(id)}`;
        window.location.href = href;
    }

    render({ meeting = null, _loading = false } = {}) {
        const id = this.getAttribute('meeting-id') || '';
        const state = (this.getAttribute('state') || 'open') === 'done' ? 'done' : 'open';
        if (_loading) return html`<span class="chip busy">🤝 …</span>`;
        if (!meeting) return html`<span class="chip missing" title="Møtet ble ikke funnet">🤝 møte</span>`;
        const title = meeting.title || 'Møte';
        const date = meeting.date || '';
        const time = meeting.start ? ` ${meeting.start}` : '';
        return html`<span class="chip ${state}" title="Vis i kalender${date ? ' · ' + date + time : ''}">
            🤝 <span class="label">${escapeHtml(title)}</span>${date ? html`<span class="meta">${escapeHtml(date + time)}</span>` : ''}
        </span>`;
    }
}

if (!customElements.get('inline-meeting')) customElements.define('inline-meeting', InlineMeeting);
