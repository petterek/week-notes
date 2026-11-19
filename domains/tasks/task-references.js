import { WNElement, html } from './_shared.js';
import { renderSourceLinks, openNoteSourcePreview, SOURCE_LINK_STYLES } from '/services/_shared/task-source-links.js';

class TaskReferences extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() { return ['taskid', 'tasks_service']; }

    css() {
        return `
            ${SOURCE_LINK_STYLES}
            :host { display: block; margin-top: 16px; color: var(--text); font: inherit; }
            h4 { margin: 12px 0 6px; color: var(--text-muted); }
            p { margin: 0 0 8px; }
            ul { margin: 0; padding-left: 20px; }
            li { margin-bottom: 5px; overflow-wrap: anywhere; }
            a { color: var(--accent); }
            button { color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font: inherit; cursor: pointer; }
        `;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) this.invalidateAwait();
        super.attributeChangedCallback(name, oldValue, newValue);
    }

    loadData() {
        const id = this.getAttribute('taskid');
        if (!id) return null;
        return {
            references: async () => {
                try {
                    if (!this.service?.references) throw new Error('Henvisningstjenesten er ikke tilgjengelig.');
                    const data = await this.service.references(id);
                    if (!data || !Array.isArray(data.mentions) || !('origin' in data)) {
                        throw new Error('Ugyldig henvisningssvar.');
                    }
                    return { data };
                } catch (error) {
                    return { error: error.message };
                }
            },
        };
    }

    render({ references, _loading } = {}) {
        if (!this.getAttribute('taskid')) return '';
        if (_loading) return html`<p role="status">Laster opphav og omtaler…</p>`;
        if (references?.error) return html`
            <p role="alert">Kunne ikke laste opphav og omtaler: ${references.error}</p>
            <button type="button">Prøv igjen</button>
        `;
        const { origin, mentions = [] } = references?.data || {};
        return html`
            <h4>Opphav</h4>
            <p data-origin>${origin ? renderSourceLinks(origin) : 'Ingen kilde registrert.'}</p>
            <h4>Omtalt i</h4>
            ${mentions.length ? html`<ul>${mentions.map(ref => html`<li>${renderSourceLinks(ref)}</li>`)}</ul>`
                : html`<p>Ingen omtaler funnet.</p>`}
        `;
    }

    afterRender() {
        this.shadowRoot.querySelectorAll('a').forEach(anchor => {
            anchor.addEventListener('click', event => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                this.dispatchEvent(new CustomEvent('task-references:navigate', { bubbles: true, composed: true }));
                openNoteSourcePreview(event);
            });
        });
        this.shadowRoot.querySelector('button')?.addEventListener('click', () => {
            this.invalidateAwait();
            this.requestRender();
        });
    }
}

if (!customElements.get('task-references')) customElements.define('task-references', TaskReferences);
