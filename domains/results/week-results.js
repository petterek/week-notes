/**
 * <week-results week="YYYY-WNN" service="ResultsService"> — sidebar list of
 * results for one ISO week. Renders inside its own shadow DOM with theming
 * via inherited CSS custom properties.
 *
 * Service contract:
 *   list({ week? }) → Promise<Result[]>
 */
import { WNElement, html, unsafeHTML, escapeHtml, linkMentions, wireMentionClicks, isoWeek } from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; font-size: 0.92em; }
    .sec-h {
        font-family: var(--font-heading); font-weight: 400;
        color: var(--accent); border-bottom: 1px solid var(--border-soft);
        padding-bottom: 6px; margin: 0 0 10px; font-size: 1.05em;
    }
    .sec-h .c { color: var(--text-subtle); font-size: 0.85em; margin-left: 4px; }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
    .result {
        padding: 6px 8px; border-radius: 6px; background: var(--surface);
        margin-bottom: 6px;
    }
    .result a { color: var(--accent); text-decoration: none; }
    .result a:hover { text-decoration: underline; }
    .meta {
        display: flex; justify-content: space-between; gap: 8px;
        margin-top: 4px; color: var(--text-subtle); font-size: 0.85em;
    }
`;

function inWeek(r, week) {
    if (r.week === week) return true;
    if (r.created && isoWeek(new Date(r.created)) === week) return true;
    return false;
}

class WeekResults extends WNElement {
    static get domain() { return 'results'; }
    static get observedAttributes() { return ['week', 'results_service', 'people_service', 'companies_service']; }

    css() { return STYLES; }

    connectedCallback() {
        super.connectedCallback();
        if (!this._wired) {
            this._wired = true;
            wireMentionClicks(this.shadowRoot);
        }
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) this.invalidateAwait();
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    loadData() {
        if (!this.service) return null;
        const week = this.getAttribute('week');
        const peopleSvc = this.serviceFor('people');
        const compSvc = this.serviceFor('companies');
        return {
            results: async () => {
                const all = await this.service.list({ week });
                return (all || []).filter(r => inWeek(r, week));
            },
            people:    () => peopleSvc ? peopleSvc.list() : Promise.resolve([]),
            companies: () => compSvc   ? compSvc.list()   : Promise.resolve([]),
        };
    }

    render(data = {}) {
        if (!this.service) return this.renderNoService();
        if (data._loading) return html`<h3 class="sec-h">Resultater</h3><p class="empty-quiet">Laster…</p>`;
        const results = Array.isArray(data.results) ? data.results : null;
        if (!results) return html`<h3 class="sec-h">Resultater</h3><p class="empty-quiet">Kunne ikke laste</p>`;
        const people = data.people || [];
        const companies = data.companies || [];

        if (results.length === 0) {
            return html`<h3 class="sec-h">Resultater <span class="c">0</span></h3><p class="empty-quiet">Ingen resultater</p>`;
        }
        const rows = results.map(r => {
            const dShort = r.created ? `${r.created.slice(8, 10)}.${r.created.slice(5, 7)}` : '';
            const peopleStr = (r.people && r.people.length > 0)
                ? linkMentions(r.people.map(p => `@${escapeHtml(p)}`).join(', '), people, companies)
                : '';
            const textHtml = unsafeHTML(linkMentions(escapeHtml(r.text), people, companies));
            const peopleHtml = unsafeHTML(peopleStr);
            const sentimentIcon = r.sentiment === 'good' ? '🟢 ' : r.sentiment === 'bad' ? '🔴 ' : '';
            return html`
                <div class="result">
                    ${sentimentIcon}${textHtml}
                    <div class="meta"><span>${peopleHtml}</span><span>${dShort}</span></div>
                </div>
            `;
        });
        return html`
            <h3 class="sec-h">Resultater <span class="c">${results.length}</span></h3>
            ${rows}
        `;
    }
}

if (!customElements.get('week-results')) customElements.define('week-results', WeekResults);
