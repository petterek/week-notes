/**
 * <task-add-modal> — renders a small "+" trigger button that opens a
 * <modal-container> wrapping a <task-create> form.
 *
 * The modal stays open after a task is created (so multiple tasks can be
 * added in a row); the only way to dismiss it is the default close
 * button (or ✕ / Esc / backdrop). The list of tasks created during the
 * modal session bubble up as 'task:created' events from <task-create>
 * — the host page already listens for those globally.
 *
 * Attributes (all optional, forwarded to <task-create>):
 *   tasks_service   — service path attribute
 *   placeholder     — input placeholder
 *   button-label    — submit button label
 *   trigger-title   — title attr on the + button (default "Ny oppgave")
 *   trigger-label   — text shown in the trigger button (default "+")
 *
 * Public methods:
 *   open()   — open the modal programmatically
 *   close()  — close the modal programmatically
 */
import { WNElement, html } from './_shared.js';
import './task-create.js';
import '../../components/modal-container.js';

const CSS = `
    :host { display: inline-block; }
    .add-btn {
        padding: 2px 10px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: var(--text-on-accent);
        border-radius: 5px;
        cursor: pointer;
        font: inherit;
        font-size: 0.85em;
        line-height: 1.2;
    }
    .add-btn:hover { background: var(--accent-strong, var(--accent)); }
`;

class TaskAddModal extends WNElement {
    static get domain() { return 'tasks'; }
    static get observedAttributes() {
        return ['tasks_service', 'placeholder', 'button-label', 'trigger-title', 'trigger-label'];
    }

    css() { return CSS; }

    open() {
        const m = this.shadowRoot && this.shadowRoot.querySelector('modal-container');
        if (m && typeof m.open === 'function') m.open();
    }

    close() {
        const m = this.shadowRoot && this.shadowRoot.querySelector('modal-container');
        if (m && typeof m.close === 'function') m.close('button');
    }

    connectedCallback() {
        super.connectedCallback();
        if (this._wired) return;
        this._wired = true;
        this.shadowRoot.addEventListener('click', (ev) => {
            const trigger = ev.target.closest('button[data-act="add"]');
            if (!trigger) return;
            this.open();
            const modal = this.shadowRoot.querySelector('modal-container');
            const tc = modal && modal.querySelector('task-create');
            if (tc && typeof tc.focus === 'function') setTimeout(() => tc.focus(), 0);
        });
        this.shadowRoot.addEventListener('task:created', () => {
            const modal = this.shadowRoot.querySelector('modal-container');
            const tc = modal && modal.querySelector('task-create');
            if (tc) {
                tc.value = '';
                if (typeof tc.focus === 'function') setTimeout(() => tc.focus(), 0);
            }
        });
    }

    render() {
        const tasksSvc   = this.getAttribute('tasks_service') || '';
        const placeholder = this.getAttribute('placeholder') || 'Beskriv oppgaven…';
        const btnLabel    = this.getAttribute('button-label') || 'Legg til';
        const trigTitle   = this.getAttribute('trigger-title') || 'Ny oppgave';
        const trigLabel   = this.getAttribute('trigger-label') || '+';
        return html`
            <button type="button" class="add-btn" data-act="add" title="${trigTitle}">${trigLabel}</button>
            <modal-container size="sm">
                <span slot="title">Ny oppgave</span>
                <task-create
                    tasks_service="${tasksSvc}"
                    placeholder="${placeholder}"
                    button-label="${btnLabel}"></task-create>
            </modal-container>
        `;
    }
}

if (!customElements.get('task-add-modal')) customElements.define('task-add-modal', TaskAddModal);
