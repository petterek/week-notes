/**
 * <inline-action kind="task|result" label="text">
 *
 * A styled inline pill rendered for inline-create markers in notes:
 *   {{X}}  → <inline-action kind="task"   label="X">
 *   [[X]]  → <inline-action kind="result" label="X">
 *
 * The pill is purely presentational. The server creates the actual
 * task/result on explicit (non-autosave) save and strips the markers,
 * so once persisted the source is plain text. Until then, the
 * preview shows the user how the marker will appear.
 */
import { WNElement, html, escapeHtml } from './_shared.js';

const STYLES = `
    :host {
        display: inline;
        font: inherit;
    }
    .pill {
        display: inline-block;
        padding: 0 6px;
        border-radius: 4px;
        font-size: 0.92em;
        font-weight: 600;
        line-height: 1.35;
        white-space: pre-wrap;
        vertical-align: baseline;
    }
    .pill.task {
        background: var(--success-soft, #d4f4dd);
        color: var(--success-strong, #1b6b30);
        border: 1px solid var(--success, #2c9c4a);
    }
    .pill.result {
        background: var(--info-soft, #d6e7ff);
        color: var(--info-strong, #1a4c8b);
        border: 1px solid var(--info, #2f7ad9);
    }
`;

class InlineAction extends WNElement {
    static get observedAttributes() { return ['kind', 'label']; }

    css() { return STYLES; }

    render() {
        const kind = (this.getAttribute('kind') || '').toLowerCase() === 'result' ? 'result' : 'task';
        const label = this.getAttribute('label') || this.textContent || '';
        return html`<span class="pill ${kind}" title="${kind === 'task' ? 'Ny oppgave ved lagring' : 'Nytt resultat ved lagring'}">${escapeHtml(label)}</span>`;
    }
}

if (!customElements.get('inline-action')) customElements.define('inline-action', InlineAction);
