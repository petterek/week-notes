/**
 * <upcoming-meetings days="14" service="MeetingsService"> — sidebar widget
 * listing meetings in the next N days (default 14). Renders inside its own
 * shadow DOM with theming via inherited CSS custom properties.
 *
 * Service contract:
 *   list({ upcoming })  → Promise<Meeting[]>
 *   listTypes()         → Promise<MeetingType[]>
 *
 * Clicking a meeting row dispatches 'upcoming-meetings:open' (cancelable);
 * if not cancelled the component navigates to /calendar/<week>#m-<id>.
 * @mentions bubble 'mention-clicked' (handled at the page level).
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, isoWeek, wireMentionClicks, people as fetchPeople, companies as fetchCompanies } from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; }
    .side-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); border-bottom: 1px solid var(--border-soft);
        padding-bottom: 6px; margin: 18px 0 10px; font-size: 1.05em;
    }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
    .empty-quiet a { color: var(--accent); }
    .sidebar-meetings { display: flex; flex-direction: column; gap: 6px; }
    .sidebar-meeting {
        position: relative; padding: 8px 10px 8px 32px;
        border-radius: 6px; background: var(--surface); cursor: pointer;
    }
    .sidebar-meeting:hover { background: var(--surface-alt); }
    .sidebar-mtg-note {
        position: absolute; left: 8px; top: 8px;
        text-decoration: none; opacity: 0.6; font-size: 1em;
    }
    .sidebar-mtg-note:hover { opacity: 1; }
    .mtg-when { color: var(--text-subtle); font-size: 0.85em; }
    .mtg-when strong { color: var(--text-strong); }
    .mtg-title { font-weight: 500; color: var(--text-strong); }
    .mtg-title a { color: var(--accent); text-decoration: none; }
    .mtg-meta { color: var(--text-subtle); font-size: 0.85em; margin-top: 2px; }
    .mtg-meta a { color: var(--accent); text-decoration: none; }
    .mtg-loc { white-space: nowrap; }
    .mtg-type-icon { margin-right: 4px; }
    .upcoming-cal-link {
        margin-top: 10px; text-align: right; font-size: 0.85em;
    }
    .upcoming-cal-link a { color: var(--accent); text-decoration: none; }
`;

const NB_DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
function dayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (dateStr === todayStr) return 'I dag';
    const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    if (dateStr === tomorrow) return 'I morgen';
    return `${NB_DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

class UpcomingMeetings extends WNElement {
    static get observedAttributes() { return ['days', 'service']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (this.service) this._load();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (this.isConnected && this.service && oldVal !== newVal) this._load();
    }

    async _load() {
        const days = parseInt(this.getAttribute('days') || '14', 10) || 14;
        try {
            const [meetings, people, companies, types] = await Promise.all([
                this.service.list({ upcoming: days }),
                fetchPeople(),
                fetchCompanies(),
                this.service.listTypes(),
            ]);
            this._days = days;
            this._state = {
                meetings: meetings || [],
                people: people || [],
                companies: companies || [],
                types: types || [],
            };
        } catch {
            this._state = { error: true };
        }
        this.requestRender();
        if (!this._wired) {
            this._wired = true;
            this.shadowRoot.addEventListener('click', (ev) => {
                if (ev.target.closest('a, button')) return;
                const card = ev.target.closest('.sidebar-meeting');
                if (!card) return;
                const href = card.getAttribute('data-cal-href');
                if (!href) return;
                const evt = new CustomEvent('upcoming-meetings:open', {
                    bubbles: true, composed: true, cancelable: true,
                    detail: { id: card.dataset.mid, href },
                });
                if (this.dispatchEvent(evt)) window.location.href = href;
            });
            wireMentionClicks(this.shadowRoot);
        }
    }

    render() {
        if (!this.service) return this.renderNoService();
        if (!this._state) return html`<h3 class="side-h">📅 Kommende møter</h3><p class="empty-quiet">Laster…</p>`;
        if (this._state.error) return html`<h3 class="side-h">📅 Kommende møter</h3><p class="empty-quiet">Kunne ikke laste møter</p>`;

        const { meetings, people, companies, types } = this._state;
        if (meetings.length === 0) {
            return html`
                <h3 class="side-h">📅 Kommende møter · 0</h3>
                <p class="empty-quiet">Ingen møter de neste ${this._days || 14} dagene. ${unsafeHTML('<a href="/calendar">Legg til</a>')}</p>
            `;
        }
        const typeMap = {};
        types.forEach(t => { typeMap[t.key] = t; });

        const rows = meetings.map(m => {
            const time = m.start
                ? escapeHtml(m.start) + (m.end ? `–${escapeHtml(m.end)}` : '')
                : 'Hele dagen';
            const att = (m.attendees || [])
                .map(a => `<a class="mention-link" data-person-key="${escapeHtml(a)}" href="/people#${escapeHtml(a)}">@${escapeHtml(a)}</a>`)
                .join(' ');
            const loc = m.location ? `<span class="mtg-loc">📍 ${escapeHtml(m.location)}</span>` : '';
            const t = typeMap[m.type];
            const typeHtml = t && t.icon
                ? `<span class="mtg-type-icon" title="${escapeHtml(t.label || '')}">${t.icon}</span> `
                : '';
            const calHref = `/calendar/${escapeHtml(isoWeek(new Date(m.date + 'T00:00:00Z')))}#m-${encodeURIComponent(m.id)}`;
            return `
                <div class="sidebar-meeting" data-mid="${escapeHtml(m.id)}" data-cal-href="${calHref}" title="Åpne i kalender">
                    <a class="sidebar-mtg-note" href="/meeting-note/${encodeURIComponent(m.id)}" title="Åpne møtenotat">📝</a>
                    <div class="mtg-when"><strong>${escapeHtml(dayLabel(m.date))}</strong> · ${time}</div>
                    <div class="mtg-title">${typeHtml}${linkMentions(escapeHtml(m.title), people, companies)}</div>
                    ${att || loc ? `<div class="mtg-meta">${att}${att && loc ? ' · ' : ''}${loc}</div>` : ''}
                </div>
            `;
        }).join('');

        return html`
            <h3 class="side-h">📅 Kommende møter · ${meetings.length}</h3>
            <div class="sidebar-meetings">${unsafeHTML(rows)}</div>
            <div class="upcoming-cal-link">${unsafeHTML('<a href="/calendar">Åpne kalender →</a>')}</div>
        `;
    }
}

if (!customElements.get('upcoming-meetings')) customElements.define('upcoming-meetings', UpcomingMeetings);
