/**
 * <week-list service="NotesService"> — fetches the available weeks via
 * NotesService.listWeeks() and renders one <week-section> per week.
 * Each rendered <week-section> inherits the same service name, so the
 * caller only has to wire it once.
 *
 * Renders inside its own shadow DOM with theming via inherited CSS
 * custom properties.
 */
import { WNElement, html, unsafeHTML, escapeHtml } from './_shared.js';

const STYLES = `
    :host { display: block; color: var(--text-strong); font: inherit; }
    .empty-quiet { color: var(--text-subtle); font-style: italic; margin: 0; }
    ::slotted(*), week-section { display: block; }
`;

class WeekList extends WNElement {
    static get domain() { return 'notes'; }
    static get observedAttributes() { return ['notes_service']; }

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
        try {
            const weeks = await this.service.listWeeks();
            this._state = { weeks: weeks || [] };
        } catch {
            this._state = { error: true };
        }
        this.requestRender();
    }

    render() {
        if (!this.service) return this.renderNoService();
        if (!this._state) return html`<p class="empty-quiet">Laster uker…</p>`;
        if (this._state.error) return html`<p class="empty-quiet">Kunne ikke laste uker</p>`;

        const { weeks } = this._state;
        if (weeks.length === 0) {
            return html`<p class="empty-quiet">Ingen uker funnet.</p>`;
        }
        // Forward the suite of services to each <week-section> child.
        // Primary `notes_service` is used as default for the secondaries
        // when not explicitly provided.
        const notesSrv     = this.getAttribute('notes_service')     || '';
        const resultsSrv   = this.getAttribute('results_service')   || '';
        const tasksSrv     = this.getAttribute('tasks_service')     || '';
        const peopleSrv    = this.getAttribute('people_service')    || '';
        const companiesSrv = this.getAttribute('companies_service') || '';
        const attrs = (w) =>
            `week="${escapeHtml(w)}" notes_service="${escapeHtml(notesSrv)}"` +
            (resultsSrv   ? ` results_service="${escapeHtml(resultsSrv)}"`     : '') +
            (tasksSrv     ? ` tasks_service="${escapeHtml(tasksSrv)}"`         : '') +
            (peopleSrv    ? ` people_service="${escapeHtml(peopleSrv)}"`       : '') +
            (companiesSrv ? ` companies_service="${escapeHtml(companiesSrv)}"` : '');
        const sections = weeks
            .map(w => `<week-section ${attrs(w)}></week-section>`)
            .join('');
        return html`${unsafeHTML(sections)}`;
    }
}

if (!customElements.get('week-list')) customElements.define('week-list', WeekList);
